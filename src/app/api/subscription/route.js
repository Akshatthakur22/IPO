import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db.js";
import { cache } from "../../../lib/cache.js";
import { requireAuth } from "../../../lib/auth.js";
import { subscriptionTrackerService } from "../../../services/subscription-tracker.js";

// Get subscription data with filtering and analytics
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const ipoId = searchParams.get("ipoId");
    const symbol = searchParams.get("symbol");
    const category = searchParams.get("category");
    const timeRange = parseInt(searchParams.get("timeRange")) || 7;
    const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 200);
    const includeStats = searchParams.get("includeStats") !== "false";
    const live = searchParams.get("live") === "true";

    // Build cache key
    const cacheKey = cache.key(
      "SUBSCRIPTION",
      `data:${JSON.stringify({
        ipoId,
        symbol,
        category,
        timeRange,
        limit,
        includeStats,
      })}`
    );

    // Try cache first (skip for live requests)
    if (!live) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Build where clause
    const whereClause = {};
    const since = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    whereClause.timestamp = { gte: since };

    if (ipoId) {
      whereClause.ipoId = ipoId;
    } else if (symbol) {
      whereClause.ipo = { symbol: symbol.toUpperCase() };
    }

    if (category) {
      whereClause.category = category.toUpperCase();
    }

    // Fetch subscription data
    const [subscriptionData, totalCount] = await Promise.all([
      prisma.subscriptionData.findMany({
        where: whereClause,
        include: {
          ipo: {
            select: { symbol: true, name: true, status: true, issueSize: true },
          },
        },
        orderBy: { timestamp: "desc" },
        take: limit,
      }),
      prisma.subscriptionData.count({ where: whereClause }),
    ]);

    // Get live data if requested
    if (
      live &&
      subscriptionTrackerService.getStatus().isRunning &&
      (ipoId || symbol)
    ) {
      try {
        const targetId = ipoId || subscriptionData[0]?.ipoId;
        if (targetId) {
          const liveData =
            await subscriptionTrackerService.forceTrackIPO(targetId);
          if (
            liveData &&
            liveData.timestamp > (subscriptionData[0]?.timestamp || 0)
          ) {
            subscriptionData.unshift({
              ...liveData,
              ipo: subscriptionData[0]?.ipo,
              source: "live_service",
            });
          }
        }
      } catch (error) {
        console.warn("Live subscription fetch failed:", error.message);
      }
    }

    // Generate statistics
    let statistics = null;
    if (includeStats && subscriptionData.length > 0) {
      const ratios = subscriptionData
        .map((s) => s.subscriptionRatio)
        .filter((r) => r !== null);
      const quantities = subscriptionData.map((s) => Number(s.quantity || 0));

      // Group by category
      const byCategory = {};
      subscriptionData.forEach((s) => {
        if (!byCategory[s.category]) {
          byCategory[s.category] = {
            count: 0,
            totalRatio: 0,
            totalQuantity: 0,
          };
        }
        byCategory[s.category].count++;
        byCategory[s.category].totalRatio += s.subscriptionRatio || 0;
        byCategory[s.category].totalQuantity += Number(s.quantity || 0);
      });

      // Calculate category averages
      Object.keys(byCategory).forEach((cat) => {
        const data = byCategory[cat];
        data.avgRatio = (data.totalRatio / data.count).toFixed(2);
        data.avgQuantity = Math.round(data.totalQuantity / data.count);
      });

      statistics = {
        count: subscriptionData.length,
        latest: subscriptionData[0] || null,
        overallSubscription: ratios.length > 0 ? Math.max(...ratios) : 0,
        averageSubscription:
          ratios.length > 0
            ? (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)
            : 0,
        totalQuantity: quantities.reduce((a, b) => a + b, 0),
        byCategory,
        trend: calculateTrend(ratios),
        oversubscribed: ratios.filter((r) => r > 1).length,
        categories: Object.keys(byCategory),
      };
    }

    const response = {
      success: true,
      data: subscriptionData,
      statistics,
      metadata: {
        ipoId,
        symbol,
        category,
        timeRange,
        limit,
        totalCount,
        includeStats,
        live,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 minute (short for subscription data)
    if (!live) {
      await cache.set(cacheKey, response, 60);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/subscription error:", error);
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

// Add new subscription data (Admin only)
export async function POST(request) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const {
      ipoId,
      symbol,
      category,
      subCategory,
      quantity,
      bidCount,
      subscriptionRatio,
      timestamp,
      metadata,
    } = body;

    if (!subscriptionRatio || (!ipoId && !symbol) || !category) {
      return NextResponse.json(
        {
          success: false,
          error: "IPO ID/symbol, category, and subscription ratio are required",
        },
        { status: 400 }
      );
    }

    // Get IPO ID if symbol provided
    let targetIpoId = ipoId;
    if (!targetIpoId && symbol) {
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
      targetIpoId = ipo.id;
    }

    // Create subscription record
    const subscriptionRecord = await prisma.subscriptionData.create({
      data: {
        ipoId: targetIpoId,
        category: category.toUpperCase(),
        subCategory: subCategory?.toUpperCase() || null,
        quantity: quantity ? BigInt(quantity) : null,
        bidCount: bidCount ? parseInt(bidCount) : null,
        subscriptionRatio: parseFloat(subscriptionRatio),
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
      include: {
        ipo: { select: { symbol: true, name: true } },
      },
    });

    // Clear relevant caches
    await cache.del(cache.key("SUBSCRIPTION", "*"));

    return NextResponse.json({
      success: true,
      data: {
        ...subscriptionRecord,
        quantity: subscriptionRecord.quantity?.toString(),
      },
      message: "Subscription data added successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/subscription error:", error);
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

// Bulk update subscription data (Admin only)
export async function PUT(request) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { ipoId, subscriptions } = body;

    if (!ipoId || !subscriptions || !Array.isArray(subscriptions)) {
      return NextResponse.json(
        {
          success: false,
          error: "IPO ID and subscriptions array are required",
        },
        { status: 400 }
      );
    }

    // Process subscriptions in transaction
    const results = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const sub of subscriptions) {
        const updated = await tx.subscriptionData.upsert({
          where: {
            ipoId_category_subCategory: {
              ipoId,
              category: sub.category.toUpperCase(),
              subCategory: sub.subCategory?.toUpperCase() || null,
            },
          },
          update: {
            quantity: sub.quantity ? BigInt(sub.quantity) : null,
            bidCount: sub.bidCount ? parseInt(sub.bidCount) : null,
            subscriptionRatio: parseFloat(sub.subscriptionRatio),
            timestamp: new Date(),
            metadata: sub.metadata ? JSON.stringify(sub.metadata) : null,
          },
          create: {
            ipoId,
            category: sub.category.toUpperCase(),
            subCategory: sub.subCategory?.toUpperCase() || null,
            quantity: sub.quantity ? BigInt(sub.quantity) : null,
            bidCount: sub.bidCount ? parseInt(sub.bidCount) : null,
            subscriptionRatio: parseFloat(sub.subscriptionRatio),
            timestamp: new Date(),
            metadata: sub.metadata ? JSON.stringify(sub.metadata) : null,
          },
        });
        processed.push({
          ...updated,
          quantity: updated.quantity?.toString(),
        });
      }

      return processed;
    });

    // Clear caches
    await cache.del(cache.key("SUBSCRIPTION", "*"));

    return NextResponse.json({
      success: true,
      data: {
        processed: results.length,
        ipoId,
        results,
      },
      message: "Subscription data updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PUT /api/subscription error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update subscription data",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Delete subscription data (Admin only)
export async function DELETE(request) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const ipoId = searchParams.get("ipoId");
    const ids = searchParams.get("ids")?.split(",");
    const olderThan = parseInt(searchParams.get("olderThan"));

    if (!ipoId && !ids && !olderThan) {
      return NextResponse.json(
        {
          success: false,
          error: "Either ipoId, ids, or olderThan parameter is required",
        },
        { status: 400 }
      );
    }

    // Build delete conditions
    const whereClause = {};
    if (ipoId) whereClause.ipoId = ipoId;
    if (ids) whereClause.id = { in: ids };
    if (olderThan) {
      whereClause.timestamp = {
        lt: new Date(Date.now() - olderThan * 24 * 60 * 60 * 1000),
      };
    }

    // Delete records
    const result = await prisma.subscriptionData.deleteMany({
      where: whereClause,
    });

    // Clear caches
    await cache.del(cache.key("SUBSCRIPTION", "*"));

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
      message: `Deleted ${result.count} subscription records`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("DELETE /api/subscription error:", error);
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

// Helper function
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

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};
