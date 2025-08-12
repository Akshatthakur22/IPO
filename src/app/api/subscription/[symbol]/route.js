import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.js";
import { cache } from "../../../../lib/cache.js";
import { requireAuth } from "../../../../lib/auth.js";
import { subscriptionTrackerService } from "../../../../services/subscription-tracker.js";

// Get subscription data for specific IPO symbol
export async function GET(request, { params }) {
  try {
    const { symbol } = params;
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const timeRange = parseInt(searchParams.get("timeRange")) || 7;
    const limit = Math.min(parseInt(searchParams.get("limit")) || 100, 500);
    const includeStats = searchParams.get("includeStats") !== "false";
    const includeTrends = searchParams.get("includeTrends") === "true";
    const live = searchParams.get("live") === "true";
    const groupBy = searchParams.get("groupBy"); // hourly, daily, category

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          error: "Symbol is required",
        },
        { status: 400 }
      );
    }

    // Build cache key
    const cacheKey = cache.key(
      "SUBSCRIPTION",
      `symbol:${symbol}:${JSON.stringify({
        category,
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

    // Find IPO by symbol
    const ipo = await prisma.iPO.findUnique({
      where: { symbol: symbol.toUpperCase() },
      select: {
        id: true,
        symbol: true,
        name: true,
        status: true,
        issueSize: true,
        openDate: true,
        closeDate: true,
      },
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: "IPO not found",
        },
        { status: 404 }
      );
    }

    // Build time filter
    const since = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    const whereClause = {
      ipoId: ipo.id,
      timestamp: { gte: since },
    };

    if (category) {
      whereClause.category = category.toUpperCase();
    }

    // Get subscription data
    let subscriptionData = await prisma.subscriptionData.findMany({
      where: whereClause,
      select: {
        id: true,
        category: true,
        subCategory: true,
        quantity: true,
        bidCount: true,
        subscriptionRatio: true,
        timestamp: true,
        metadata: true,
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    // Get live data if requested
    if (live && subscriptionTrackerService.getStatus().isRunning) {
      try {
        const liveData = await subscriptionTrackerService.forceTrackIPO(ipo.id);
        if (
          liveData &&
          liveData.timestamp > (subscriptionData[0]?.timestamp || 0)
        ) {
          subscriptionData.unshift({
            id: `live_${Date.now()}`,
            category: liveData.category || "OVERALL",
            subCategory: null,
            quantity: liveData.quantity,
            bidCount: liveData.bidCount,
            subscriptionRatio: liveData.subscriptionRatio,
            timestamp: new Date(liveData.timestamp),
            metadata: null,
            source: "live_service",
          });
        }
      } catch (error) {
        console.warn("Live subscription fetch failed:", error.message);
      }
    }

    // Group data if requested
    if (groupBy && subscriptionData.length > 0) {
      subscriptionData = groupSubscriptionData(subscriptionData, groupBy);
    }

    // Generate statistics
    let statistics = null;
    if (includeStats && subscriptionData.length > 0) {
      statistics = generateSubscriptionStats(subscriptionData, ipo);
    }

    // Generate trends
    let trends = null;
    if (includeTrends && subscriptionData.length >= 5) {
      trends = generateTrendAnalysis(subscriptionData);
    }

    const response = {
      success: true,
      ipo: {
        id: ipo.id,
        symbol: ipo.symbol,
        name: ipo.name,
        status: ipo.status,
        issueSize: ipo.issueSize?.toString(),
        timeline: {
          openDate: ipo.openDate,
          closeDate: ipo.closeDate,
          daysRemaining: ipo.closeDate
            ? Math.max(
                0,
                Math.ceil(
                  (new Date(ipo.closeDate) - new Date()) / (1000 * 60 * 60 * 24)
                )
              )
            : null,
        },
      },
      data: subscriptionData,
      statistics,
      trends,
      metadata: {
        symbol,
        category,
        timeRange,
        limit,
        totalRecords: subscriptionData.length,
        includeStats,
        includeTrends,
        groupBy,
        live,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache for 2 minutes (short for symbol-specific data)
    if (!live) {
      await cache.set(cacheKey, response, 120);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`GET /api/subscription/${params?.symbol} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch subscription data",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Add subscription data for specific symbol (Admin only)
export async function POST(request, { params }) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const { symbol } = params;
    const body = await request.json();
    const {
      category,
      subCategory,
      quantity,
      bidCount,
      subscriptionRatio,
      timestamp,
      metadata,
    } = body;

    if (!symbol || !category || !subscriptionRatio) {
      return NextResponse.json(
        {
          success: false,
          error: "Symbol, category, and subscription ratio are required",
        },
        { status: 400 }
      );
    }

    // Find IPO by symbol
    const ipo = await prisma.iPO.findUnique({
      where: { symbol: symbol.toUpperCase() },
      select: { id: true, symbol: true },
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: "IPO not found",
        },
        { status: 404 }
      );
    }

    // Create subscription record
    const subscriptionRecord = await prisma.subscriptionData.create({
      data: {
        ipoId: ipo.id,
        category: category.toUpperCase(),
        subCategory: subCategory?.toUpperCase() || null,
        quantity: quantity ? BigInt(quantity) : null,
        bidCount: bidCount ? parseInt(bidCount) : null,
        subscriptionRatio: parseFloat(subscriptionRatio),
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Clear relevant caches
    await cache.del(cache.key("SUBSCRIPTION", `symbol:${symbol}:*`));
    await cache.del(cache.key("SUBSCRIPTION", "data:*"));

    return NextResponse.json({
      success: true,
      data: {
        ...subscriptionRecord,
        quantity: subscriptionRecord.quantity?.toString(),
      },
      ipo: { symbol: ipo.symbol },
      message: "Subscription data added successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`POST /api/subscription/${params?.symbol} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to add subscription data",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Delete subscription data for specific symbol (Admin only)
export async function DELETE(request, { params }) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const { symbol } = params;
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get("recordId");
    const category = searchParams.get("category");
    const olderThan = parseInt(searchParams.get("olderThan"));
    const all = searchParams.get("all") === "true";

    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          error: "Symbol is required",
        },
        { status: 400 }
      );
    }

    // Find IPO by symbol
    const ipo = await prisma.iPO.findUnique({
      where: { symbol: symbol.toUpperCase() },
      select: { id: true },
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: "IPO not found",
        },
        { status: 404 }
      );
    }

    let whereClause = { ipoId: ipo.id };

    if (recordId) {
      whereClause.id = recordId;
    } else if (category) {
      whereClause.category = category.toUpperCase();
    } else if (olderThan) {
      whereClause.timestamp = {
        lt: new Date(Date.now() - olderThan * 24 * 60 * 60 * 1000),
      };
    } else if (!all) {
      return NextResponse.json(
        {
          success: false,
          error: "Specify recordId, category, olderThan, or all=true",
        },
        { status: 400 }
      );
    }

    const result = await prisma.subscriptionData.deleteMany({
      where: whereClause,
    });

    // Clear caches
    await cache.del(cache.key("SUBSCRIPTION", `symbol:${symbol}:*`));
    await cache.del(cache.key("SUBSCRIPTION", "data:*"));

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
      message: `Deleted ${result.count} subscription records for ${symbol}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`DELETE /api/subscription/${params?.symbol} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete subscription data",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Helper functions
function groupSubscriptionData(data, groupBy) {
  switch (groupBy) {
    case "category":
      return groupByCategory(data);
    case "hourly":
      return groupByHour(data);
    case "daily":
      return groupByDay(data);
    default:
      return data;
  }
}

function groupByCategory(data) {
  const grouped = new Map();

  data.forEach((item) => {
    const key = item.category;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return Array.from(grouped.entries()).map(([category, items]) => {
    const latest = items.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    )[0];
    return {
      category,
      subscriptionRatio: latest.subscriptionRatio,
      quantity: items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
      ),
      bidCount: items.reduce((sum, item) => sum + (item.bidCount || 0), 0),
      recordCount: items.length,
      latestTimestamp: latest.timestamp,
      trend: calculateTrend(items.map((i) => i.subscriptionRatio)),
    };
  });
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
      subscriptionRatio: Math.max(...items.map((i) => i.subscriptionRatio)),
      totalQuantity: items.reduce((sum, i) => sum + Number(i.quantity || 0), 0),
      totalBids: items.reduce((sum, i) => sum + (i.bidCount || 0), 0),
      recordCount: items.length,
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
      subscriptionRatio: Math.max(...items.map((i) => i.subscriptionRatio)),
      totalQuantity: items.reduce((sum, i) => sum + Number(i.quantity || 0), 0),
      totalBids: items.reduce((sum, i) => sum + (i.bidCount || 0), 0),
      recordCount: items.length,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function generateSubscriptionStats(data, ipo) {
  const ratios = data.map((s) => s.subscriptionRatio).filter((r) => r !== null);
  const quantities = data.map((s) => Number(s.quantity || 0));
  const bidCounts = data.map((s) => s.bidCount || 0);

  // Group by category
  const byCategory = {};
  data.forEach((s) => {
    if (!byCategory[s.category]) {
      byCategory[s.category] = {
        records: [],
        latestRatio: 0,
        totalQuantity: 0,
        totalBids: 0,
      };
    }
    byCategory[s.category].records.push(s);
    byCategory[s.category].latestRatio = Math.max(
      byCategory[s.category].latestRatio,
      s.subscriptionRatio
    );
    byCategory[s.category].totalQuantity += Number(s.quantity || 0);
    byCategory[s.category].totalBids += s.bidCount || 0;
  });

  return {
    count: data.length,
    current: data[0] || null,
    peak: ratios.length > 0 ? Math.max(...ratios) : 0,
    average:
      ratios.length > 0
        ? (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)
        : 0,
    totalQuantity: quantities.reduce((a, b) => a + b, 0),
    totalBids: bidCounts.reduce((a, b) => a + b, 0),
    oversubscribed: ratios.filter((r) => r > 1).length,
    categories: Object.keys(byCategory),
    byCategory,
    isOversubscribed: Math.max(...ratios) > 1,
    subscriptionVelocity: calculateVelocity(data),
    projectedFinal: projectFinalSubscription(data, ipo),
  };
}

function generateTrendAnalysis(data) {
  const ratios = data.map((d) => d.subscriptionRatio);
  const timeSeriesData = data
    .map((d) => ({
      ratio: d.subscriptionRatio,
      timestamp: new Date(d.timestamp).getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    direction: calculateTrend(ratios),
    momentum: calculateMomentum(timeSeriesData),
    velocity: calculateVelocity(data),
    acceleration: calculateAcceleration(timeSeriesData),
    projection: projectFinalSubscription(data),
  };
}

function calculateTrend(ratios) {
  if (ratios.length < 3) return "stable";

  const recent = ratios.slice(0, Math.ceil(ratios.length / 3));
  const older = ratios.slice(-Math.ceil(ratios.length / 3));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 20) return "increasing";
  if (change < -20) return "decreasing";
  return "stable";
}

function calculateVelocity(data) {
  if (data.length < 2) return 0;

  const timeSpan =
    new Date(data[0].timestamp) - new Date(data[data.length - 1].timestamp);
  const ratioChange =
    data[0].subscriptionRatio - data[data.length - 1].subscriptionRatio;

  return timeSpan > 0 ? ratioChange / (timeSpan / (1000 * 60 * 60)) : 0; // Change per hour
}

function calculateMomentum(timeSeriesData) {
  if (timeSeriesData.length < 3) return 0;

  let momentum = 0;
  for (let i = 1; i < timeSeriesData.length - 1; i++) {
    const prev = timeSeriesData[i - 1];
    const curr = timeSeriesData[i];
    const next = timeSeriesData[i + 1];

    const velocity1 =
      (curr.ratio - prev.ratio) / (curr.timestamp - prev.timestamp);
    const velocity2 =
      (next.ratio - curr.ratio) / (next.timestamp - curr.timestamp);

    momentum += velocity2 - velocity1;
  }

  return momentum / (timeSeriesData.length - 2);
}

function calculateAcceleration(timeSeriesData) {
  if (timeSeriesData.length < 3) return 0;

  const velocities = [];
  for (let i = 1; i < timeSeriesData.length; i++) {
    const prev = timeSeriesData[i - 1];
    const curr = timeSeriesData[i];
    velocities.push(
      (curr.ratio - prev.ratio) / (curr.timestamp - prev.timestamp)
    );
  }

  if (velocities.length < 2) return 0;

  const recentVel = velocities[0];
  const olderVel = velocities[velocities.length - 1];
  const timeSpan =
    timeSeriesData[timeSeriesData.length - 1].timestamp -
    timeSeriesData[0].timestamp;

  return timeSpan > 0 ? (recentVel - olderVel) / timeSpan : 0;
}

function projectFinalSubscription(data, ipo) {
  if (!ipo?.closeDate || data.length < 3) return null;

  const now = Date.now();
  const closeTime = new Date(ipo.closeDate).getTime();
  const remainingTime = closeTime - now;

  if (remainingTime <= 0) return data[0]?.subscriptionRatio || 0;

  const velocity = calculateVelocity(data);
  const currentRatio = data[0]?.subscriptionRatio || 0;

  const projectedIncrease = velocity * (remainingTime / (1000 * 60 * 60)); // Hours remaining
  const projected = Math.max(currentRatio, currentRatio + projectedIncrease);

  return Math.round(projected * 100) / 100;
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
