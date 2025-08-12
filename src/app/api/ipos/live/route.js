import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.js";
import { cache } from "../../../../lib/cache.js";
import { webSocketService } from "../../../../lib/websocket.js";
import { analyticsService } from "../../../../lib/analytics.js";
import { predictionService } from "../../../../services/prediction-service.js";
import { gmpTrackerService } from "../../../../services/gmp-tracker.js";
import { subscriptionTrackerService } from "../../../../services/subscription-tracker.js";

// Real-time IPO data streaming endpoint with comprehensive live data
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const symbols = searchParams.get("symbols")?.split(",");
    const categories = searchParams.get("categories")?.split(",") || ["all"];
    const includeGMP = searchParams.get("includeGMP") !== "false";
    const includeSubscription =
      searchParams.get("includeSubscription") !== "false";
    const includePredictions =
      searchParams.get("includePredictions") !== "false";
    const includeAnalytics = searchParams.get("includeAnalytics") !== "false";
    const includeAlerts = searchParams.get("includeAlerts") === "true";
    const includeTrends = searchParams.get("includeTrends") === "true";
    const status = searchParams.get("status") || "open";
    const format = searchParams.get("format") || "json";
    const clientId = searchParams.get("clientId");
    const lastUpdate = searchParams.get("lastUpdate"); // Timestamp for delta updates
    const compression = searchParams.get("compression") === "true";

    // Validate format
    const validFormats = ["json", "stream", "websocket"];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid format",
          validFormats,
        },
        { status: 400 }
      );
    }

    // Handle WebSocket upgrade request
    if (format === "websocket") {
      return handleWebSocketUpgrade(request, {
        symbols,
        categories,
        includeGMP,
        includeSubscription,
        includePredictions,
        includeAnalytics,
        includeAlerts,
        clientId,
      });
    }

    // Build cache key for live data
    const cacheKey = cache.key(
      "LIVE",
      `ipos:${JSON.stringify({
        symbols: symbols?.sort(),
        categories: categories.sort(),
        status,
        includeGMP,
        includeSubscription,
        includePredictions,
        includeAnalytics,
        includeAlerts,
        includeTrends,
      })}`
    );

    // Check cache for recent data (very short TTL for live data)
    if (!lastUpdate) {
      const cached = await cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 5000) {
        // 5 seconds cache
        return NextResponse.json({
          ...cached,
          cached: true,
          cacheAge: Date.now() - cached.timestamp,
        });
      }
    }

    // Build where clause for IPO filtering
    const whereClause = {
      isActive: true,
    };

    // Status filtering
    if (status !== "all") {
      if (status.includes(",")) {
        whereClause.status = { in: status.split(",") };
      } else {
        whereClause.status = status;
      }
    }

    // Symbol filtering
    if (symbols && symbols.length > 0) {
      whereClause.symbol = { in: symbols.map((s) => s.toUpperCase()) };
    } else {
      // Default to currently active IPOs for live data
      whereClause.status = { in: ["open", "upcoming", "closed"] };
      whereClause.OR = [
        { closeDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, // Within last 7 days
        { status: "open" },
        {
          status: "upcoming",
          openDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // Within next 30 days
        },
      ];
    }

    // Fetch live IPO data
    const ipos = await prisma.iPO.findMany({
      where: whereClause,
      select: {
        id: true,
        symbol: true,
        name: true,
        status: true,
        openDate: true,
        closeDate: true,
        listingDate: true,
        minPrice: true,
        maxPrice: true,
        lotSize: true,
        updatedAt: true,
      },
      orderBy: [{ status: "asc" }, { openDate: "desc" }],
    });

    if (ipos.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No active IPOs found matching criteria",
        timestamp: Date.now(),
        metadata: {
          count: 0,
          categories: categories,
          status,
          lastUpdate: Date.now(),
        },
      });
    }

    // Process live data for each IPO
    const liveData = await Promise.all(
      ipos.map(async (ipo) => {
        const liveIPOData = {
          id: ipo.id,
          symbol: ipo.symbol,
          name: ipo.name,
          status: ipo.status,
          openDate: ipo.openDate,
          closeDate: ipo.closeDate,
          listingDate: ipo.listingDate,
          priceRange: {
            min: ipo.minPrice,
            max: ipo.maxPrice,
          },
          lotSize: ipo.lotSize,
          lastUpdated: ipo.updatedAt,

          // Real-time computed fields
          timeline: calculateLiveTimeline(ipo),
          phase: determineLivePhase(ipo),
        };

        // Add real-time GMP data
        if (includeGMP) {
          liveIPOData.gmp = await getLiveGMPData(ipo.id);
        }

        // Add real-time subscription data
        if (includeSubscription) {
          liveIPOData.subscription = await getLiveSubscriptionData(ipo.id);
        }

        // Add real-time predictions
        if (includePredictions) {
          liveIPOData.predictions = await getLivePredictions(ipo.id);
        }

        // Add real-time analytics
        if (includeAnalytics) {
          liveIPOData.analytics = await getLiveAnalytics(ipo.id);
        }

        // Add alerts if requested
        if (includeAlerts) {
          liveIPOData.alerts = await getLiveAlerts(ipo.id);
        }

        // Add trends if requested
        if (includeTrends) {
          liveIPOData.trends = await getLiveTrends(ipo.id);
        }

        return liveIPOData;
      })
    );

    // Filter by categories if specified
    let filteredData = liveData;
    if (!categories.includes("all")) {
      filteredData = liveData.filter((ipo) =>
        categories.some((category) => matchesCategory(ipo, category))
      );
    }

    // Sort by priority for live data
    filteredData.sort((a, b) => {
      const priorityOrder = {
        open: 0,
        closing_soon: 1,
        upcoming: 2,
        closed: 3,
      };
      return (priorityOrder[a.phase] || 4) - (priorityOrder[b.phase] || 4);
    });

    // Build comprehensive response
    const response = {
      success: true,
      data: filteredData,
      metadata: {
        count: filteredData.length,
        totalIPOs: liveData.length,
        categories: categories,
        status,
        includes: {
          gmp: includeGMP,
          subscription: includeSubscription,
          predictions: includePredictions,
          analytics: includeAnalytics,
          alerts: includeAlerts,
          trends: includeTrends,
        },
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        nextUpdate: Date.now() + 30000, // Next update in 30 seconds
        dataAge: lastUpdate ? Date.now() - parseInt(lastUpdate) : 0,
      },
      realtime: {
        connectedClients: await webSocketService.getConnectedClientsCount(),
        activeSubscriptions:
          await webSocketService.getActiveSubscriptionsCount(),
        serverTime: new Date().toISOString(),
        latency: Date.now() % 1000, // Mock latency
      },
      summary: generateLiveSummary(filteredData),
    };

    // Apply compression if requested
    if (compression && response.data.length > 10) {
      response.data = compressLiveData(response.data);
      response.compressed = true;
    }

    // Cache response briefly
    await cache.set(cacheKey, response, 5); // 5 seconds cache

    // Handle streaming format
    if (format === "stream") {
      return handleStreamingResponse(response, clientId);
    }

    // Log live data access for analytics
    logLiveDataAccess(request, {
      ipoCount: filteredData.length,
      categories,
      includes: {
        includeGMP,
        includeSubscription,
        includePredictions,
        includeAnalytics,
      },
      clientId,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/ipos/live error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch live IPO data",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
        timestamp: Date.now(),
        retryAfter: 5000, // Retry after 5 seconds
      },
      { status: 500 }
    );
  }
}

