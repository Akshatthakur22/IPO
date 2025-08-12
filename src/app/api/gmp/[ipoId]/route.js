import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db.js';
import { cache } from '../../../../lib/cache.js';
import { requireAuth } from '../../../../lib/auth.js';
import { gmpTrackerService } from '../../../../services/gmp-tracker.js';

// Get GMP data for specific IPO
export async function GET(request, { params }) {
  try {
    const { ipoId } = params;
    const { searchParams } = new URL(request.url);

    const timeRange = parseInt(searchParams.get('timeRange')) || 30;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 500);
    const includeStats = searchParams.get('includeStats') !== 'false';
    const includeTrends = searchParams.get('includeTrends') === 'true';
    const live = searchParams.get('live') === 'true';
    const groupBy = searchParams.get('groupBy'); // hourly, daily

    // Validate IPO ID
    if (!ipoId) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO ID is required',
        },
        { status: 400 }
      );
    }

    // Build cache key
    const cacheKey = cache.key(
      'GMP',
      `ipo:${ipoId}:${JSON.stringify({
        timeRange,
        limit,
        includeStats,
        includeTrends,
        groupBy,
      })}`
    );

    // Try cache first (skip for live requests)
    if (!live) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Verify IPO exists
    const ipo = await prisma.iPO.findUnique({
      where: { id: ipoId },
      select: {
        id: true,
        symbol: true,
        name: true,
        status: true,
        maxPrice: true,
        minPrice: true,
      },
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not found',
        },
        { status: 404 }
      );
    }

    // Build time filter
    const since = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

    // Get GMP data
    let gmpData = await prisma.gMP.findMany({
      where: {
        ipoId,
        timestamp: { gte: since },
      },
      select: {
        id: true,
        value: true,
        percentage: true,
        volume: true,
        bidPrice: true,
        askPrice: true,
        source: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Get live data if requested
    if (live && gmpTrackerService.getStatus().isRunning) {
      try {
        const liveGMP = await gmpTrackerService.forceTrackIPO(ipoId);
        if (liveGMP && liveGMP.timestamp > (gmpData[0]?.timestamp || 0)) {
          gmpData.unshift({
            id: `live_${Date.now()}`,
            value: liveGMP.value,
            percentage: liveGMP.percentage,
            volume: liveGMP.volume,
            bidPrice: liveGMP.bidPrice,
            askPrice: liveGMP.askPrice,
            source: 'live_service',
            timestamp: new Date(liveGMP.timestamp),
          });
        }
      } catch (error) {
        console.warn('Live GMP fetch failed:', error.message);
      }
    }

    // Group data if requested
    if (groupBy && gmpData.length > 0) {
      gmpData = groupGMPData(gmpData, groupBy);
    }

    // Generate statistics
    let statistics = null;
    if (includeStats && gmpData.length > 0) {
      const values = gmpData.map((g) => g.value).filter((v) => v !== null);
      const volumes = gmpData.map((g) => g.volume || 0);

      statistics = {
        count: gmpData.length,
        current: gmpData[0] || null,
        average:
          values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
        highest: values.length > 0 ? Math.max(...values) : 0,
        lowest: values.length > 0 ? Math.min(...values) : 0,
        totalVolume: volumes.reduce((a, b) => a + b, 0),
        volatility: calculateVolatility(values),
        priceRange: {
          gmpRange: values.length > 0 ? Math.max(...values) - Math.min(...values) : 0,
          percentageRange: ipo.maxPrice
            ? (((Math.max(...values) - Math.min(...values)) / ipo.maxPrice) * 100).toFixed(2)
            : 0,
        },
      };
    }

    // Generate trends
    let trends = null;
    if (includeTrends && gmpData.length >= 5) {
      trends = {
        direction: calculateTrend(gmpData.map((g) => g.value)),
        momentum: calculateMomentum(gmpData.slice(0, 10)),
        support: findSupportLevel(gmpData.map((g) => g.value)),
        resistance: findResistanceLevel(gmpData.map((g) => g.value)),
      };
    }

    const response = {
      success: true,
      ipo: {
        id: ipo.id,
        symbol: ipo.symbol,
        name: ipo.name,
        status: ipo.status,
        priceRange: { min: ipo.minPrice, max: ipo.maxPrice },
      },
      data: gmpData,
      statistics,
      trends,
      metadata: {
        timeRange,
        limit,
        totalRecords: gmpData.length,
        includeStats,
        includeTrends,
        groupBy,
        live,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache for 2 minutes (short for IPO-specific data)
    if (!live) {
      await cache.set(cacheKey, response, 120);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`GET /api/gmp/${params?.ipoId} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch IPO GMP data',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Add GMP data for specific IPO (Admin only)
export async function POST(request, { params }) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const { ipoId } = params;
    const body = await request.json();
    const { value, volume, source, bidPrice, askPrice, timestamp, metadata } = body;

    if (!ipoId || !value) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO ID and GMP value are required',
        },
        { status: 400 }
      );
    }

    // Verify IPO exists and get max price for percentage calculation
    const ipo = await prisma.iPO.findUnique({
      where: { id: ipoId },
      select: { maxPrice: true, symbol: true },
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not found',
        },
        { status: 404 }
      );
    }

    // Calculate percentage
    const percentage = ipo.maxPrice ? (parseFloat(value) / ipo.maxPrice) * 100 : 0;

    // Create GMP record
    const gmpRecord = await prisma.gMP.create({
      data: {
        ipoId,
        value: parseFloat(value),
        percentage: parseFloat(percentage.toFixed(2)),
        volume: volume ? parseInt(volume) : null,
        source: source || 'manual',
        bidPrice: bidPrice ? parseFloat(bidPrice) : null,
        askPrice: askPrice ? parseFloat(askPrice) : null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Clear relevant caches
    await cache.del(cache.key('GMP', `ipo:${ipoId}:*`));
    await cache.del(cache.key('GMP', 'data:*'));

    return NextResponse.json({
      success: true,
      data: {
        ...gmpRecord,
        spread:
          gmpRecord.askPrice && gmpRecord.bidPrice ? gmpRecord.askPrice - gmpRecord.bidPrice : null,
      },
      ipo: { symbol: ipo.symbol },
      message: 'GMP data added successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`POST /api/gmp/${params?.ipoId} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to add GMP data',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Delete GMP data for specific IPO (Admin only)
export async function DELETE(request, { params }) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const { ipoId } = params;
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('recordId');
    const olderThan = parseInt(searchParams.get('olderThan'));
    const all = searchParams.get('all') === 'true';

    if (!ipoId) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO ID is required',
        },
        { status: 400 }
      );
    }

    let whereClause = { ipoId };

    if (recordId) {
      whereClause.id = recordId;
    } else if (olderThan) {
      whereClause.timestamp = {
        lt: new Date(Date.now() - olderThan * 24 * 60 * 60 * 1000),
      };
    } else if (!all) {
      return NextResponse.json(
        {
          success: false,
          error: 'Specify recordId, olderThan, or all=true',
        },
        { status: 400 }
      );
    }

    const result = await prisma.gMP.deleteMany({
      where: whereClause,
    });

    // Clear caches
    await cache.del(cache.key('GMP', `ipo:${ipoId}:*`));
    await cache.del(cache.key('GMP', 'data:*'));

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
      message: `Deleted ${result.count} GMP records for IPO`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`DELETE /api/gmp/${params?.ipoId} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete GMP data',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Helper functions
function groupGMPData(data, groupBy) {
  if (groupBy === 'hourly') {
    return groupByHour(data);
  } else if (groupBy === 'daily') {
    return groupByDay(data);
  }
  return data;
}

function groupByHour(data) {
  const grouped = new Map();

  data.forEach((item) => {
    const hour = new Date(item.timestamp).setMinutes(0, 0, 0);
    const key = hour.toString();

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return Array.from(grouped.entries())
    .map(([timestamp, items]) => ({
      timestamp: new Date(parseInt(timestamp)),
      value: items.reduce((sum, item) => sum + item.value, 0) / items.length,
      volume: items.reduce((sum, item) => sum + (item.volume || 0), 0),
      high: Math.max(...items.map((item) => item.value)),
      low: Math.min(...items.map((item) => item.value)),
      count: items.length,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function groupByDay(data) {
  const grouped = new Map();

  data.forEach((item) => {
    const day = new Date(item.timestamp).setHours(0, 0, 0, 0);
    const key = day.toString();

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return Array.from(grouped.entries())
    .map(([timestamp, items]) => ({
      timestamp: new Date(parseInt(timestamp)),
      value: items.reduce((sum, item) => sum + item.value, 0) / items.length,
      volume: items.reduce((sum, item) => sum + (item.volume || 0), 0),
      high: Math.max(...items.map((item) => item.value)),
      low: Math.min(...items.map((item) => item.value)),
      count: items.length,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function calculateVolatility(values) {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function calculateTrend(values) {
  if (values.length < 3) return 'stable';

  const recent = values.slice(0, Math.ceil(values.length / 3));
  const older = values.slice(-Math.ceil(values.length / 3));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 10) return 'bullish';
  if (change < -10) return 'bearish';
  return 'stable';
}

function calculateMomentum(recentData) {
  if (recentData.length < 3) return 0;

  const values = recentData.map((d) => d.value);
  const weights = recentData.map((_, i) => recentData.length - i); // More weight to recent

  let weightedSum = 0;
  let totalWeight = 0;

  values.forEach((value, i) => {
    weightedSum += value * weights[i];
    totalWeight += weights[i];
  });

  const weightedAvg = weightedSum / totalWeight;
  const simpleAvg = values.reduce((a, b) => a + b, 0) / values.length;

  return (((weightedAvg - simpleAvg) / simpleAvg) * 100).toFixed(2);
}

function findSupportLevel(values) {
  if (values.length < 5) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const quartile1 = sorted[Math.floor(sorted.length * 0.25)];

  return Math.round(quartile1);
}

function findResistanceLevel(values) {
  if (values.length < 5) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const quartile3 = sorted[Math.floor(sorted.length * 0.75)];

  return Math.round(quartile3);
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
