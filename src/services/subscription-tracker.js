import { cache } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { webSocketService } from "../lib/websocket.js";
import { analyticsService } from "../lib/analytics.js";
import { nseAPI } from "../lib/nse-api.js";

class SubscriptionTrackerService {
  constructor() {
    this.isRunning = false;
    this.trackedIPOs = new Map();
    this.subscriptionHistory = new Map();
    this.categoryWiseData = new Map();
    this.allotmentPredictions = new Map();

    // Tracking configuration
    this.trackingConfig = {
      ACTIVE_IPO_INTERVAL: 30 * 1000, // 30 seconds for active IPOs
      UPCOMING_IPO_INTERVAL: 5 * 60 * 1000, // 5 minutes for upcoming IPOs
      CLOSED_IPO_INTERVAL: 10 * 60 * 1000, // 10 minutes for recently closed
      HISTORICAL_RETENTION: 7 * 24 * 60 * 60 * 1000, // 7 days
      MAX_RETRIES: 3,
      BATCH_SIZE: 5,
    };

    // Category mapping and weights
    this.categories = {
      RETAIL: {
        code: "RETAIL",
        subCategories: ["IND", "INDIV"],
        weight: 0.35,
        maxAllocation: 35, // 35% of issue
        description: "Retail Individual Investors",
      },
      QIB: {
        code: "QIB",
        subCategories: ["FII", "MF", "IC", "DI"],
        weight: 0.5,
        maxAllocation: 50, // 50% of issue
        description: "Qualified Institutional Buyers",
      },
      NIB: {
        code: "NIB",
        subCategories: ["CO", "IND", "NRI"],
        weight: 0.15,
        maxAllocation: 15, // 15% of issue
        description: "Non-Institutional Buyers",
      },
      EMPLOYEE: {
        code: "EMP",
        subCategories: ["EMP"],
        weight: 0.05,
        maxAllocation: 5, // Up to 5% for employees
        description: "Employee Reservation",
      },
      ANCHOR: {
        code: "ANCHOR",
        subCategories: ["ANCHOR"],
        weight: 0.3,
        maxAllocation: 30, // Up to 30% for anchor investors
        description: "Anchor Investors",
      },
    };

    // Subscription analysis thresholds
    this.analysisThresholds = {
      OVERSUBSCRIPTION: 1.0, // 100% subscribed
      HEAVY_OVERSUBSCRIPTION: 5.0, // 500% subscribed
      MASSIVE_OVERSUBSCRIPTION: 10.0, // 1000% subscribed
      LOW_SUBSCRIPTION: 0.5, // 50% subscribed
      POOR_SUBSCRIPTION: 0.2, // 20% subscribed
      VOLATILE_SUBSCRIPTION: 0.3, // 30% change threshold
    };

    // Performance tracking
    this.performance = {
      totalTracked: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      averageLatency: 0,
      alertsTriggered: 0,
      predictionAccuracy: 0,
      lastTrackedAt: null,
      categoryAccuracy: new Map(),
    };

    // Real-time analysis and predictions
    this.realtimeAnalysis = {
      trendAnalysis: true,
      allotmentPrediction: true,
      categoryAnalysis: true,
      demandProjection: true,
      closingDayPrediction: true,
    };

    // Active tracking queues
    this.trackingQueues = {
      HIGH_PRIORITY: [], // Open IPOs
      MEDIUM_PRIORITY: [], // Upcoming IPOs
      LOW_PRIORITY: [], // Recently closed IPOs
    };

    // Active intervals for cleanup
    this.activeIntervals = new Map();

    // Subscription patterns and anomalies
    this.patterns = {
      openingDayRush: new Map(),
      closingDayRush: new Map(),
      categoryImbalance: new Map(),
      unusualActivity: new Map(),
    };

    console.log("📊 Subscription Tracker Service initialized");
  }

