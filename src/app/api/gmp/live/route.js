// Live GMP API Routes
// GET /api/gmp/live - Real-time GMP data with WebSocket integration

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';
import { cache } from '../../../../lib/cache';
import { webSocketService } from '../../../../lib/websocket';

// GET /api/gmp/live?symbols=SYM1,SYM2&ipoIds=id1,id2
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    const ipoIdsParam = searchParams.get('ipoIds');
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const historyDays = Math.min(parseInt(searchParams.get('historyDays')) || 7, 30);

    if (!symbolsParam && !ipoIdsParam) {
      return NextResponse.json(
        { error: 'Either symbols or ipoIds parameter is required' },
        { status: 400 }
      );
    }

    let whereClause = {};

    if (symbolsParam) {
      const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
      whereClause = {
        symbol: { in: symbols },
        isActive: true,
      };
    } else if (ipoIdsParam) {
      const ipoIds = ipoIdsParam.split(',').map((id) => id.trim());
      whereClause = {
        id: { in: ipoIds },
        isActive: true,
      };
    }

    // Fetch IPOs with latest GMP data
    const ipos = await prisma.iPO.findMany({
      where: whereClause,
      select: {
        id: true,
        symbol: true,
        name: true,
        status: true,
        minPrice: true,
        maxPrice: true,
        openDate: true,
        closeDate: true,
        gmp: {
          orderBy: { timestamp: 'desc' },
          take: includeHistory ? historyDays * 24 : 1, // Assume hourly data
          select: {
            id: true,
            value: true,
            percentage: true,
            source: true,
            volume: true,
            timestamp: true,
          },
        },
      },
    });

    if (ipos.length === 0) {
      return NextResponse.json({
        gmpData: [],
        message: 'No IPOs found',
        timestamp: new Date().toISOString(),
      });
    }

    // Enhance with live cache data and calculations
    const enhancedData = await Promise.all(
      ipos.map(async (ipo) => {
        // Get cached live GMP if available
        const liveGMP = await cache.getCachedLiveGMP(ipo.id);
        const latestGMP = ipo.gmp[0] || null;

        // Use live data if fresher than database data
        const currentGMP =
          liveGMP && liveGMP.timestamp > (latestGMP?.timestamp || 0) ? liveGMP : latestGMP;

        // Calculate GMP statistics if history is requested
        let gmpStats = null;
        if (includeHistory && ipo.gmp.length > 1) {
          const values = ipo.gmp.map((g) => Number(g.value));
          const percentages = ipo.gmp.map((g) => Number(g.percentage));

          gmpStats = {
            count: values.length,
            average: values.reduce((a, b) => a + b, 0) / values.length,
            max: Math.max(...values),
            min: Math.min(...values),
            latest: values[0],
            change24h: values.length > 1 ? values[0] - values[values.length - 1] : 0,
            volatility: calculateVolatility(values),
            trend: calculateTrend(values),
            averagePercentage: percentages.reduce((a, b) => a + b, 0) / percentages.length,
          };
        }

        // Calculate potential returns
        const potentialReturns = calculatePotentialReturns(ipo, currentGMP);

        return {
          ipoId: ipo.id,
          symbol: ipo.symbol,
          name: ipo.name,
          status: ipo.status,
          priceRange: {
            min: ipo.minPrice ? Number(ipo.minPrice) : null,
            max: ipo.maxPrice ? Number(ipo.maxPrice) : null,
          },
          dates: {
            open: ipo.openDate,
            close: ipo.closeDate,
          },
          currentGMP: currentGMP
            ? {
                value: Number(currentGMP.value),
                percentage: Number(currentGMP.percentage),
                source: currentGMP.source || 'market',
                volume: currentGMP.volume || null,
                timestamp: currentGMP.timestamp,
                isLive: !!liveGMP,
              }
            : null,
          gmpHistory: includeHistory
            ? ipo.gmp.map((gmp) => ({
                value: Number(gmp.value),
                percentage: Number(gmp.percentage),
                source: gmp.source,
                volume: gmp.volume,
                timestamp: gmp.timestamp,
              }))
            : null,
          statistics: gmpStats,
          potentialReturns,
          lastUpdated: currentGMP?.timestamp || new Date().toISOString(),
        };
      })
    );

    const response = {
      gmpData: enhancedData,
      metadata: {
        totalIPOs: enhancedData.length,
        liveDataCount: enhancedData.filter((d) => d.currentGMP?.isLive).length,
        includeHistory,
        historyDays: includeHistory ? historyDays : 0,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache the response briefly for performance
    const cacheKey = `live_gmp_${symbolsParam || ipoIdsParam}_${includeHistory}_${historyDays}`;
    await cache.set(cacheKey, response, 30); // 30 seconds cache

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch live GMP data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch live GMP data',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// POST /api/gmp/live - Update GMP data (for authorized sources)
export async function POST(request) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Updates must be an array' }, { status: 400 });
    }

    const results = [];
    const validUpdates = [];

    // Validate and process updates
    for (const update of updates) {
      try {
        const { ipoId, symbol, value, percentage, source, volume } = update;

        if (!ipoId && !symbol) {
          results.push({
            status: 'error',
            error: 'Either ipoId or symbol is required',
            data: update,
          });
          continue;
        }

        if (typeof value !== 'number') {
          results.push({
            status: 'error',
            error: 'Value must be a number',
            data: update,
          });
          continue;
        }

        // Find IPO
        let ipo;
        if (ipoId) {
          ipo = await prisma.iPO.findUnique({ where: { id: ipoId } });
        } else {
          ipo = await prisma.iPO.findUnique({
            where: { symbol: symbol.toUpperCase() },
          });
        }

        if (!ipo) {
          results.push({
            status: 'error',
            error: 'IPO not found',
            data: update,
          });
          continue;
        }

        // Calculate percentage if not provided
        const calculatedPercentage =
          percentage || (ipo.minPrice ? (value / Number(ipo.minPrice)) * 100 - 100 : 0);

        const gmpData = {
          ipoId: ipo.id,
          value: value,
          percentage: calculatedPercentage,
          source: source || 'api',
          volume: volume || null,
          timestamp: new Date(),
          date: new Date(),
        };

        validUpdates.push(gmpData);
        results.push({
          ipoId: ipo.id,
          symbol: ipo.symbol,
          status: 'queued',
          data: gmpData,
        });
      } catch (error) {
        results.push({
          status: 'error',
          error: error.message,
          data: update,
        });
      }
    }

    // Batch insert valid updates
    if (validUpdates.length > 0) {
      try {
        await prisma.gMP.createMany({
          data: validUpdates,
        });

        // Update cache and broadcast real-time updates
        for (const gmpData of validUpdates) {
          // Cache live GMP data
          await cache.cacheLiveGMP(gmpData.ipoId, gmpData.value);

          // Find IPO symbol for WebSocket broadcast
          const ipo = await prisma.iPO.findUnique({
            where: { id: gmpData.ipoId },
            select: { symbol: true },
          });

          if (ipo && webSocketService.io) {
            // Broadcast to WebSocket subscribers
            webSocketService.broadcastGMPUpdate(gmpData.ipoId, {
              value: gmpData.value,
              percentage: gmpData.percentage,
              source: gmpData.source,
              volume: gmpData.volume,
              timestamp: gmpData.timestamp,
            });
          }
        }

        console.log(`✅ Processed ${validUpdates.length} GMP updates`);
      } catch (dbError) {
        console.error('Database insert failed:', dbError);
        return NextResponse.json(
          { error: 'Failed to save GMP updates', message: dbError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      message: `Processed ${results.length} updates`,
      successful: validUpdates.length,
      failed: results.length - validUpdates.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to update GMP data:', error);
    return NextResponse.json(
      { error: 'Failed to update GMP data', message: error.message },
      { status: 500 }
    );
  }
}

// Utility functions
function calculateVolatility(values) {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateTrend(values) {
  if (values.length < 2) return 'neutral';

  const recent = values.slice(0, Math.min(5, values.length));
  const older = values.slice(Math.min(5, values.length));

  if (older.length === 0) return 'neutral';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = recentAvg - olderAvg;
  const threshold = olderAvg * 0.05; // 5% threshold

  if (diff > threshold) return 'bullish';
  if (diff < -threshold) return 'bearish';
  return 'neutral';
}

function calculatePotentialReturns(ipo, gmp) {
  if (!gmp || !ipo.minPrice || !ipo.maxPrice) return null;

  const minPrice = Number(ipo.minPrice);
  const maxPrice = Number(ipo.maxPrice);
  const gmpValue = Number(gmp.value);

  const expectedListingPrice = minPrice + gmpValue;

  return {
    atMinPrice: {
      investment: minPrice,
      expectedReturn: gmpValue,
      returnPercentage: (gmpValue / minPrice) * 100,
    },
    atMaxPrice: {
      investment: maxPrice,
      expectedReturn: expectedListingPrice - maxPrice,
      returnPercentage: ((expectedListingPrice - maxPrice) / maxPrice) * 100,
    },
    expectedListingPrice,
    breakeven: {
      minGMP: -minPrice,
      maxGMP: -maxPrice,
    },
  };
}
