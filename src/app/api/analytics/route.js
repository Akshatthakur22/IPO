import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db.js";
import { cache } from "../../../lib/cache.js";
import { requireAuth } from "../../../lib/auth.js";
import { analyticsService } from "../../../lib/analytics.js";

// Get analytics data with filtering and aggregation
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const ipoId = searchParams.get("ipoId");
    const symbol = searchParams.get("symbol");
    const timeRange = parseInt(searchParams.get("timeRange")) || 30;
    const metrics = searchParams.get("metrics")?.split(",") || ["all"];
    const includeHistorical = searchParams.get("includeHistorical") !== "false";
    const includePredictions =
      searchParams.get("includePredictions") === "true";
    const aggregateLevel = searchParams.get("aggregateLevel") || "daily";

    // Build cache key
    const cacheKey = cache.key(
      "ANALYTICS",
      `data:${JSON.stringify({
        ipoId,
        symbol,
        timeRange,
        metrics,
        includeHistorical,
        includePredictions,
        aggregateLevel,
      })}`
    );

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    let analyticsData;

    if (ipoId || symbol) {
      // Single IPO analytics
      const targetIpoId =
        ipoId ||
        (
          await prisma.iPO.findUnique({
            where: { symbol: symbol.toUpperCase() },
            select: { id: true },
          })
        )?.id;

      if (!targetIpoId) {
        return NextResponse.json(
          {
            success: false,
            error: "IPO not found",
          },
          { status: 404 }
        );
      }

      analyticsData = await analyticsService.computeIPOAnalytics(targetIpoId, {
        includeHistorical,
        includePredictions,
        timeRange,
        lightweight: false,
      });
    } else {
      // Market-wide analytics
      analyticsData = await generateMarketAnalytics({
        timeRange,
        metrics,
        aggregateLevel,
      });
    }

    // Filter metrics if specific ones requested
    if (!metrics.includes("all")) {
      analyticsData = filterMetrics(analyticsData, metrics);
    }

    const response = {
      success: true,
      data: analyticsData,
      metadata: {
        ipoId,
        symbol,
        timeRange,
        metrics,
        includeHistorical,
        includePredictions,
        aggregateLevel,
        generatedAt: new Date().toISOString(),
      },
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch analytics",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Trigger analytics computation (Admin only)
export async function POST(request) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { action, ipoId, options = {} } = body;

    let result;

    switch (action) {
      case "compute":
        if (!ipoId) {
          return NextResponse.json(
            {
              success: false,
              error: "IPO ID is required for compute action",
            },
            { status: 400 }
          );
        }

        result = await analyticsService.computeIPOAnalytics(ipoId, {
          includeHistorical: true,
          includePredictions: true,
          forceRefresh: true,
          ...options,
        });
        break;

      case "refresh_all":
        const activeIPOs = await prisma.iPO.findMany({
          where: { isActive: true },
          select: { id: true, symbol: true },
        });

        const refreshResults = await Promise.allSettled(
          activeIPOs.map((ipo) =>
            analyticsService.computeIPOAnalytics(ipo.id, {
              includeHistorical: false,
              includePredictions: false,
              lightweight: true,
            })
          )
        );

        const successful = refreshResults.filter(
          (r) => r.status === "fulfilled"
        ).length;
        const failed = refreshResults.filter(
          (r) => r.status === "rejected"
        ).length;

        result = {
          refreshed: successful,
          failed,
          total: activeIPOs.length,
        };
        break;

      case "cleanup":
        const cleanupResult = await prisma.iPOAnalytics.deleteMany({
          where: {
            updatedAt: {
              lt: new Date(
                Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000
              ),
            },
          },
        });

        result = { cleaned: cleanupResult.count };
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
            availableActions: ["compute", "refresh_all", "cleanup"],
          },
          { status: 400 }
        );
    }

    // Clear relevant caches
    await cache.del(cache.key("ANALYTICS", "*"));

    return NextResponse.json({
      success: true,
      action,
      result,
      message: `Analytics ${action} completed successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/analytics error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process analytics action",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Generate market-wide analytics
async function generateMarketAnalytics({ timeRange, metrics, aggregateLevel }) {
  const timeRangeMs = timeRange * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - timeRangeMs);

  const [ipoStats, gmpStats, subscriptionStats, performanceStats] =
    await Promise.all([
      getIPOStatistics(since),
      getGMPStatistics(since),
      getSubscriptionStatistics(since),
      getPerformanceStatistics(since),
    ]);

  return {
    timeRange,
    aggregateLevel,
    ipoMarket: ipoStats,
    gmpTrends: gmpStats,
    subscriptionTrends: subscriptionStats,
    performance: performanceStats,
    summary: {
      totalIPOs: ipoStats.total,
      activeIPOs: ipoStats.active,
      avgGMP: gmpStats.average,
      avgSubscription: subscriptionStats.average,
      topPerformer: performanceStats.best?.symbol,
      marketSentiment: calculateMarketSentiment(gmpStats, subscriptionStats),
    },
  };
}

// Get IPO statistics
async function getIPOStatistics(since) {
  const [total, active, byStatus, bySector] = await Promise.all([
    prisma.iPO.count({ where: { isActive: true } }),
    prisma.iPO.count({ where: { isActive: true, status: "open" } }),
    prisma.iPO.groupBy({
      by: ["status"],
      where: { isActive: true, createdAt: { gte: since } },
      _count: { status: true },
    }),
    prisma.iPO.groupBy({
      by: ["sector"],
      where: { isActive: true, createdAt: { gte: since } },
      _count: { sector: true },
    }),
  ]);

  return {
    total,
    active,
    byStatus: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count.status])
    ),
    bySector: Object.fromEntries(
      bySector.map((s) => [s.sector, s._count.sector]).slice(0, 10)
    ),
  };
}

// Get GMP statistics
async function getGMPStatistics(since) {
  const gmpData = await prisma.gMP.findMany({
    where: { timestamp: { gte: since } },
    select: { value: true, volume: true, timestamp: true },
  });

  if (gmpData.length === 0) return { average: 0, volume: 0, trend: "stable" };

  const values = gmpData.map((g) => g.value);
  const volumes = gmpData.map((g) => g.volume || 0);

  return {
    average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    totalVolume: volumes.reduce((a, b) => a + b, 0),
    highest: Math.max(...values),
    lowest: Math.min(...values),
    trend: calculateTrend(values),
    recordCount: gmpData.length,
  };
}

// Get subscription statistics
async function getSubscriptionStatistics(since) {
  const subscriptionData = await prisma.subscriptionData.findMany({
    where: { timestamp: { gte: since } },
    select: { subscriptionRatio: true, category: true },
  });

  if (subscriptionData.length === 0) return { average: 0, trend: "stable" };

  const ratios = subscriptionData.map((s) => s.subscriptionRatio);
  const byCategory = {};

  subscriptionData.forEach((s) => {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s.subscriptionRatio);
  });

  return {
    average:
      Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) /
      100,
    highest: Math.max(...ratios),
    oversubscribed: ratios.filter((r) => r > 1).length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([cat, ratios]) => [
        cat,
        Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) /
          100,
      ])
    ),
    trend: calculateTrend(ratios),
  };
}

// Get performance statistics
async function getPerformanceStatistics(since) {
  const listedIPOs = await prisma.iPO.findMany({
    where: {
      status: "listed",
      listingDate: { gte: since },
      listingPrice: { not: null },
    },
    select: {
      symbol: true,
      name: true,
      maxPrice: true,
      listingPrice: true,
    },
  });

  if (listedIPOs.length === 0) return { best: null, worst: null, average: 0 };

  const performances = listedIPOs.map((ipo) => ({
    ...ipo,
    gain: ((ipo.listingPrice - ipo.maxPrice) / ipo.maxPrice) * 100,
  }));

  performances.sort((a, b) => b.gain - a.gain);

  return {
    best: performances[0],
    worst: performances[performances.length - 1],
    average:
      Math.round(
        (performances.reduce((sum, p) => sum + p.gain, 0) /
          performances.length) *
          100
      ) / 100,
    positive: performances.filter((p) => p.gain > 0).length,
    negative: performances.filter((p) => p.gain < 0).length,
    count: performances.length,
  };
}

// Calculate trend from values
function calculateTrend(values) {
  if (values.length < 2) return "stable";

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (change > 5) return "increasing";
  if (change < -5) return "decreasing";
  return "stable";
}

// Calculate market sentiment
function calculateMarketSentiment(gmpStats, subscriptionStats) {
  let score = 50; // Neutral base

  if (gmpStats.average > 50) score += 20;
  else if (gmpStats.average < 0) score -= 20;

  if (subscriptionStats.average > 3) score += 15;
  else if (subscriptionStats.average < 1) score -= 15;

  if (gmpStats.trend === "increasing") score += 10;
  else if (gmpStats.trend === "decreasing") score -= 10;

  if (score > 70) return "very_positive";
  if (score > 55) return "positive";
  if (score < 30) return "very_negative";
  if (score < 45) return "negative";
  return "neutral";
}

// Filter metrics based on request
function filterMetrics(data, requestedMetrics) {
  const filtered = {};

  requestedMetrics.forEach((metric) => {
    if (data[metric]) {
      filtered[metric] = data[metric];
    }
  });

  return Object.keys(filtered).length > 0 ? filtered : data;
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