// Server-Sent Events endpoint for real-time streaming
export async function POST(request) {
  try {
    const body = await request.json();
    const { action, data, clientId } = body;

    switch (action) {
      case "subscribe":
        return handleSubscription(data, clientId);

      case "unsubscribe":
        return handleUnsubscription(data, clientId);

      case "ping":
        return NextResponse.json({
          success: true,
          action: "pong",
          serverTime: Date.now(),
          clientId,
        });

      case "get_status":
        return handleStatusRequest(clientId);

      case "update_preferences":
        return handlePreferencesUpdate(data, clientId);

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Unknown action",
            availableActions: [
              "subscribe",
              "unsubscribe",
              "ping",
              "get_status",
              "update_preferences",
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("POST /api/ipos/live error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process live data request",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

// WebSocket upgrade handler
async function handleWebSocketUpgrade(request, options) {
  try {
    // This would typically upgrade to WebSocket protocol
    // For Next.js API routes, we'll provide WebSocket connection info

    const wsEndpoint =
      process.env.WEBSOCKET_ENDPOINT || "ws://localhost:3001/ws";
    const connectionToken = generateConnectionToken(options);

    return NextResponse.json({
      success: true,
      websocket: {
        endpoint: wsEndpoint,
        token: connectionToken,
        protocols: ["ipo-live-v1"],
        options: {
          autoReconnect: true,
          heartbeatInterval: 30000,
          maxReconnectAttempts: 5,
        },
      },
      instructions: {
        connect: `Connect to ${wsEndpoint} with token in headers`,
        authenticate: "Send token in Authorization header or as first message",
        subscribe:
          "Send subscription message with desired IPO symbols and data types",
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "WebSocket upgrade failed",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle streaming response format
function handleStreamingResponse(response, clientId) {
  // For SSE (Server-Sent Events) format
  const sseData = `data: ${JSON.stringify({
    id: generateEventId(),
    type: "ipo-live-data",
    timestamp: Date.now(),
    clientId,
    payload: response,
  })}\n\n`;

  return new NextResponse(sseData, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    },
  });
}

// Get live GMP data
async function getLiveGMPData(ipoId) {
  try {
    // Try cache first
    const cachedGMP = await cache.get(cache.key("GMP", `live:${ipoId}`));
    if (cachedGMP && Date.now() - cachedGMP.timestamp < 10000) {
      return {
        ...cachedGMP,
        fromCache: true,
        age: Date.now() - cachedGMP.timestamp,
      };
    }

    // Get from GMP tracker service
    const gmpTracker = gmpTrackerService.getStatus();
    if (gmpTracker.isRunning) {
      const liveGMP = await gmpTrackerService.forceTrackIPO(ipoId);

      if (liveGMP) {
        return {
          current: {
            value: liveGMP.value,
            percentage: liveGMP.percentage,
            volume: liveGMP.volume,
            spread: liveGMP.spread,
            timestamp: liveGMP.timestamp,
            sources: liveGMP.sources || [],
          },
          trend: liveGMP.trend || "stable",
          confidence: liveGMP.confidence || 0.7,
          alerts: liveGMP.alerts || [],
          fromService: true,
        };
      }
    }

    // Fallback to database
    const latestGMP = await prisma.gMP.findFirst({
      where: { ipoId },
      orderBy: { timestamp: "desc" },
      select: {
        value: true,
        percentage: true,
        volume: true,
        timestamp: true,
        source: true,
        bidPrice: true,
        askPrice: true,
      },
    });

    if (latestGMP) {
      return {
        current: {
          value: latestGMP.value,
          percentage: latestGMP.percentage,
          volume: latestGMP.volume,
          spread: latestGMP.askPrice - latestGMP.bidPrice,
          timestamp: latestGMP.timestamp,
          source: latestGMP.source,
        },
        trend: "stable",
        confidence: 0.5,
        alerts: [],
        fromDatabase: true,
        age: Date.now() - new Date(latestGMP.timestamp).getTime(),
      };
    }

    return {
      current: null,
      trend: "unknown",
      confidence: 0,
      alerts: [],
      message: "No GMP data available",
    };
  } catch (error) {
    console.error("Error getting live GMP data:", error);
    return {
      current: null,
      error: "Failed to fetch GMP data",
      timestamp: Date.now(),
    };
  }
}

// Get live subscription data
async function getLiveSubscriptionData(ipoId) {
  try {
    // Try cache first
    const cachedSubscription = await cache.get(
      cache.key("SUBSCRIPTION", `live:${ipoId}`)
    );
    if (
      cachedSubscription &&
      Date.now() - cachedSubscription.timestamp < 15000
    ) {
      return {
        ...cachedSubscription,
        fromCache: true,
        age: Date.now() - cachedSubscription.timestamp,
      };
    }

    // Get from subscription tracker service
    const subscriptionTracker = subscriptionTrackerService.getStatus();
    if (subscriptionTracker.isRunning) {
      const liveSubscription =
        await subscriptionTrackerService.forceTrackIPO(ipoId);

      if (liveSubscription) {
        return {
          overall: liveSubscription.overallSubscription,
          categories: liveSubscription.categorySubscriptions || {},
          velocity: liveSubscription.velocity || 0,
          predictions: liveSubscription.predictions || {},
          alerts: liveSubscription.alerts || [],
          trends: liveSubscription.trends || {},
          fromService: true,
          timestamp: liveSubscription.timestamp,
        };
      }
    }

    // Fallback to database
    const latestSubscriptions = await prisma.subscriptionData.findMany({
      where: { ipoId },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: {
        category: true,
        subCategory: true,
        subscriptionRatio: true,
        quantity: true,
        bidCount: true,
        timestamp: true,
      },
    });

    if (latestSubscriptions.length > 0) {
      // Group by category
      const categoryMap = new Map();
      let overallSubscription = 0;

      latestSubscriptions.forEach((sub) => {
        const key = sub.category;
        if (
          !categoryMap.has(key) ||
          sub.timestamp > categoryMap.get(key).timestamp
        ) {
          categoryMap.set(key, sub);
        }
        overallSubscription = Math.max(
          overallSubscription,
          sub.subscriptionRatio
        );
      });

      const categories = {};
      for (const [category, data] of categoryMap) {
        categories[category] = {
          subscriptionRatio: data.subscriptionRatio,
          quantity: data.quantity?.toString(),
          bidCount: data.bidCount,
          timestamp: data.timestamp,
        };
      }

      return {
        overall: overallSubscription,
        categories,
        velocity: 0,
        predictions: {},
        alerts: [],
        trends: {},
        fromDatabase: true,
        age: Date.now() - new Date(latestSubscriptions[0].timestamp).getTime(),
      };
    }

    return {
      overall: 0,
      categories: {},
      message: "No subscription data available",
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Error getting live subscription data:", error);
    return {
      overall: 0,
      categories: {},
      error: "Failed to fetch subscription data",
      timestamp: Date.now(),
    };
  }
}

// Get live predictions
async function getLivePredictions(ipoId) {
  try {
    const cacheKey = cache.key("PREDICTIONS", `live:${ipoId}`);
    const cached = await cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 60000) {
      return {
        ...cached,
        fromCache: true,
        age: Date.now() - cached.timestamp,
      };
    }

    // Get fresh predictions
    const [listingGain, allotmentProb, marketSentiment] =
      await Promise.allSettled([
        predictionService.predictListingGain(ipoId),
        predictionService.predictAllotmentProbability(null, ipoId, {
          category: "RETAIL",
        }),
        predictionService.predictMarketSentiment(ipoId),
      ]);

    const predictions = {
      listingGain:
        listingGain.status === "fulfilled"
          ? {
              value: listingGain.value?.value,
              confidence: listingGain.value?.confidence,
              timestamp: listingGain.value?.timestamp,
            }
          : null,
      allotmentProbability:
        allotmentProb.status === "fulfilled"
          ? {
              retail: allotmentProb.value?.value,
              confidence: allotmentProb.value?.confidence,
              timestamp: allotmentProb.value?.timestamp,
            }
          : null,
      marketSentiment:
        marketSentiment.status === "fulfilled"
          ? {
              score: marketSentiment.value?.value,
              sentiment: mapSentimentScore(marketSentiment.value?.value),
              confidence: marketSentiment.value?.confidence,
              timestamp: marketSentiment.value?.timestamp,
            }
          : null,
      lastUpdated: Date.now(),
      fromService: true,
    };

    // Cache predictions
    await cache.set(cacheKey, predictions, 60); // 1 minute cache

    return predictions;
  } catch (error) {
    console.error("Error getting live predictions:", error);
    return {
      error: "Failed to fetch predictions",
      timestamp: Date.now(),
    };
  }
}

// Get live analytics
async function getLiveAnalytics(ipoId) {
  try {
    const cacheKey = cache.key("ANALYTICS", `live:${ipoId}`);
    const cached = await cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 30000) {
      return {
        ...cached,
        fromCache: true,
        age: Date.now() - cached.timestamp,
      };
    }

    // Get analytics summary
    const analytics = await analyticsService.computeIPOAnalytics(ipoId, {
      includeHistorical: false,
      includePredictions: false,
      lightweight: true,
      timeRange: 1, // Last 1 day
    });

    const liveAnalytics = {
      riskScore: analytics.riskAssessment?.overallRiskScore,
      momentum: analytics.momentum || 0,
      volatility: analytics.gmpAnalytics?.statistics?.volatility,
      activity: analytics.activityMetrics || {},
      trends: {
        gmp: analytics.gmpAnalytics?.trend,
        subscription: analytics.subscriptionAnalytics?.trend,
      },
      summary: {
        strength: calculateStrengthScore(analytics),
        recommendation: generateQuickRecommendation(analytics),
      },
      lastUpdated: Date.now(),
      fromService: true,
    };

    // Cache analytics
    await cache.set(cacheKey, liveAnalytics, 30); // 30 seconds cache

    return liveAnalytics;
  } catch (error) {
    console.error("Error getting live analytics:", error);
    return {
      error: "Failed to fetch analytics",
      timestamp: Date.now(),
    };
  }
}

// Get live alerts
async function getLiveAlerts(ipoId) {
  try {
    const alerts = [];

    // Get recent system alerts
    const systemAlerts = await cache.get(
      cache.key("ALERTS", `system:${ipoId}`)
    );
    if (systemAlerts && Array.isArray(systemAlerts)) {
      alerts.push(
        ...systemAlerts.filter(
          (alert) => Date.now() - alert.timestamp < 300000 // Last 5 minutes
        )
      );
    }

    // Get price alerts
    const priceAlerts = await cache.get(cache.key("ALERTS", `price:${ipoId}`));
    if (priceAlerts && Array.isArray(priceAlerts)) {
      alerts.push(
        ...priceAlerts.filter(
          (alert) => Date.now() - alert.timestamp < 600000 // Last 10 minutes
        )
      );
    }

    return {
      active: alerts,
      count: alerts.length,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    return {
      active: [],
      count: 0,
      error: "Failed to fetch alerts",
    };
  }
}

// Get live trends
async function getLiveTrends(ipoId) {
  try {
    const trends = {};

    // Get GMP trend
    const gmpTrend = await cache.get(cache.key("TRENDS", `gmp:${ipoId}`));
    if (gmpTrend) {
      trends.gmp = {
        direction: gmpTrend.direction,
        velocity: gmpTrend.velocity,
        confidence: gmpTrend.confidence,
      };
    }

    // Get subscription trend
    const subscriptionTrend = await cache.get(
      cache.key("TRENDS", `subscription:${ipoId}`)
    );
    if (subscriptionTrend) {
      trends.subscription = {
        direction: subscriptionTrend.direction,
        velocity: subscriptionTrend.velocity,
        projectedFinal: subscriptionTrend.projectedFinal,
      };
    }

    return {
      trends,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    return {
      trends: {},
      error: "Failed to fetch trends",
    };
  }
}

// Handle subscription management
async function handleSubscription(data, clientId) {
  try {
    const { symbols, dataTypes, frequency } = data;

    // Validate subscription data
    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json(
        {
          success: false,
          error: "Symbols array is required",
        },
        { status: 400 }
      );
    }

    // Register subscription with WebSocket service
    const subscription = await webSocketService.createSubscription({
      clientId,
      symbols: symbols.map((s) => s.toUpperCase()),
      dataTypes: dataTypes || ["gmp", "subscription"],
      frequency: frequency || 30000, // 30 seconds default
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        symbols: subscription.symbols,
        dataTypes: subscription.dataTypes,
        frequency: subscription.frequency,
        status: "active",
      },
      message: "Subscription created successfully",
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create subscription",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle unsubscription
async function handleUnsubscription(data, clientId) {
  try {
    const { subscriptionId, symbols } = data;

    let result;
    if (subscriptionId) {
      result = await webSocketService.removeSubscription(subscriptionId);
    } else if (symbols) {
      result = await webSocketService.removeSubscriptionBySymbols(
        clientId,
        symbols
      );
    } else {
      result = await webSocketService.removeAllSubscriptions(clientId);
    }

    return NextResponse.json({
      success: true,
      message: "Unsubscribed successfully",
      removed: result.count || 1,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to unsubscribe",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle status request
async function handleStatusRequest(clientId) {
  try {
    const status = {
      server: {
        time: Date.now(),
        uptime: process.uptime(),
        connectedClients: await webSocketService.getConnectedClientsCount(),
        activeSubscriptions:
          await webSocketService.getActiveSubscriptionsCount(),
      },
      services: {
        gmpTracker: gmpTrackerService.getStatus(),
        subscriptionTracker: subscriptionTrackerService.getStatus(),
        predictions: predictionService.getStatus(),
        analytics: analyticsService.getHealthStatus(),
      },
      client: {
        id: clientId,
        subscriptions: await webSocketService.getClientSubscriptions(clientId),
        lastActivity: Date.now(),
      },
    };

    return NextResponse.json({
      success: true,
      status,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get status",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle preferences update
async function handlePreferencesUpdate(data, clientId) {
  try {
    const { preferences } = data;

    // Store client preferences
    const preferenceKey = cache.key("CLIENT_PREFS", clientId);
    await cache.set(
      preferenceKey,
      {
        ...preferences,
        updatedAt: Date.now(),
      },
      24 * 60 * 60
    ); // 24 hours

    return NextResponse.json({
      success: true,
      preferences,
      message: "Preferences updated successfully",
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update preferences",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Helper functions
function calculateLiveTimeline(ipo) {
  const now = new Date();
  const openDate = new Date(ipo.openDate);
  const closeDate = new Date(ipo.closeDate);

  return {
    hoursToOpen:
      ipo.openDate && openDate > now
        ? Math.ceil((openDate - now) / (1000 * 60 * 60))
        : null,
    hoursToClose:
      ipo.closeDate && closeDate > now
        ? Math.ceil((closeDate - now) / (1000 * 60 * 60))
        : null,
    hoursFromOpen:
      ipo.openDate && openDate <= now
        ? Math.floor((now - openDate) / (1000 * 60 * 60))
        : null,
    hoursFromClose:
      ipo.closeDate && closeDate <= now
        ? Math.floor((now - closeDate) / (1000 * 60 * 60))
        : null,
  };
}

function determineLivePhase(ipo) {
  const now = new Date();
  const openDate = new Date(ipo.openDate);
  const closeDate = new Date(ipo.closeDate);
  const hoursToClose =
    closeDate > now ? (closeDate - now) / (1000 * 60 * 60) : 0;

  if (ipo.status === "listed") {
    return "listed";
  } else if (ipo.status === "closed") {
    return "closed";
  } else if (ipo.status === "open") {
    if (hoursToClose <= 6) return "closing_soon";
    if (hoursToClose <= 24) return "last_day";
    return "open";
  } else {
    const hoursToOpen =
      openDate > now ? (openDate - now) / (1000 * 60 * 60) : 0;
    if (hoursToOpen <= 24) return "opening_soon";
    return "upcoming";
  }
}

function matchesCategory(ipo, category) {
  switch (category.toLowerCase()) {
    case "hot":
      return ipo.gmp?.current?.value > 50 || ipo.subscription?.overall > 5;
    case "closing_soon":
      return ipo.phase === "closing_soon" || ipo.phase === "last_day";
    case "oversubscribed":
      return ipo.subscription?.overall > 1;
    case "undersubscribed":
      return ipo.subscription?.overall < 1 && ipo.status === "open";
    case "positive_gmp":
      return ipo.gmp?.current?.value > 0;
    case "high_volume":
      return ipo.gmp?.current?.volume > 1000;
    default:
      return true;
  }
}

function generateLiveSummary(data) {
  const summary = {
    total: data.length,
    byStatus: {},
    byPhase: {},
    overallMetrics: {
      avgGMP: 0,
      avgSubscription: 0,
      totalVolume: 0,
    },
  };

  data.forEach((ipo) => {
    // Count by status
    summary.byStatus[ipo.status] = (summary.byStatus[ipo.status] || 0) + 1;

    // Count by phase
    summary.byPhase[ipo.phase] = (summary.byPhase[ipo.phase] || 0) + 1;

    // Aggregate metrics
    if (ipo.gmp?.current?.value) {
      summary.overallMetrics.avgGMP += ipo.gmp.current.value;
    }
    if (ipo.subscription?.overall) {
      summary.overallMetrics.avgSubscription += ipo.subscription.overall;
    }
    if (ipo.gmp?.current?.volume) {
      summary.overallMetrics.totalVolume += ipo.gmp.current.volume;
    }
  });

  // Calculate averages
  if (data.length > 0) {
    summary.overallMetrics.avgGMP = Math.round(
      summary.overallMetrics.avgGMP / data.length
    );
    summary.overallMetrics.avgSubscription =
      Math.round((summary.overallMetrics.avgSubscription / data.length) * 100) /
      100;
  }

  return summary;
}

function compressLiveData(data) {
  // Compress data by removing verbose fields for bandwidth optimization
  return data.map((ipo) => ({
    id: ipo.id,
    symbol: ipo.symbol,
    name: ipo.name.length > 30 ? ipo.name.substring(0, 27) + "..." : ipo.name,
    status: ipo.status,
    phase: ipo.phase,
    timeline: {
      hoursToClose: ipo.timeline?.hoursToClose,
    },
    gmp: ipo.gmp?.current
      ? {
          value: ipo.gmp.current.value,
          percentage: ipo.gmp.current.percentage,
          trend: ipo.gmp.trend,
        }
      : null,
    subscription: ipo.subscription
      ? {
          overall: ipo.subscription.overall,
          velocity: ipo.subscription.velocity,
        }
      : null,
    predictions: ipo.predictions?.listingGain
      ? {
          listingGain: ipo.predictions.listingGain.value,
          confidence: ipo.predictions.listingGain.confidence,
        }
      : null,
    lastUpdated: ipo.lastUpdated,
  }));
}

function generateConnectionToken(options) {
  // Generate a JWT or secure token for WebSocket authentication
  const tokenData = {
    ...options,
    timestamp: Date.now(),
    expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  // In production, use proper JWT signing
  return Buffer.from(JSON.stringify(tokenData)).toString("base64");
}

function generateEventId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function mapSentimentScore(score) {
  if (score > 0.6) return "very_positive";
  if (score > 0.2) return "positive";
  if (score > -0.2) return "neutral";
  if (score > -0.6) return "negative";
  return "very_negative";
}

function calculateStrengthScore(analytics) {
  let score = 50; // Base score

  if (analytics.riskAssessment?.overallRiskScore) {
    score += (100 - analytics.riskAssessment.overallRiskScore) * 0.3;
  }

  if (analytics.momentum > 0.5) score += 20;
  else if (analytics.momentum < -0.5) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateQuickRecommendation(analytics) {
  const riskScore = analytics.riskAssessment?.overallRiskScore || 50;
  const momentum = analytics.momentum || 0;

  if (riskScore < 30 && momentum > 0.5) {
    return { action: "BUY", confidence: "HIGH" };
  } else if (riskScore < 50 && momentum > 0) {
    return { action: "BUY", confidence: "MEDIUM" };
  } else if (riskScore > 70 || momentum < -0.5) {
    return { action: "AVOID", confidence: "HIGH" };
  } else {
    return { action: "WATCH", confidence: "MEDIUM" };
  }
}

function logLiveDataAccess(request, data) {
  try {
    // Log for analytics - non-blocking
    setImmediate(() => {
      console.log("Live Data Access:", {
        timestamp: new Date().toISOString(),
        ip: request.ip,
        userAgent: request.headers.get("user-agent"),
        ...data,
      });
    });
  } catch (error) {
    // Silent fail for logging
  }
}

// Export configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
    responseLimit: "10mb",
  },
  runtime: "nodejs",
  maxDuration: 30, // 30 seconds max duration
};