  // Start comprehensive subscription tracking
  async start() {
    if (this.isRunning) {
      console.log("⚠️  Subscription Tracker is already running");
      return;
    }

    try {
      console.log("🚀 Starting Enhanced Subscription Tracker Service...");

      // Initialize tracking data structures
      await this.initializeTrackingData();

      // Start categorized tracking processes
      this.startCategorizedTracking();

      // Initialize real-time analysis
      this.startRealtimeAnalysis();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Start maintenance tasks
      this.startMaintenanceTasks();

      this.isRunning = true;

      console.log(
        "✅ Enhanced Subscription Tracker Service started successfully"
      );
      console.log(
        `📊 Tracking ${this.trackedIPOs.size} IPOs across ${Object.keys(this.categories).length} categories`
      );

      // Broadcast service start
      await webSocketService.broadcastSystemStatus({
        type: "subscription_tracker_started",
        trackedIPOs: this.trackedIPOs.size,
        categories: Object.keys(this.categories).length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Failed to start Subscription Tracker Service:", error);
      throw error;
    }
  }

  // Initialize tracking data from database
  async initializeTrackingData() {
    console.log("📊 Initializing subscription tracking data...");

    try {
      // Get all trackable IPOs
      const ipos = await prisma.iPO.findMany({
        where: {
          isActive: true,
          status: { in: ["upcoming", "open", "closed"] },
        },
        include: {
          subscription: {
            orderBy: { timestamp: "desc" },
            take: 50, // Last 50 subscription records
          },
          categories: true,
          analytics: true,
        },
      });

      // Initialize tracking for each IPO
      for (const ipo of ipos) {
        await this.initializeIPOSubscriptionTracking(ipo);
      }

      console.log(
        `✅ Initialized subscription tracking for ${ipos.length} IPOs`
      );
    } catch (error) {
      console.error(
        "❌ Failed to initialize subscription tracking data:",
        error
      );
      throw error;
    }
  }

  // Initialize individual IPO subscription tracking
  async initializeIPOSubscriptionTracking(ipo) {
    try {
      // Determine tracking priority and interval
      const priority = this.getTrackingPriority(ipo.status);
      const interval = this.getTrackingInterval(ipo.status);

      // Calculate baseline subscription metrics
      const baseline = this.calculateSubscriptionBaseline(ipo.subscription);

      // Analyze category distribution
      const categoryAnalysis = this.analyzeCategoryDistribution(
        ipo.subscription,
        ipo.categories
      );

      // Calculate allotment predictions
      const allotmentPredictions = this.calculateAllotmentPredictions(
        ipo,
        baseline,
        categoryAnalysis
      );

      // Initialize comprehensive tracking data
      const trackingData = {
        id: ipo.id,
        symbol: ipo.symbol,
        name: ipo.name,
        status: ipo.status,
        priority,
        interval,
        baseline,
        categoryAnalysis,
        allotmentPredictions,
        lastTracked: null,
        consecutiveFailures: 0,

        // Real-time tracking data
        currentSubscription: {
          overall: 0,
          categories: new Map(),
          lastUpdated: null,
        },

        // Historical analysis
        trends: {
          hourly: [], // Last 24 hours
          daily: [], // Last 7 days
          overall: [],
        },

        // Performance metrics
        statistics: {
          totalUpdates: 0,
          successfulUpdates: 0,
          averageSubscriptionRate: 0,
          peakSubscription: 0,
          subscriptionVelocity: 0, // Rate of change
        },

        // Pattern recognition
        patterns: {
          openingRush: false,
          closingRush: false,
          categoryImbalance: false,
          unusualActivity: [],
        },

        // Alerts and notifications
        alerts: new Set(),

        // IPO specific details
        ipoDetails: {
          openDate: ipo.openDate,
          closeDate: ipo.closeDate,
          issueSize: ipo.issueSize,
          lotSize: ipo.lotSize,
          priceRange: { min: ipo.minPrice, max: ipo.maxPrice },
        },
      };

      this.trackedIPOs.set(ipo.id, trackingData);

      // Add to appropriate tracking queue
      this.addToTrackingQueue(ipo.id, priority);

      // Initialize subscription history
      this.subscriptionHistory.set(
        ipo.id,
        this.processHistoricalData(ipo.subscription)
      );

      // Initialize category-wise tracking
      this.categoryWiseData.set(
        ipo.id,
        this.initializeCategoryTracking(ipo.categories)
      );

      console.log(
        `📊 Initialized subscription tracking for ${ipo.symbol} (Priority: ${priority})`
      );
    } catch (error) {
      console.error(
        `Error initializing subscription tracking for IPO ${ipo.symbol}:`,
        error
      );
    }
  }

  // Calculate subscription baseline from historical data
  calculateSubscriptionBaseline(subscriptionData) {
    if (!subscriptionData || subscriptionData.length === 0) {
      return {
        averageSubscription: 0,
        peakSubscription: 0,
        subscriptionVelocity: 0,
        categoryDistribution: new Map(),
        trend: "unknown",
        volatility: 0,
      };
    }

    // Group by timestamp to get overall subscription at each point
    const timelineData = this.aggregateSubscriptionTimeline(subscriptionData);

    // Calculate metrics
    const subscriptionValues = timelineData.map((d) => d.totalSubscription);
    const averageSubscription =
      subscriptionValues.reduce((a, b) => a + b, 0) / subscriptionValues.length;
    const peakSubscription = Math.max(...subscriptionValues);

    // Calculate velocity (rate of change)
    const velocity =
      timelineData.length > 1
        ? (subscriptionValues[0] -
            subscriptionValues[subscriptionValues.length - 1]) /
          (timelineData.length - 1)
        : 0;

    // Calculate volatility
    const variance =
      subscriptionValues.reduce(
        (sum, val) => sum + Math.pow(val - averageSubscription, 2),
        0
      ) / subscriptionValues.length;
    const volatility = Math.sqrt(variance);

    // Determine trend
    const trend = this.calculateSubscriptionTrend(timelineData);

    // Calculate category distribution
    const categoryDistribution =
      this.calculateCategoryDistribution(subscriptionData);

    return {
      averageSubscription: Math.round(averageSubscription * 100) / 100,
      peakSubscription: Math.round(peakSubscription * 100) / 100,
      subscriptionVelocity: Math.round(velocity * 1000) / 1000,
      categoryDistribution,
      trend,
      volatility: Math.round(volatility * 100) / 100,
      dataPoints: timelineData.length,
    };
  }

  // Aggregate subscription timeline for analysis
  aggregateSubscriptionTimeline(subscriptionData) {
    const timelineMap = new Map();

    // Group by hour for timeline analysis
    subscriptionData.forEach((sub) => {
      const hourKey = new Date(sub.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH

      if (!timelineMap.has(hourKey)) {
        timelineMap.set(hourKey, {
          timestamp: hourKey,
          categories: new Map(),
          totalSubscription: 0,
        });
      }

      const timelineEntry = timelineMap.get(hourKey);
      const categoryKey = `${sub.category}_${sub.subCategory || ""}`;

      timelineEntry.categories.set(categoryKey, {
        subscriptionRatio: sub.subscriptionRatio || 0,
        quantity: sub.quantity,
        bidCount: sub.bidCount,
      });

      // Calculate total subscription (max across categories)
      const categoryRatios = Array.from(timelineEntry.categories.values()).map(
        (c) => c.subscriptionRatio || 0
      );
      timelineEntry.totalSubscription = Math.max(...categoryRatios, 0);
    });

    return Array.from(timelineMap.values()).sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  // Calculate subscription trend
  calculateSubscriptionTrend(timelineData) {
    if (timelineData.length < 2) return "stable";

    const values = timelineData.map((d) => d.totalSubscription);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / Math.max(firstAvg, 0.1)) * 100;

    if (change > 20) return "strong_increasing";
    if (change > 5) return "increasing";
    if (change < -20) return "strong_decreasing";
    if (change < -5) return "decreasing";
    return "stable";
  }

  // Calculate category distribution
  calculateCategoryDistribution(subscriptionData) {
    const distribution = new Map();

    subscriptionData.forEach((sub) => {
      const categoryKey = sub.category;

      if (!distribution.has(categoryKey)) {
        distribution.set(categoryKey, {
          totalQuantity: 0,
          totalBids: 0,
          maxSubscription: 0,
          averageSubscription: 0,
          updateCount: 0,
        });
      }

      const categoryData = distribution.get(categoryKey);
      categoryData.totalQuantity += Number(sub.quantity || 0);
      categoryData.totalBids += sub.bidCount || 0;
      categoryData.maxSubscription = Math.max(
        categoryData.maxSubscription,
        sub.subscriptionRatio || 0
      );
      categoryData.averageSubscription =
        (categoryData.averageSubscription * categoryData.updateCount +
          (sub.subscriptionRatio || 0)) /
        (categoryData.updateCount + 1);
      categoryData.updateCount++;
    });

    return distribution;
  }

  // Analyze category distribution patterns
  analyzeCategoryDistribution(subscriptionData, categories) {
    const analysis = {
      balance: "unknown",
      dominantCategory: null,
      weakestCategory: null,
      imbalanceScore: 0,
      recommendations: [],
    };

    if (!subscriptionData || subscriptionData.length === 0) {
      return analysis;
    }

    // Get latest subscription by category
    const latestByCategory =
      this.getLatestSubscriptionByCategory(subscriptionData);

    // Calculate balance metrics
    const categorySubscriptions = Array.from(latestByCategory.entries()).map(
      ([category, data]) => ({
        category,
        subscription: data.subscriptionRatio || 0,
      })
    );

    if (categorySubscriptions.length === 0) return analysis;

    // Sort by subscription ratio
    categorySubscriptions.sort((a, b) => b.subscription - a.subscription);

    analysis.dominantCategory = categorySubscriptions[0].category;
    analysis.weakestCategory =
      categorySubscriptions[categorySubscriptions.length - 1].category;

    // Calculate imbalance score
    const maxSub = categorySubscriptions[0].subscription;
    const minSub =
      categorySubscriptions[categorySubscriptions.length - 1].subscription;
    analysis.imbalanceScore = maxSub > 0 ? (maxSub - minSub) / maxSub : 0;

    // Determine balance classification
    if (analysis.imbalanceScore < 0.3) analysis.balance = "balanced";
    else if (analysis.imbalanceScore < 0.6)
      analysis.balance = "moderately_imbalanced";
    else analysis.balance = "highly_imbalanced";

    // Generate recommendations
    analysis.recommendations = this.generateCategoryRecommendations(
      categorySubscriptions,
      analysis
    );

    return analysis;
  }

  // Generate category-specific recommendations
  generateCategoryRecommendations(categorySubscriptions, analysis) {
    const recommendations = [];

    categorySubscriptions.forEach(({ category, subscription }) => {
      if (subscription > 10) {
        recommendations.push({
          category,
          type: "HIGH_OVERSUBSCRIPTION",
          message: `${category} heavily oversubscribed (${subscription.toFixed(2)}x) - Very low allotment probability`,
          severity: "high",
        });
      } else if (subscription > 5) {
        recommendations.push({
          category,
          type: "OVERSUBSCRIPTION",
          message: `${category} oversubscribed (${subscription.toFixed(2)}x) - Low allotment probability`,
          severity: "medium",
        });
      } else if (subscription < 0.5) {
        recommendations.push({
          category,
          type: "UNDERSUBSCRIPTION",
          message: `${category} undersubscribed (${subscription.toFixed(2)}x) - High allotment probability`,
          severity: "low",
        });
      }
    });

    if (analysis.balance === "highly_imbalanced") {
      recommendations.push({
        category: "OVERALL",
        type: "IMBALANCE_WARNING",
        message:
          "High imbalance between categories - consider applying in undersubscribed categories",
        severity: "medium",
      });
    }

    return recommendations;
  }

  // Calculate allotment predictions
  calculateAllotmentPredictions(ipo, baseline, categoryAnalysis) {
    const predictions = new Map();

    Object.entries(this.categories).forEach(([categoryKey, categoryConfig]) => {
      const categoryData = baseline.categoryDistribution.get(categoryKey);

      if (categoryData) {
        const subscriptionRatio =
          categoryData.maxSubscription || categoryData.averageSubscription || 0;

        // Base allotment probability calculation
        let allotmentProbability = 100;

        if (subscriptionRatio > 1) {
          // Oversubscribed - probability decreases
          allotmentProbability = Math.min(95, 100 / subscriptionRatio);
        }

        // Adjust based on category specifics
        if (categoryKey === "RETAIL" && subscriptionRatio > 2) {
          // Retail lottery system
          allotmentProbability = Math.min(allotmentProbability, 80);
        }

        // Calculate expected allocation
        const lotValue = ipo.lotSize * (ipo.maxPrice || 0);
        const maxLots =
          subscriptionRatio > 1
            ? Math.floor(200000 / lotValue) // Max retail investment
            : Math.floor(500000 / lotValue); // Higher for undersubscribed

        predictions.set(categoryKey, {
          category: categoryKey,
          allotmentProbability: Math.round(allotmentProbability * 100) / 100,
          expectedLots: Math.max(1, maxLots),
          subscriptionRatio,
          confidence: this.calculatePredictionConfidence(
            categoryData,
            subscriptionRatio
          ),
          recommendedStrategy: this.getRecommendedStrategy(
            subscriptionRatio,
            categoryKey
          ),
        });
      }
    });

    return predictions;
  }

  // Calculate prediction confidence
  calculatePredictionConfidence(categoryData, subscriptionRatio) {
    let confidence = 0.7; // Base confidence

    // More data points = higher confidence
    if (categoryData.updateCount > 10) confidence += 0.1;
    if (categoryData.updateCount > 20) confidence += 0.1;

    // Stable subscription = higher confidence
    if (
      Math.abs(
        categoryData.maxSubscription - categoryData.averageSubscription
      ) < 0.5
    ) {
      confidence += 0.1;
    }

    // Very high or very low subscription = more predictable
    if (subscriptionRatio > 5 || subscriptionRatio < 0.5) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  // Get recommended investment strategy
  getRecommendedStrategy(subscriptionRatio, category) {
    if (subscriptionRatio > 10) {
      return {
        strategy: "AVOID",
        reason: "Extremely low allotment probability",
        action: "Consider alternative investments",
      };
    } else if (subscriptionRatio > 5) {
      return {
        strategy: "MIN_INVESTMENT",
        reason: "Low allotment probability",
        action: "Apply for minimum lots only",
      };
    } else if (subscriptionRatio > 2) {
      return {
        strategy: "MODERATE_INVESTMENT",
        reason: "Moderate oversubscription",
        action: "Apply for moderate allocation",
      };
    } else if (subscriptionRatio > 1) {
      return {
        strategy: "AGGRESSIVE_INVESTMENT",
        reason: "Good allotment probability",
        action: "Apply for maximum allowed allocation",
      };
    } else {
      return {
        strategy: "MAX_INVESTMENT",
        reason: "High allotment probability",
        action: "Apply for maximum allocation",
      };
    }
  }

  // Start categorized tracking processes
  startCategorizedTracking() {
    // High priority tracking (Open IPOs)
    const highPriorityInterval = setInterval(async () => {
      await this.processTrackingQueue("HIGH_PRIORITY");
    }, this.trackingConfig.ACTIVE_IPO_INTERVAL);

    this.activeIntervals.set("HIGH_PRIORITY", highPriorityInterval);

    // Medium priority tracking (Upcoming IPOs)
    const mediumPriorityInterval = setInterval(async () => {
      await this.processTrackingQueue("MEDIUM_PRIORITY");
    }, this.trackingConfig.UPCOMING_IPO_INTERVAL);

    this.activeIntervals.set("MEDIUM_PRIORITY", mediumPriorityInterval);

    // Low priority tracking (Recently closed IPOs)
    const lowPriorityInterval = setInterval(async () => {
      await this.processTrackingQueue("LOW_PRIORITY");
    }, this.trackingConfig.CLOSED_IPO_INTERVAL);

    this.activeIntervals.set("LOW_PRIORITY", lowPriorityInterval);

    console.log("🎯 Started categorized subscription tracking");
  }

  // Process tracking queue for specific priority level
  async processTrackingQueue(priorityLevel) {
    const queue = this.trackingQueues[priorityLevel];
    if (queue.length === 0) return;

    console.log(
      `🔄 Processing ${priorityLevel} subscription queue: ${queue.length} IPOs`
    );

    // Process in batches
    const batchSize = this.trackingConfig.BATCH_SIZE;
    const batch = queue.splice(0, batchSize);

    const trackingPromises = batch.map((ipoId) =>
      this.trackIPOSubscription(ipoId).catch((error) => {
        console.error(
          `Error tracking subscription for IPO ${ipoId}:`,
          error.message
        );
        // Re-add to queue for retry
        const trackingData = this.trackedIPOs.get(ipoId);
        if (
          trackingData &&
          trackingData.consecutiveFailures < this.trackingConfig.MAX_RETRIES
        ) {
          queue.push(ipoId);
        }
      })
    );

    await Promise.allSettled(trackingPromises);

    // Re-add processed IPOs back to queue for next cycle
    batch.forEach((ipoId) => {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (
        trackingData &&
        trackingData.consecutiveFailures < this.trackingConfig.MAX_RETRIES
      ) {
        this.addToTrackingQueue(ipoId, priorityLevel);
      }
    });
  }

  // Track subscription for individual IPO
  async trackIPOSubscription(ipoId) {
    const trackingData = this.trackedIPOs.get(ipoId);
    if (!trackingData) {
      console.warn(`No tracking data found for IPO ${ipoId}`);
      return;
    }

    const startTime = Date.now();
    console.log(`📊 Tracking subscription for ${trackingData.symbol}...`);

    try {
      // Fetch latest subscription data from NSE API
      const subscriptionData = await this.fetchSubscriptionData(trackingData);

      if (!subscriptionData || subscriptionData.length === 0) {
        console.warn(
          `No subscription data received for ${trackingData.symbol}`
        );
        return;
      }

      // Process and validate subscription data
      const processedData = await this.processSubscriptionData(
        subscriptionData,
        trackingData
      );

      // Perform real-time analysis
      const analysis = await this.performSubscriptionAnalysis(
        processedData,
        trackingData
      );

      // Store subscription data in database
      const storedRecords = await this.storeSubscriptionData(
        processedData,
        trackingData
      );

      // Update tracking data and predictions
      await this.updateTrackingData(trackingData, processedData, analysis);

      // Cache and broadcast updates
      await this.cacheAndBroadcastSubscription(
        processedData,
        trackingData,
        analysis
      );

      // Check and trigger alerts
      await this.checkAndTriggerAlerts(processedData, trackingData, analysis);

      // Update performance metrics
      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics(true, latency);

      trackingData.statistics.totalUpdates++;
      trackingData.statistics.successfulUpdates++;
      trackingData.consecutiveFailures = 0;
      trackingData.lastTracked = Date.now();

      console.log(
        `✅ Successfully tracked ${trackingData.symbol}: Overall ${analysis.overallSubscription.toFixed(2)}x subscription`
      );

      return storedRecords;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics(false, latency);

      trackingData.consecutiveFailures++;
      trackingData.statistics.totalUpdates++;

      console.error(
        `❌ Failed to track subscription for ${trackingData.symbol}:`,
        error.message
      );
      throw error;
    }
  }

  // Fetch subscription data from NSE API
  async fetchSubscriptionData(trackingData) {
    try {
      // Use NSE API to fetch category-wise subscription data
      const subscriptionData = await nseAPI.fetchCategoryData(
        trackingData.symbol
      );

      if (!Array.isArray(subscriptionData)) {
        throw new Error("Invalid subscription data format received");
      }

      return subscriptionData;
    } catch (error) {
      console.error(
        `Error fetching subscription data for ${trackingData.symbol}:`,
        error
      );
      throw error;
    }
  }

  // Process and validate subscription data
  async processSubscriptionData(rawData, trackingData) {
    const processedData = {
      ipoId: trackingData.id,
      symbol: trackingData.symbol,
      timestamp: new Date(),
      categories: new Map(),
      overallSubscription: 0,
      totalApplications: 0,
      totalAmount: 0,
      metadata: {
        sourceCount: rawData.length,
        processingTime: Date.now(),
        dataQuality: "good",
      },
    };

    // Process each category
    for (const item of rawData) {
      try {
        const categoryKey = this.normalizeCategoryCode(
          item.category || item.categoryCode
        );
        const subCategoryKey = item.subCategory || item.subCategoryCode || "";

        // Validate required fields
        if (!categoryKey) {
          console.warn("Missing category in subscription data:", item);
          continue;
        }

        const quantity = BigInt(item.quantity || item.absoluteQuantity || 0);
        const bidCount = parseInt(item.bidCount || item.absoluteBidCount || 0);
        const subscriptionRatio = parseFloat(item.subscriptionRatio || 0);

        // Create category entry
        const categoryData = {
          category: categoryKey,
          subCategory: subCategoryKey,
          quantity,
          bidCount,
          subscriptionRatio,
          amount: this.calculateCategoryAmount(quantity, trackingData),
          averageBidSize: bidCount > 0 ? Number(quantity) / bidCount : 0,
          timestamp: processedData.timestamp,
        };

        // Store in categories map
        const fullCategoryKey = `${categoryKey}_${subCategoryKey}`;
        processedData.categories.set(fullCategoryKey, categoryData);

        // Update overall metrics
        processedData.overallSubscription = Math.max(
          processedData.overallSubscription,
          subscriptionRatio
        );
        processedData.totalApplications += bidCount;
        processedData.totalAmount += categoryData.amount;
      } catch (error) {
        console.error("Error processing subscription item:", error, item);
        processedData.metadata.dataQuality = "partial";
      }
    }

    // Calculate data quality score
    processedData.metadata.qualityScore = this.calculateDataQuality(
      processedData,
      rawData
    );

    return processedData;
  }

  // Normalize category codes to standard format
  normalizeCategoryCode(categoryCode) {
    if (!categoryCode) return null;

    const normalized = categoryCode.toUpperCase().trim();

    // Map common variations to standard codes
    const categoryMap = {
      RETAIL: "RETAIL",
      IND: "RETAIL",
      INDIV: "RETAIL",
      QIB: "QIB",
      INST: "QIB",
      INSTITUTIONAL: "QIB",
      NIB: "NIB",
      NII: "NIB",
      NON_INSTITUTIONAL: "NIB",
      EMP: "EMPLOYEE",
      EMPLOYEE: "EMPLOYEE",
      ANCHOR: "ANCHOR",
    };

    return categoryMap[normalized] || normalized;
  }

  // Calculate category amount based on quantity and IPO details
  calculateCategoryAmount(quantity, trackingData) {
    const lotSize = trackingData.ipoDetails.lotSize || 1;
    const maxPrice = trackingData.ipoDetails.priceRange.max || 0;

    const lots = Number(quantity) / lotSize;
    return lots * lotSize * maxPrice;
  }

  // Calculate data quality score
  calculateDataQuality(processedData, rawData) {
    let qualityScore = 100;

    // Penalize for missing categories
    const expectedCategories = ["RETAIL", "QIB", "NIB"];
    const presentCategories = Array.from(processedData.categories.keys()).map(
      (key) => key.split("_")[0]
    );

    const missingCategories = expectedCategories.filter(
      (cat) => !presentCategories.includes(cat)
    );

    qualityScore -= missingCategories.length * 20;

    // Penalize for data inconsistencies
    if (processedData.overallSubscription < 0) qualityScore -= 30;
    if (processedData.totalApplications < 0) qualityScore -= 20;

    // Reward for data completeness
    if (processedData.categories.size >= 3) qualityScore += 10;
    if (rawData.length >= 5) qualityScore += 5;

    return Math.max(0, Math.min(100, qualityScore));
  }

  // Perform comprehensive subscription analysis
  async performSubscriptionAnalysis(processedData, trackingData) {
    const analysis = {
      overallSubscription: processedData.overallSubscription,
      categoryAnalysis: new Map(),
      trends: {},
      patterns: {},
      predictions: {},
      alerts: [],
      insights: [],
      recommendations: [],
    };

    try {
      // Analyze each category
      for (const [categoryKey, categoryData] of processedData.categories) {
        const categoryAnalysis = await this.analyzeCategorySubscription(
          categoryKey,
          categoryData,
          trackingData
        );
        analysis.categoryAnalysis.set(categoryKey, categoryAnalysis);
      }

      // Detect subscription patterns
      analysis.patterns = await this.detectSubscriptionPatterns(
        processedData,
        trackingData
      );

      // Analyze trends
      analysis.trends = await this.analyzeSubscriptionTrends(
        processedData,
        trackingData
      );

      // Generate predictions
      if (this.realtimeAnalysis.allotmentPrediction) {
        analysis.predictions = await this.generateRealtimePredictions(
          processedData,
          trackingData
        );
      }

      // Generate insights
      analysis.insights = this.generateSubscriptionInsights(
        analysis,
        trackingData
      );

      // Generate alerts
      analysis.alerts = this.generateSubscriptionAlerts(analysis, trackingData);

      // Generate recommendations
      analysis.recommendations = this.generateSubscriptionRecommendations(
        analysis,
        trackingData
      );
    } catch (error) {
      console.error("Error in subscription analysis:", error);
      analysis.error = error.message;
    }

    return analysis;
  }

  // Analyze individual category subscription
  async analyzeCategorySubscription(categoryKey, categoryData, trackingData) {
    const categoryCode = categoryKey.split("_")[0];
    const categoryConfig = this.categories[categoryCode];

    const analysis = {
      subscriptionRatio: categoryData.subscriptionRatio,
      status: "unknown",
      allotmentProbability: 0,
      expectedAllocation: 0,
      velocity: 0,
      trend: "stable",
      risk: "medium",
    };

    // Determine subscription status
    if (
      categoryData.subscriptionRatio >=
      this.analysisThresholds.MASSIVE_OVERSUBSCRIPTION
    ) {
      analysis.status = "massive_oversubscription";
      analysis.risk = "very_high";
    } else if (
      categoryData.subscriptionRatio >=
      this.analysisThresholds.HEAVY_OVERSUBSCRIPTION
    ) {
      analysis.status = "heavy_oversubscription";
      analysis.risk = "high";
    } else if (
      categoryData.subscriptionRatio >= this.analysisThresholds.OVERSUBSCRIPTION
    ) {
      analysis.status = "oversubscribed";
      analysis.risk = "medium";
    } else if (
      categoryData.subscriptionRatio >= this.analysisThresholds.LOW_SUBSCRIPTION
    ) {
      analysis.status = "partial_subscription";
      analysis.risk = "low";
    } else {
      analysis.status = "poor_subscription";
      analysis.risk = "very_low";
    }

    // Calculate allotment probability
    analysis.allotmentProbability = this.calculateAllotmentProbability(
      categoryData.subscriptionRatio,
      categoryCode
    );

    // Calculate expected allocation
    analysis.expectedAllocation = this.calculateExpectedAllocation(
      categoryData,
      trackingData,
      categoryConfig
    );

    // Calculate subscription velocity
    analysis.velocity = await this.calculateSubscriptionVelocity(
      categoryKey,
      trackingData
    );

    // Determine trend
    analysis.trend = await this.calculateCategoryTrend(
      categoryKey,
      trackingData
    );

    return analysis;
  }

  // Calculate allotment probability based on subscription ratio
  calculateAllotmentProbability(subscriptionRatio, categoryCode) {
    if (subscriptionRatio <= 0) return 0;
    if (subscriptionRatio <= 1) return 95; // Undersubscribed

    // Base probability calculation
    let probability = 100 / subscriptionRatio;

    // Category-specific adjustments
    switch (categoryCode) {
      case "RETAIL":
        // Retail has lottery system for oversubscribed IPOs
        if (subscriptionRatio > 2) {
          probability = Math.min(probability, 80);
        }
        break;
      case "QIB":
        // QIB allotments are more proportional
        probability = Math.min(probability, 90);
        break;
      case "NIB":
        // NIB similar to retail but slightly better
        if (subscriptionRatio > 3) {
          probability = Math.min(probability, 85);
        }
        break;
    }

    return Math.max(1, Math.min(95, Math.round(probability)));
  }

  // Calculate expected allocation for category
  calculateExpectedAllocation(categoryData, trackingData, categoryConfig) {
    const lotSize = trackingData.ipoDetails.lotSize || 1;
    const maxPrice = trackingData.ipoDetails.priceRange.max || 0;
    const lotValue = lotSize * maxPrice;

    let maxInvestment = 200000; // Default retail limit

    if (categoryConfig) {
      if (categoryConfig.code === "QIB")
        maxInvestment = 10000000; // 1 Cr
      else if (categoryConfig.code === "NIB") maxInvestment = 1000000; // 10 Lakh
    }

    const maxLots = Math.floor(maxInvestment / lotValue);

    // If oversubscribed, reduce expected allocation
    const subscriptionRatio = categoryData.subscriptionRatio || 1;
    let expectedLots = maxLots;

    if (subscriptionRatio > 1) {
      expectedLots = Math.max(1, Math.floor(maxLots / subscriptionRatio));
    }

    return {
      lots: expectedLots,
      amount: expectedLots * lotValue,
      percentage: subscriptionRatio > 1 ? 100 / subscriptionRatio : 100,
    };
  }

  // Calculate subscription velocity (rate of change)
  async calculateSubscriptionVelocity(categoryKey, trackingData) {
    try {
      const recentHistory = await this.getRecentSubscriptionHistory(
        trackingData.id,
        categoryKey.split("_")[0],
        5
      );

      if (recentHistory.length < 2) return 0;

      const latest = recentHistory[0];
      const previous = recentHistory[1];
      const timeDiff =
        (latest.timestamp - previous.timestamp) / (1000 * 60 * 60); // Hours

      if (timeDiff === 0) return 0;

      const subscriptionDiff =
        latest.subscriptionRatio - previous.subscriptionRatio;
      return subscriptionDiff / timeDiff; // Subscription change per hour
    } catch (error) {
      return 0;
    }
  }

  // Calculate category trend
  async calculateCategoryTrend(categoryKey, trackingData) {
    try {
      const history = await this.getRecentSubscriptionHistory(
        trackingData.id,
        categoryKey.split("_")[0],
        10
      );

      if (history.length < 3) return "stable";

      const values = history.map((h) => h.subscriptionRatio);
      const trend = this.calculateLinearTrend(values);

      if (trend > 0.1) return "strong_increasing";
      if (trend > 0.05) return "increasing";
      if (trend < -0.1) return "strong_decreasing";
      if (trend < -0.05) return "decreasing";
      return "stable";
    } catch (error) {
      return "stable";
    }
  }

  // Calculate linear trend from values
  calculateLinearTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  // Detect subscription patterns
  async detectSubscriptionPatterns(processedData, trackingData) {
    const patterns = {
      openingDayRush: false,
      closingDayRush: false,
      categoryImbalance: false,
      unusualActivity: false,
      retailDominance: false,
      institutionalInterest: false,
    };

    try {
      // Check for opening day rush
      if (this.isOpeningDay(trackingData)) {
        const velocity = await this.calculateOverallVelocity(trackingData);
        patterns.openingDayRush = velocity > 2; // >2x per hour
      }

      // Check for closing day rush
      if (this.isClosingDay(trackingData)) {
        const velocity = await this.calculateOverallVelocity(trackingData);
        patterns.closingDayRush = velocity > 3; // >3x per hour
      }

      // Check for category imbalance
      const categoryRatios = Array.from(processedData.categories.values()).map(
        (c) => c.subscriptionRatio
      );

      if (categoryRatios.length > 1) {
        const max = Math.max(...categoryRatios);
        const min = Math.min(...categoryRatios);
        patterns.categoryImbalance = max > 0 && (max - min) / max > 0.7;
      }

      // Check for retail dominance
      const retailCategories = Array.from(
        processedData.categories.entries()
      ).filter(([key]) => key.includes("RETAIL"));

      if (retailCategories.length > 0) {
        const retailSubscription = Math.max(
          ...retailCategories.map(([, data]) => data.subscriptionRatio)
        );
        patterns.retailDominance =
          retailSubscription > processedData.overallSubscription * 0.8;
      }

      // Check for institutional interest
      const qibCategories = Array.from(
        processedData.categories.entries()
      ).filter(([key]) => key.includes("QIB"));

      if (qibCategories.length > 0) {
        const qibSubscription = Math.max(
          ...qibCategories.map(([, data]) => data.subscriptionRatio)
        );
        patterns.institutionalInterest = qibSubscription > 2;
      }
    } catch (error) {
      console.error("Error detecting patterns:", error);
    }

    return patterns;
  }

  // Check if today is opening day
  isOpeningDay(trackingData) {
    const today = new Date();
    const openDate = new Date(trackingData.ipoDetails.openDate);
    return today.toDateString() === openDate.toDateString();
  }

  // Check if today is closing day
  isClosingDay(trackingData) {
    const today = new Date();
    const closeDate = new Date(trackingData.ipoDetails.closeDate);
    return today.toDateString() === closeDate.toDateString();
  }

  // Calculate overall subscription velocity
  async calculateOverallVelocity(trackingData) {
    try {
      const recentHistory = await this.getRecentOverallHistory(
        trackingData.id,
        3
      );

      if (recentHistory.length < 2) return 0;

      const latest = recentHistory[0];
      const previous = recentHistory[1];
      const timeDiff =
        (latest.timestamp - previous.timestamp) / (1000 * 60 * 60);

      if (timeDiff === 0) return 0;

      return (
        (latest.overallSubscription - previous.overallSubscription) / timeDiff
      );
    } catch (error) {
      return 0;
    }
  }

  // Generate real-time predictions
  async generateRealtimePredictions(processedData, trackingData) {
    const predictions = {
      closingSubscription: {},
      finalAllotment: {},
      categoryWinner: null,
      timeToFullSubscription: null,
      riskAssessment: {},
    };

    try {
      // Predict closing subscription for each category
      for (const [categoryKey, categoryData] of processedData.categories) {
        const velocity = await this.calculateSubscriptionVelocity(
          categoryKey,
          trackingData
        );
        const remainingHours = this.getRemainingHours(trackingData);

        const projectedIncrease = velocity * remainingHours;
        const closingSubscription = Math.max(
          categoryData.subscriptionRatio,
          categoryData.subscriptionRatio + projectedIncrease
        );

        predictions.closingSubscription[categoryKey] = {
          current: categoryData.subscriptionRatio,
          projected: Math.round(closingSubscription * 100) / 100,
          confidence: this.calculatePredictionConfidence(
            velocity,
            remainingHours
          ),
        };
      }

      // Determine category winner (highest subscription)
      const categorySubscriptions = Array.from(
        processedData.categories.entries()
      )
        .map(([key, data]) => ({
          category: key,
          subscription: data.subscriptionRatio,
        }))
        .sort((a, b) => b.subscription - a.subscription);

      if (categorySubscriptions.length > 0) {
        predictions.categoryWinner = categorySubscriptions[0].category;
      }

      // Calculate time to full subscription
      const currentOverall = processedData.overallSubscription;
      if (currentOverall < 1) {
        const overallVelocity =
          await this.calculateOverallVelocity(trackingData);
        if (overallVelocity > 0) {
          const hoursToFull = (1 - currentOverall) / overallVelocity;
          predictions.timeToFullSubscription = Math.max(0, hoursToFull);
        }
      }
    } catch (error) {
      console.error("Error generating predictions:", error);
      predictions.error = error.message;
    }

    return predictions;
  }

  // Get remaining hours for IPO
  getRemainingHours(trackingData) {
    const now = new Date();
    const closeDate = new Date(trackingData.ipoDetails.closeDate);
    const remainingMs = closeDate.getTime() - now.getTime();
    return Math.max(0, remainingMs / (1000 * 60 * 60));
  }

  // Calculate prediction confidence
  calculatePredictionConfidence(velocity, remainingHours) {
    let confidence = 0.5; // Base confidence

    // More stable velocity = higher confidence
    if (Math.abs(velocity) < 0.1) confidence += 0.2;
    else if (Math.abs(velocity) < 0.5) confidence += 0.1;

    // Less remaining time = higher confidence
    if (remainingHours < 6) confidence += 0.2;
    else if (remainingHours < 24) confidence += 0.1;

    return Math.min(0.9, confidence);
  }

  // Generate subscription insights
  generateSubscriptionInsights(analysis, trackingData) {
    const insights = [];

    try {
      // Overall subscription insights
      if (analysis.overallSubscription > 5) {
        insights.push({
          type: "HIGH_DEMAND",
          severity: "info",
          message: `IPO is heavily oversubscribed at ${analysis.overallSubscription.toFixed(2)}x`,
          impact: "Very low allotment probability across all categories",
        });
      } else if (analysis.overallSubscription < 0.5) {
        insights.push({
          type: "LOW_DEMAND",
          severity: "warning",
          message: `IPO is undersubscribed at ${analysis.overallSubscription.toFixed(2)}x`,
          impact: "High allotment probability but weak market interest",
        });
      }

      // Category-specific insights
      for (const [categoryKey, categoryAnalysis] of analysis.categoryAnalysis) {
        const categoryName = categoryKey.split("_")[0];

        if (categoryAnalysis.status === "massive_oversubscription") {
          insights.push({
            type: "CATEGORY_OVERSUBSCRIPTION",
            category: categoryName,
            severity: "high",
            message: `${categoryName} category extremely oversubscribed (${categoryAnalysis.subscriptionRatio.toFixed(2)}x)`,
            impact: `Allotment probability: ${categoryAnalysis.allotmentProbability}%`,
          });
        }

        if (categoryAnalysis.velocity > 1) {
          insights.push({
            type: "RAPID_GROWTH",
            category: categoryName,
            severity: "medium",
            message: `${categoryName} subscription growing rapidly at ${categoryAnalysis.velocity.toFixed(2)}x per hour`,
            impact: "Subscription may increase significantly by closing",
          });
        }
      }

      // Pattern insights
      if (analysis.patterns.openingDayRush) {
        insights.push({
          type: "OPENING_RUSH",
          severity: "info",
          message: "Strong opening day subscription activity detected",
          impact: "High investor interest from market opening",
        });
      }

      if (analysis.patterns.categoryImbalance) {
        insights.push({
          type: "CATEGORY_IMBALANCE",
          severity: "medium",
          message: "Significant imbalance detected between categories",
          impact: "Consider applying in less subscribed categories",
        });
      }
    } catch (error) {
      console.error("Error generating insights:", error);
    }

    return insights;
  }

  // Generate subscription alerts
  generateSubscriptionAlerts(analysis, trackingData) {
    const alerts = [];

    try {
      // Check for dramatic changes
      for (const [categoryKey, categoryAnalysis] of analysis.categoryAnalysis) {
        if (categoryAnalysis.velocity > 2) {
          alerts.push({
            type: "RAPID_SUBSCRIPTION_GROWTH",
            category: categoryKey,
            severity: "high",
            message: `${categoryKey} subscription increasing very rapidly`,
            value: categoryAnalysis.velocity,
            threshold: 2,
          });
        }

        if (categoryAnalysis.subscriptionRatio > 20) {
          alerts.push({
            type: "EXTREME_OVERSUBSCRIPTION",
            category: categoryKey,
            severity: "critical",
            message: `${categoryKey} extremely oversubscribed`,
            value: categoryAnalysis.subscriptionRatio,
            threshold: 20,
          });
        }
      }

      // Check for unusual patterns
      if (analysis.patterns.closingDayRush) {
        alerts.push({
          type: "CLOSING_DAY_RUSH",
          severity: "medium",
          message: "Last minute subscription rush detected",
          recommendation: "Monitor for final hour changes",
        });
      }
    } catch (error) {
      console.error("Error generating alerts:", error);
    }

    return alerts;
  }

  // Generate subscription recommendations
  generateSubscriptionRecommendations(analysis, trackingData) {
    const recommendations = [];

    try {
      // Overall recommendations
      if (analysis.overallSubscription > 10) {
        recommendations.push({
          type: "AVOID_APPLICATION",
          priority: "high",
          message: "Consider avoiding this IPO due to extreme oversubscription",
          reason: "Very low probability of allotment across all categories",
        });
      } else if (analysis.overallSubscription < 0.8) {
        recommendations.push({
          type: "AGGRESSIVE_APPLICATION",
          priority: "medium",
          message: "Consider maximum application due to undersubscription",
          reason: "High probability of full allotment",
        });
      }

      // Category-specific recommendations
      const sortedCategories = Array.from(
        analysis.categoryAnalysis.entries()
      ).sort((a, b) => a[1].subscriptionRatio - b[1].subscriptionRatio);

      if (sortedCategories.length > 1) {
        const leastSubscribed = sortedCategories[0];
        const mostSubscribed = sortedCategories[sortedCategories.length - 1];

        if (
          leastSubscribed[1].subscriptionRatio <
          mostSubscribed[1].subscriptionRatio * 0.5
        ) {
          recommendations.push({
            type: "CATEGORY_SWITCH",
            priority: "medium",
            message: `Consider applying in ${leastSubscribed[0]} category`,
            reason: `Much lower subscription (${leastSubscribed[1].subscriptionRatio.toFixed(2)}x) compared to ${mostSubscribed[0]} (${mostSubscribed[1].subscriptionRatio.toFixed(2)}x)`,
          });
        }
      }

      // Timing recommendations
      const remainingHours = this.getRemainingHours(trackingData);
      if (remainingHours < 6 && analysis.overallSubscription < 1) {
        recommendations.push({
          type: "URGENT_APPLICATION",
          priority: "high",
          message:
            "Apply immediately - IPO closing soon and still undersubscribed",
          reason: "Last chance for high allotment probability",
        });
      }
    } catch (error) {
      console.error("Error generating recommendations:", error);
    }

    return recommendations;
  }

  // Store subscription data in database
  async storeSubscriptionData(processedData, trackingData) {
    try {
      const records = [];

      for (const [categoryKey, categoryData] of processedData.categories) {
        const record = await prisma.subscriptionData.create({
          data: {
            ipoId: trackingData.id,
            category: categoryData.category,
            subCategory: categoryData.subCategory || null,
            quantity: categoryData.quantity,
            bidCount: categoryData.bidCount,
            subscriptionRatio: categoryData.subscriptionRatio,
            timestamp: categoryData.timestamp,
            // Store additional metadata
            metadata: JSON.stringify({
              amount: categoryData.amount,
              averageBidSize: categoryData.averageBidSize,
              dataQuality: processedData.metadata.qualityScore,
            }),
          },
        });

        records.push(record);
      }

      return records;
    } catch (error) {
      console.error("Error storing subscription data:", error);
      throw error;
    }
  }

  // Update tracking data with latest information
  async updateTrackingData(trackingData, processedData, analysis) {
    // Update current subscription
    trackingData.currentSubscription.overall =
      processedData.overallSubscription;
    trackingData.currentSubscription.categories.clear();

    for (const [categoryKey, categoryData] of processedData.categories) {
      trackingData.currentSubscription.categories.set(categoryKey, {
        subscriptionRatio: categoryData.subscriptionRatio,
        bidCount: categoryData.bidCount,
        amount: categoryData.amount,
      });
    }

    trackingData.currentSubscription.lastUpdated = Date.now();

    // Update statistics
    trackingData.statistics.averageSubscriptionRate =
      (trackingData.statistics.averageSubscriptionRate *
        trackingData.statistics.successfulUpdates +
        processedData.overallSubscription) /
      (trackingData.statistics.successfulUpdates + 1);

    trackingData.statistics.peakSubscription = Math.max(
      trackingData.statistics.peakSubscription,
      processedData.overallSubscription
    );

    // Update subscription velocity
    trackingData.statistics.subscriptionVelocity =
      await this.calculateOverallVelocity(trackingData);

    // Update trends (add to hourly data and clean old data)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    // Add current data point
    trackingData.trends.hourly.push({
      subscription: processedData.overallSubscription,
      timestamp: now,
    });

    trackingData.trends.daily.push({
      subscription: processedData.overallSubscription,
      timestamp: now,
    });

    trackingData.trends.overall.push({
      subscription: processedData.overallSubscription,
      timestamp: now,
    });

    // Clean old data
    trackingData.trends.hourly = trackingData.trends.hourly.filter(
      (t) => now - t.timestamp < oneDay
    );
    trackingData.trends.daily = trackingData.trends.daily.filter(
      (t) => now - t.timestamp < oneWeek
    );
    // Keep all overall trend data

    // Update patterns
    Object.assign(trackingData.patterns, analysis.patterns);

    // Update alerts
    if (analysis.alerts.length > 0) {
      analysis.alerts.forEach((alert) => {
        trackingData.alerts.add(JSON.stringify(alert));
      });

      // Keep only last 50 alerts
      if (trackingData.alerts.size > 50) {
        const alertsArray = Array.from(trackingData.alerts);
        trackingData.alerts.clear();
        alertsArray
          .slice(-50)
          .forEach((alert) => trackingData.alerts.add(alert));
      }
    }

    // Update allotment predictions
    if (analysis.predictions.finalAllotment) {
      this.allotmentPredictions.set(
        trackingData.id,
        analysis.predictions.finalAllotment
      );
    }
  }

  // Cache and broadcast subscription updates
  async cacheAndBroadcastSubscription(processedData, trackingData, analysis) {
    try {
      // Prepare update data for broadcasting
      const updateData = {
        ipoId: trackingData.id,
        symbol: trackingData.symbol,
        overallSubscription: processedData.overallSubscription,
        categories: Array.from(processedData.categories.entries()).map(
          ([key, data]) => ({
            category: key,
            subscriptionRatio: data.subscriptionRatio,
            bidCount: data.bidCount,
            amount: data.amount,
            analysis: analysis.categoryAnalysis.get(key),
          })
        ),
        trends: {
          velocity: trackingData.statistics.subscriptionVelocity,
          peak: trackingData.statistics.peakSubscription,
        },
        patterns: analysis.patterns,
        predictions: analysis.predictions,
        insights: analysis.insights.slice(0, 5), // Top 5 insights
        recommendations: analysis.recommendations.slice(0, 3), // Top 3 recommendations
        metadata: {
          dataQuality: processedData.metadata.qualityScore,
          lastUpdated: Date.now(),
          totalApplications: processedData.totalApplications,
          totalAmount: processedData.totalAmount,
        },
      };

      // Cache real-time data
      await cache.cacheRealTimeData(
        "SUBSCRIPTION",
        trackingData.id,
        updateData
      );
      await cache.cacheRealTimeData(
        "SUBSCRIPTION_SYMBOL",
        trackingData.symbol,
        updateData
      );

      // Broadcast to WebSocket clients
      await webSocketService.broadcastSubscriptionUpdate(
        trackingData.symbol,
        updateData,
        {
          includeAnalytics: true,
          includePredictions: true,
        }
      );

      console.log(
        `📡 Cached and broadcast subscription update for ${trackingData.symbol}`
      );
    } catch (error) {
      console.error("Error caching and broadcasting subscription:", error);
    }
  }

  // Check and trigger alerts
  async checkAndTriggerAlerts(processedData, trackingData, analysis) {
    try {
      // Broadcast high-severity alerts
      for (const alert of analysis.alerts) {
        if (alert.severity === "high" || alert.severity === "critical") {
          await webSocketService.broadcastAlert("subscription_alert", {
            ipoId: trackingData.id,
            symbol: trackingData.symbol,
            alert,
            currentSubscription: processedData.overallSubscription,
            timestamp: Date.now(),
          });

          this.performance.alertsTriggered++;
        }
      }

      // Check for milestone alerts (1x, 5x, 10x subscription)
      const milestones = [1, 5, 10, 20, 50];
      for (const milestone of milestones) {
        if (
          processedData.overallSubscription >= milestone &&
          trackingData.statistics.peakSubscription < milestone
        ) {
          await webSocketService.broadcastAlert("subscription_milestone", {
            ipoId: trackingData.id,
            symbol: trackingData.symbol,
            milestone,
            currentSubscription: processedData.overallSubscription,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("Error checking alerts:", error);
    }
  }

  // Helper methods
  getTrackingPriority(status) {
    switch (status) {
      case "open":
        return "HIGH_PRIORITY";
      case "upcoming":
        return "MEDIUM_PRIORITY";
      case "closed":
        return "LOW_PRIORITY";
      default:
        return "LOW_PRIORITY";
    }
  }

  getTrackingInterval(status) {
    switch (status) {
      case "open":
        return this.trackingConfig.ACTIVE_IPO_INTERVAL;
      case "upcoming":
        return this.trackingConfig.UPCOMING_IPO_INTERVAL;
      case "closed":
        return this.trackingConfig.CLOSED_IPO_INTERVAL;
      default:
        return this.trackingConfig.CLOSED_IPO_INTERVAL;
    }
  }

  addToTrackingQueue(ipoId, priority) {
    const queue = this.trackingQueues[priority];
    if (queue && !queue.includes(ipoId)) {
      queue.push(ipoId);
    }
  }

  getLatestSubscriptionByCategory(subscriptionData) {
    const latest = new Map();

    subscriptionData.forEach((item) => {
      const key = `${item.category}_${item.subCategory || ""}`;
      if (!latest.has(key) || item.timestamp > latest.get(key).timestamp) {
        latest.set(key, item);
      }
    });

    return latest;
  }

  async getRecentSubscriptionHistory(ipoId, category, count) {
    try {
      return await prisma.subscriptionData.findMany({
        where: {
          ipoId,
          category,
        },
        orderBy: { timestamp: "desc" },
        take: count,
      });
    } catch (error) {
      return [];
    }
  }

  async getRecentOverallHistory(ipoId, count) {
    try {
      const history = await prisma.subscriptionData.findMany({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        take: count * 5, // Get more records to aggregate
      });

      // Aggregate by timestamp to get overall subscription
      const timelineMap = new Map();

      history.forEach((record) => {
        const timeKey = record.timestamp.getTime();
        if (!timelineMap.has(timeKey)) {
          timelineMap.set(timeKey, {
            timestamp: timeKey,
            overallSubscription: 0,
          });
        }

        const entry = timelineMap.get(timeKey);
        entry.overallSubscription = Math.max(
          entry.overallSubscription,
          record.subscriptionRatio || 0
        );
      });

      return Array.from(timelineMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, count);
    } catch (error) {
      return [];
    }
  }

  processHistoricalData(subscriptionData) {
    return this.aggregateSubscriptionTimeline(subscriptionData);
  }

  initializeCategoryTracking(categories) {
    const categoryMap = new Map();

    categories.forEach((category) => {
      const key = `${category.categoryCode}_${category.subCategoryCode || ""}`;
      categoryMap.set(key, {
        config: category,
        currentSubscription: 0,
        history: [],
        alerts: [],
      });
    });

    return categoryMap;
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    const performanceInterval = setInterval(
      () => {
        this.logPerformanceMetrics();
      },
      5 * 60 * 1000
    ); // Every 5 minutes

    this.activeIntervals.set("PERFORMANCE", performanceInterval);

    console.log("📊 Started subscription tracking performance monitoring");
  }

  updatePerformanceMetrics(success, latency) {
    this.performance.totalTracked++;

    if (success) {
      this.performance.successfulUpdates++;
    } else {
      this.performance.failedUpdates++;
    }

    // Update average latency
    this.performance.averageLatency =
      (this.performance.averageLatency * (this.performance.totalTracked - 1) +
        latency) /
      this.performance.totalTracked;

    this.performance.lastTrackedAt = Date.now();
  }

  logPerformanceMetrics() {
    const metrics = this.getPerformanceMetrics();
    console.log("📊 Subscription Tracker Performance:", metrics);

    // Store metrics in cache
    cache.set("subscription_tracker_metrics", metrics, 300);
  }

  getPerformanceMetrics() {
    const successRate =
      this.performance.totalTracked > 0
        ? (this.performance.successfulUpdates / this.performance.totalTracked) *
          100
        : 100;

    return {
      totalTracked: this.performance.totalTracked,
      successfulUpdates: this.performance.successfulUpdates,
      failedUpdates: this.performance.failedUpdates,
      successRate: `${successRate.toFixed(2)}%`,
      averageLatency: Math.round(this.performance.averageLatency),
      alertsTriggered: this.performance.alertsTriggered,
      trackedIPOs: this.trackedIPOs.size,
      activePredictions: this.allotmentPredictions.size,
      lastTrackedAt: this.performance.lastTrackedAt
        ? new Date(this.performance.lastTrackedAt).toISOString()
        : null,
    };
  }

  // Real-time analysis
  startRealtimeAnalysis() {
    const analysisInterval = setInterval(
      () => {
        this.performRealtimeSystemAnalysis();
      },
      2 * 60 * 1000
    ); // Every 2 minutes

    this.activeIntervals.set("REALTIME_ANALYSIS", analysisInterval);

    console.log("🔬 Started real-time subscription analysis");
  }

  async performRealtimeSystemAnalysis() {
    try {
      // Analyze overall market trends
      const marketTrends = await this.analyzeMarketTrends();

      // Update prediction accuracy
      await this.updatePredictionAccuracy();

      // Detect system-wide patterns
      await this.detectSystemPatterns();

      // Broadcast system insights
      await this.broadcastSystemInsights(marketTrends);
    } catch (error) {
      console.error("Error in real-time system analysis:", error);
    }
  }

  async analyzeMarketTrends() {
    // Analyze trends across all tracked IPOs
    const trends = {
      averageSubscription: 0,
      oversubscribedCount: 0,
      undersubscribedCount: 0,
      dominantCategory: null,
      marketSentiment: "neutral",
    };

    if (this.trackedIPOs.size === 0) return trends;

    let totalSubscription = 0;
    const categoryTotals = new Map();

    for (const [ipoId, trackingData] of this.trackedIPOs) {
      const currentSub = trackingData.currentSubscription.overall;
      totalSubscription += currentSub;

      if (currentSub > 1) trends.oversubscribedCount++;
      else trends.undersubscribedCount++;

      // Aggregate category data
      for (const [categoryKey, categoryData] of trackingData.currentSubscription
        .categories) {
        const category = categoryKey.split("_")[0];
        if (!categoryTotals.has(category)) {
          categoryTotals.set(category, { total: 0, count: 0 });
        }
        const categoryTotal = categoryTotals.get(category);
        categoryTotal.total += categoryData.subscriptionRatio;
        categoryTotal.count++;
      }
    }

    trends.averageSubscription = totalSubscription / this.trackedIPOs.size;

    // Find dominant category
    let maxAverage = 0;
    for (const [category, data] of categoryTotals) {
      const average = data.total / data.count;
      if (average > maxAverage) {
        maxAverage = average;
        trends.dominantCategory = category;
      }
    }

    // Determine market sentiment
    if (trends.averageSubscription > 3) trends.marketSentiment = "very_bullish";
    else if (trends.averageSubscription > 1.5)
      trends.marketSentiment = "bullish";
    else if (trends.averageSubscription < 0.5)
      trends.marketSentiment = "bearish";
    else if (trends.averageSubscription < 0.8)
      trends.marketSentiment = "cautious";

    return trends;
  }

  async updatePredictionAccuracy() {
    // Calculate accuracy of closed IPO predictions
    // This would compare predictions made with actual final results
    // Implementation depends on having final allotment data
  }

  async detectSystemPatterns() {
    // Detect patterns across multiple IPOs
    // Such as sector-wise trends, market timing patterns, etc.
  }

  async broadcastSystemInsights(trends) {
    try {
      await webSocketService.broadcastSystemStatus({
        type: "subscription_market_analysis",
        trends,
        trackedIPOs: this.trackedIPOs.size,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error broadcasting system insights:", error);
    }
  }

  // Maintenance tasks
  startMaintenanceTasks() {
    const maintenanceInterval = setInterval(
      () => {
        this.performMaintenance();
      },
      30 * 60 * 1000
    ); // Every 30 minutes

    this.activeIntervals.set("MAINTENANCE", maintenanceInterval);

    console.log("🧹 Started subscription tracker maintenance tasks");
  }

  performMaintenance() {
    const now = Date.now();

    // Clean up old trend data
    for (const [ipoId, trackingData] of this.trackedIPOs) {
      const oneDay = 24 * 60 * 60 * 1000;
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      trackingData.trends.hourly = trackingData.trends.hourly.filter(
        (t) => now - t.timestamp < oneDay
      );
      trackingData.trends.daily = trackingData.trends.daily.filter(
        (t) => now - t.timestamp < oneWeek
      );
    }

    // Clean up old historical data
    const retentionPeriod = this.trackingConfig.HISTORICAL_RETENTION;
    for (const [ipoId, history] of this.subscriptionHistory) {
      this.subscriptionHistory.set(
        ipoId,
        history.filter(
          (h) => now - new Date(h.timestamp).getTime() < retentionPeriod
        )
      );
    }

    // Clean up old predictions for closed IPOs
    for (const [ipoId] of this.allotmentPredictions) {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (!trackingData || trackingData.status === "listed") {
        // Keep predictions for 7 days after listing for accuracy tracking
        const listingTime = trackingData
          ? new Date(trackingData.ipoDetails.closeDate).getTime() +
            7 * 24 * 60 * 60 * 1000
          : now - 8 * 24 * 60 * 60 * 1000;

        if (now > listingTime) {
          this.allotmentPredictions.delete(ipoId);
        }
      }
    }

    console.log("🧹 Subscription tracker maintenance completed");
  }

  // Manual operations
  async addIPOTracking(ipoId) {
    try {
      const ipo = await prisma.iPO.findUnique({
        where: { id: ipoId },
        include: {
          subscription: {
            orderBy: { timestamp: "desc" },
            take: 50,
          },
          categories: true,
          analytics: true,
        },
      });

      if (!ipo) {
        throw new Error(`IPO not found: ${ipoId}`);
      }

      await this.initializeIPOSubscriptionTracking(ipo);

      console.log(`✅ Added subscription tracking for IPO: ${ipo.symbol}`);
      return true;
    } catch (error) {
      console.error(`Error adding IPO subscription tracking:`, error);
      throw error;
    }
  }

  async removeIPOTracking(ipoId) {
    const trackingData = this.trackedIPOs.get(ipoId);

    if (trackingData) {
      // Remove from all queues
      Object.values(this.trackingQueues).forEach((queue) => {
        const index = queue.indexOf(ipoId);
        if (index > -1) queue.splice(index, 1);
      });

      // Remove tracking data
      this.trackedIPOs.delete(ipoId);
      this.subscriptionHistory.delete(ipoId);
      this.categoryWiseData.delete(ipoId);
      this.allotmentPredictions.delete(ipoId);

      console.log(
        `✅ Removed subscription tracking for IPO: ${trackingData.symbol}`
      );
      return true;
    }

    return false;
  }

  async forceTrackIPO(ipoId) {
    try {
      const result = await this.trackIPOSubscription(ipoId);
      console.log(`✅ Force tracked subscription for IPO: ${ipoId}`);
      return result;
    } catch (error) {
      console.error(
        `Error force tracking subscription for IPO ${ipoId}:`,
        error
      );
      throw error;
    }
  }

  // Service status and health check
  getStatus() {
    return {
      isRunning: this.isRunning,
      trackedIPOs: this.trackedIPOs.size,
      performance: this.getPerformanceMetrics(),
      queues: {
        highPriority: this.trackingQueues.HIGH_PRIORITY.length,
        mediumPriority: this.trackingQueues.MEDIUM_PRIORITY.length,
        lowPriority: this.trackingQueues.LOW_PRIORITY.length,
      },
      categories: Object.keys(this.categories).length,
      activePredictions: this.allotmentPredictions.size,
      activeIntervals: this.activeIntervals.size,
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheck() {
    try {
      // Check database connectivity
      const dbCheck = await prisma.subscriptionData.findFirst();

      // Check cache connectivity
      const cacheCheck = await cache.healthCheck();

      // Check NSE API connectivity
      const apiCheck = await nseAPI.healthCheck();

      const isHealthy =
        this.isRunning &&
        dbCheck !== undefined &&
        cacheCheck.status === "healthy" &&
        apiCheck.status === "healthy";

      return {
        status: isHealthy ? "healthy" : "degraded",
        isRunning: this.isRunning,
        database: dbCheck !== undefined ? "connected" : "disconnected",
        cache: cacheCheck.status,
        nseAPI: apiCheck.status,
        performance: this.getPerformanceMetrics(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Stop service gracefully
  async stop() {
    console.log("🛑 Stopping Subscription Tracker Service...");

    this.isRunning = false;

    // Clear all active intervals
    for (const [name, intervalId] of this.activeIntervals) {
      clearInterval(intervalId);
      console.log(`⏹️  Stopped ${name} interval`);
    }

    this.activeIntervals.clear();

    // Broadcast shutdown notification
    try {
      await webSocketService.broadcastSystemStatus(
        {
          type: "subscription_tracker_shutdown",
          message: "Subscription Tracker service has been stopped",
          finalMetrics: this.getPerformanceMetrics(),
          timestamp: Date.now(),
        },
        { priority: "high" }
      );
    } catch (error) {
      console.error("Error broadcasting shutdown:", error);
    }

    // Clear data structures
    this.trackedIPOs.clear();
    this.subscriptionHistory.clear();
    this.categoryWiseData.clear();
    this.allotmentPredictions.clear();

    Object.values(this.trackingQueues).forEach((queue) => (queue.length = 0));

    // Clear pattern tracking
    Object.values(this.patterns).forEach((pattern) => {
      if (pattern instanceof Map) pattern.clear();
    });

    console.log("✅ Subscription Tracker Service stopped gracefully");
    console.log("📊 Final Performance Metrics:", this.getPerformanceMetrics());
  }
}

// Export singleton instance
export const subscriptionTrackerService = new SubscriptionTrackerService();

// Auto-start if not in test environment
if (
  process.env.NODE_ENV !== "test" &&
  process.env.AUTO_START_SUBSCRIPTION_TRACKER !== "false"
) {
  subscriptionTrackerService.start().catch((error) => {
    console.error("Failed to auto-start Subscription Tracker Service:", error);
    process.exit(1);
  });
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(
    `🛑 Received ${signal}, shutting down Subscription Tracker Service gracefully...`
  );
  try {
    await subscriptionTrackerService.stop();
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

// Export additional utilities
export const {
  addIPOTracking: addSubscriptionTracking,
  removeIPOTracking: removeSubscriptionTracking,
  forceTrackIPO: forceSubscriptionTrack,
} = subscriptionTrackerService;

export default subscriptionTrackerService;
