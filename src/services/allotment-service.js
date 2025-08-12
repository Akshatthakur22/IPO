import { cache } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { webSocketService } from "../lib/websocket.js";
import { analyticsService } from "../lib/analytics.js";
import { nseAPI } from "../lib/nse-api.js";

class AllotmentService {
  constructor() {
    this.isRunning = false;
    this.trackedIPOs = new Map();
    this.allotmentResults = new Map();
    this.allotmentPredictions = new Map();
    this.userApplications = new Map();

    // Allotment tracking configuration
    this.trackingConfig = {
      ACTIVE_TRACKING_INTERVAL: 2 * 60 * 1000, // 2 minutes for active tracking
      PASSIVE_TRACKING_INTERVAL: 15 * 60 * 1000, // 15 minutes for closed IPOs
      RESULT_PROCESSING_INTERVAL: 5 * 60 * 1000, // 5 minutes for result processing
      PREDICTION_UPDATE_INTERVAL: 30 * 60 * 1000, // 30 minutes for prediction updates
      MAX_RETRIES: 3,
      BATCH_SIZE: 5,
      NOTIFICATION_DELAY: 1 * 60 * 1000, // 1 minute delay for notifications
    };

    // Allotment categories and their characteristics
    this.allotmentCategories = {
      RETAIL: {
        code: "RETAIL",
        name: "Retail Individual Investors",
        minInvestment: 15000,
        maxInvestment: 200000,
        maxLots: 13, // Maximum lots for retail
        allotmentMethod: "lottery",
        reservationQuota: 0.35, // 35% reservation
        priority: 1,
      },
      HNI: {
        code: "HNI",
        name: "High Net Worth Individual",
        minInvestment: 200000,
        maxInvestment: 1000000,
        allotmentMethod: "proportionate",
        reservationQuota: 0.15, // 15% under NIB
        priority: 2,
      },
      QIB: {
        code: "QIB",
        name: "Qualified Institutional Buyers",
        minInvestment: 100000,
        maxInvestment: null, // No upper limit
        allotmentMethod: "discretionary",
        reservationQuota: 0.5, // 50% reservation
        priority: 3,
      },
      NIB: {
        code: "NIB",
        name: "Non-Institutional Buyers",
        minInvestment: 200000,
        maxInvestment: null,
        allotmentMethod: "proportionate",
        reservationQuota: 0.15, // 15% reservation
        priority: 4,
      },
      EMPLOYEE: {
        code: "EMPLOYEE",
        name: "Employee Reservation",
        minInvestment: 15000,
        maxInvestment: 500000,
        allotmentMethod: "proportionate",
        reservationQuota: 0.05, // Up to 5%
        priority: 5,
      },
    };

    // Allotment status types
    this.allotmentStatus = {
      PENDING: "pending",
      PROCESSING: "processing",
      ALLOTTED: "allotted",
      NOT_ALLOTTED: "not_allotted",
      PARTIALLY_ALLOTTED: "partially_allotted",
      REFUND_INITIATED: "refund_initiated",
      COMPLETED: "completed",
    };

    // Performance metrics
    this.performance = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      resultsFetched: 0,
      notificationsSent: 0,
      predictionAccuracy: 0,
      averageProcessingTime: 0,
      lastProcessedAt: null,
    };

    // Allotment analysis and insights
    this.analysisMetrics = {
      categoryWiseAllotment: new Map(),
      overallAllotmentRatio: new Map(),
      refundStatistics: new Map(),
      processingTimelines: new Map(),
    };

    // User notification preferences
    this.notificationPreferences = new Map();

    // Active processing queues
    this.processingQueues = {
      ALLOTMENT_CHECK: [],
      RESULT_PROCESSING: [],
      NOTIFICATION: [],
      PREDICTION_UPDATE: [],
    };

    // Active intervals
    this.activeIntervals = new Map();

    // Allotment patterns and insights
    this.patterns = {
      categoryPerformance: new Map(),
      allotmentTrends: new Map(),
      registrarEfficiency: new Map(),
      timelinePatterns: new Map(),
    };

    console.log("🎯 Allotment Service initialized");
  }

  // Start comprehensive allotment tracking and management
  async start() {
    if (this.isRunning) {
      console.log("⚠️  Allotment Service is already running");
      return;
    }

    try {
      console.log("🚀 Starting Enhanced Allotment Service...");

      // Initialize tracking data
      await this.initializeAllotmentTracking();

      // Start tracking processes
      this.startAllotmentTracking();

      // Start result processing
      this.startResultProcessing();

      // Start prediction updates
      this.startPredictionUpdates();

      // Start notification processing
      this.startNotificationProcessing();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Start maintenance tasks
      this.startMaintenanceTasks();

      this.isRunning = true;

      console.log("✅ Enhanced Allotment Service started successfully");
      console.log(`🎯 Tracking allotments for ${this.trackedIPOs.size} IPOs`);

      // Broadcast service start
      await webSocketService.broadcastSystemStatus({
        type: "allotment_service_started",
        trackedIPOs: this.trackedIPOs.size,
        categories: Object.keys(this.allotmentCategories).length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Failed to start Allotment Service:", error);
      throw error;
    }
  }

  // Initialize allotment tracking from database
  async initializeAllotmentTracking() {
    console.log("🎯 Initializing allotment tracking...");

    try {
      // Get IPOs that need allotment tracking (closed but not listed yet)
      const ipos = await prisma.iPO.findMany({
        where: {
          isActive: true,
          status: { in: ["closed", "listed"] },
          closeDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        include: {
          categories: true,
          subscription: {
            orderBy: { timestamp: "desc" },
            take: 1, // Latest subscription data
          },
          analytics: true,
        },
      });

      // Initialize tracking for each IPO
      for (const ipo of ipos) {
        await this.initializeIPOAllotmentTracking(ipo);
      }

      // Load user applications
      await this.loadUserApplications();

      // Load existing allotment results
      await this.loadExistingAllotmentResults();

      console.log(`✅ Initialized allotment tracking for ${ipos.length} IPOs`);
    } catch (error) {
      console.error("❌ Failed to initialize allotment tracking:", error);
      throw error;
    }
  }

  // Initialize individual IPO allotment tracking
  async initializeIPOAllotmentTracking(ipo) {
    try {
      // Calculate allotment predictions
      const predictions = await this.calculateAllotmentPredictions(ipo);

      // Determine tracking priority
      const priority = this.getAllotmentTrackingPriority(ipo);

      // Calculate expected allotment timeline
      const timeline = this.calculateAllotmentTimeline(ipo);

      // Initialize tracking data
      const trackingData = {
        id: ipo.id,
        symbol: ipo.symbol,
        name: ipo.name,
        status: ipo.status,
        priority,
        timeline,
        predictions,

        // IPO details
        ipoDetails: {
          openDate: ipo.openDate,
          closeDate: ipo.closeDate,
          listingDate: ipo.listingDate,
          allotmentDate: ipo.allotmentDate,
          registrar: ipo.registrar,
          lotSize: ipo.lotSize,
          priceRange: { min: ipo.minPrice, max: ipo.maxPrice },
          finalPrice: ipo.cutOffPrice || ipo.maxPrice,
          issueSize: ipo.issueSize,
        },

        // Subscription data
        subscriptionData:
          ipo.subscription.length > 0 ? ipo.subscription[0] : null,

        // Allotment tracking
        allotmentStatus: "pending",
        lastChecked: null,
        resultAvailable: false,
        allotmentResults: new Map(),

        // User applications tracking
        userApplications: new Map(),

        // Performance tracking
        statistics: {
          totalChecks: 0,
          successfulChecks: 0,
          totalApplications: 0,
          allottedApplications: 0,
          refundedApplications: 0,
          processingTime: null,
        },

        // Analysis and insights
        analysis: {
          overallAllotmentRatio: 0,
          categoryWiseRatio: new Map(),
          refundPercentage: 0,
          averageAllotmentSize: 0,
          patterns: [],
          insights: [],
        },

        // Notifications
        notifications: {
          resultAvailable: false,
          usersNotified: 0,
          pendingNotifications: [],
        },
      };

      this.trackedIPOs.set(ipo.id, trackingData);

      // Add to processing queue based on priority
      this.addToProcessingQueue(ipo.id, "ALLOTMENT_CHECK");

      console.log(
        `🎯 Initialized allotment tracking for ${ipo.symbol} (Priority: ${priority})`
      );
    } catch (error) {
      console.error(
        `Error initializing allotment tracking for IPO ${ipo.symbol}:`,
        error
      );
    }
  }

  // Calculate allotment predictions based on subscription data
  async calculateAllotmentPredictions(ipo) {
    const predictions = {
      overall: {
        probability: 0,
        expectedRatio: 0,
        confidence: 0.5,
      },
      categories: new Map(),
      insights: [],
      methodology: "subscription_based",
    };

    try {
      // Get latest subscription data
      const subscriptionData =
        ipo.subscription.length > 0 ? ipo.subscription[0] : null;

      if (!subscriptionData) {
        predictions.insights.push(
          "No subscription data available for accurate prediction"
        );
        return predictions;
      }

      // Get category-wise subscription ratios
      const categorySubscriptions = await this.getCategoryWiseSubscription(
        ipo.id
      );

      // Calculate predictions for each category
      for (const [categoryCode, subscription] of categorySubscriptions) {
        const categoryConfig = this.allotmentCategories[categoryCode];
        if (!categoryConfig) continue;

        const categoryPrediction = this.calculateCategoryAllotmentPrediction(
          subscription,
          categoryConfig
        );

        predictions.categories.set(categoryCode, categoryPrediction);
      }

      // Calculate overall prediction
      predictions.overall = this.calculateOverallAllotmentPrediction(
        predictions.categories
      );

      // Generate insights
      predictions.insights = this.generateAllotmentInsights(
        predictions.categories,
        ipo
      );
    } catch (error) {
      console.error("Error calculating allotment predictions:", error);
      predictions.insights.push(
        "Error calculating predictions - using fallback estimates"
      );
    }

    return predictions;
  }

  // Calculate category-wise allotment prediction
  calculateCategoryAllotmentPrediction(subscription, categoryConfig) {
    const prediction = {
      category: categoryConfig.code,
      subscriptionRatio: subscription.subscriptionRatio || 0,
      allotmentProbability: 0,
      expectedLots: 0,
      confidence: 0.7,
      method: categoryConfig.allotmentMethod,
    };

    const subscriptionRatio = subscription.subscriptionRatio || 0;

    if (subscriptionRatio <= 0) {
      prediction.allotmentProbability = 0;
      prediction.confidence = 0.9;
      return prediction;
    }

    // Calculate based on allotment method
    switch (categoryConfig.allotmentMethod) {
      case "lottery":
        // Retail lottery system
        if (subscriptionRatio <= 1) {
          prediction.allotmentProbability = 95; // Almost guaranteed if undersubscribed
        } else if (subscriptionRatio <= 2) {
          prediction.allotmentProbability = 85;
        } else if (subscriptionRatio <= 5) {
          prediction.allotmentProbability = 60;
        } else if (subscriptionRatio <= 10) {
          prediction.allotmentProbability = 35;
        } else {
          prediction.allotmentProbability = Math.max(
            10,
            100 / subscriptionRatio
          );
        }

        // Expected lots in lottery
        prediction.expectedLots =
          subscriptionRatio > 1
            ? Math.min(
                categoryConfig.maxLots || 1,
                Math.ceil(categoryConfig.maxLots / subscriptionRatio)
              )
            : categoryConfig.maxLots || 1;
        break;

      case "proportionate":
        // Proportionate allotment
        if (subscriptionRatio <= 1) {
          prediction.allotmentProbability = 100;
          prediction.expectedLots = Math.floor(
            subscription.quantity / subscription.bidCount
          );
        } else {
          prediction.allotmentProbability = Math.min(
            95,
            100 / subscriptionRatio
          );
          prediction.expectedLots = Math.max(
            1,
            Math.floor((1 / subscriptionRatio) * 10)
          ); // Scaled expectation
        }
        break;

      case "discretionary":
        // QIB discretionary allotment
        prediction.allotmentProbability =
          subscriptionRatio <= 1
            ? 90
            : Math.max(70, 100 - (subscriptionRatio - 1) * 20);
        prediction.expectedLots = Math.floor(Math.random() * 10) + 1; // Variable for institutions
        break;

      default:
        prediction.allotmentProbability = Math.min(
          90,
          100 / Math.max(subscriptionRatio, 1)
        );
        prediction.expectedLots = 1;
    }

    // Adjust confidence based on subscription ratio stability
    if (subscriptionRatio > 0.5 && subscriptionRatio < 20) {
      prediction.confidence = Math.min(0.9, prediction.confidence + 0.2);
    }

    return prediction;
  }

  // Calculate overall allotment prediction
  calculateOverallAllotmentPrediction(categoryPredictions) {
    if (categoryPredictions.size === 0) {
      return { probability: 0, expectedRatio: 0, confidence: 0 };
    }

    let totalProbability = 0;
    let totalConfidence = 0;
    let count = 0;

    for (const [category, prediction] of categoryPredictions) {
      totalProbability +=
        prediction.allotmentProbability * prediction.confidence;
      totalConfidence += prediction.confidence;
      count++;
    }

    const weightedProbability =
      count > 0 ? totalProbability / totalConfidence : 0;
    const avgConfidence = count > 0 ? totalConfidence / count : 0;

    // Calculate expected allotment ratio
    const avgSubscriptionRatio =
      Array.from(categoryPredictions.values()).reduce(
        (sum, pred) => sum + pred.subscriptionRatio,
        0
      ) / count;

    const expectedRatio = Math.min(1, 1 / Math.max(avgSubscriptionRatio, 1));

    return {
      probability: Math.round(weightedProbability * 100) / 100,
      expectedRatio: Math.round(expectedRatio * 10000) / 10000,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }

  // Generate allotment insights
  generateAllotmentInsights(categoryPredictions, ipo) {
    const insights = [];

    try {
      // Category-specific insights
      for (const [category, prediction] of categoryPredictions) {
        if (prediction.allotmentProbability > 80) {
          insights.push({
            type: "HIGH_PROBABILITY",
            category,
            message: `High allotment probability (${prediction.allotmentProbability.toFixed(1)}%) for ${category} category`,
            confidence: prediction.confidence,
          });
        } else if (prediction.allotmentProbability < 30) {
          insights.push({
            type: "LOW_PROBABILITY",
            category,
            message: `Low allotment probability (${prediction.allotmentProbability.toFixed(1)}%) for ${category} category`,
            confidence: prediction.confidence,
          });
        }

        if (prediction.subscriptionRatio > 10) {
          insights.push({
            type: "HEAVY_OVERSUBSCRIPTION",
            category,
            message: `${category} heavily oversubscribed (${prediction.subscriptionRatio.toFixed(2)}x)`,
            impact: "Very low allotment chances",
          });
        }
      }

      // Overall insights
      const retailPrediction = categoryPredictions.get("RETAIL");
      const qibPrediction = categoryPredictions.get("QIB");

      if (retailPrediction && qibPrediction) {
        if (
          retailPrediction.allotmentProbability >
          qibPrediction.allotmentProbability * 1.5
        ) {
          insights.push({
            type: "RETAIL_FAVORABLE",
            message:
              "Retail category shows better allotment prospects than institutional",
            suggestion: "Consider retail application if eligible",
          });
        } else if (
          qibPrediction.allotmentProbability >
          retailPrediction.allotmentProbability * 1.5
        ) {
          insights.push({
            type: "INSTITUTIONAL_FAVORABLE",
            message: "Institutional categories show better allotment prospects",
            suggestion: "HNI/QIB application may have better chances",
          });
        }
      }

      // Timeline insights
      if (ipo.allotmentDate) {
        const daysToAllotment = Math.ceil(
          (new Date(ipo.allotmentDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        );

        if (daysToAllotment > 0 && daysToAllotment <= 7) {
          insights.push({
            type: "ALLOTMENT_TIMELINE",
            message: `Allotment expected within ${daysToAllotment} days`,
            date: ipo.allotmentDate,
          });
        }
      }
    } catch (error) {
      insights.push({
        type: "ERROR",
        message: "Error generating some insights",
      });
    }

    return insights;
  }

  // Get category-wise subscription data
  async getCategoryWiseSubscription(ipoId) {
    try {
      const subscriptions = await prisma.subscriptionData.findMany({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        take: 20, // Recent data
      });

      const categoryMap = new Map();

      // Group by category and get latest
      subscriptions.forEach((sub) => {
        const category = sub.category;
        if (
          !categoryMap.has(category) ||
          sub.timestamp > categoryMap.get(category).timestamp
        ) {
          categoryMap.set(category, sub);
        }
      });

      return categoryMap;
    } catch (error) {
      console.error("Error fetching category-wise subscription:", error);
      return new Map();
    }
  }

  // Load user applications for tracking
  async loadUserApplications() {
    try {
      const applications = await prisma.userApplication.findMany({
        where: {
          status: { in: ["submitted", "processed"] },
          ipo: {
            status: { in: ["closed", "listed"] },
          },
        },
        include: {
          ipo: {
            select: { id: true, symbol: true, status: true },
          },
        },
      });

      applications.forEach((application) => {
        const ipoId = application.ipoId;

        if (!this.userApplications.has(ipoId)) {
          this.userApplications.set(ipoId, new Map());
        }

        this.userApplications.get(ipoId).set(application.id, {
          id: application.id,
          userId: application.userId,
          category: application.category,
          quantity: application.quantity,
          amount: application.amount,
          panNumber: application.panNumber,
          applicationNumber: application.applicationNumber,
          status: application.status,
          submittedAt: application.submittedAt,
          allotmentStatus: "pending",
          allottedQuantity: 0,
          refundAmount: 0,
        });
      });

      console.log(
        `📋 Loaded ${applications.length} user applications for tracking`
      );
    } catch (error) {
      console.error("Error loading user applications:", error);
    }
  }

  // Load existing allotment results
  async loadExistingAllotmentResults() {
    try {
      const results = await prisma.allotmentResult.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        include: {
          ipo: {
            select: { id: true, symbol: true },
          },
        },
      });

      results.forEach((result) => {
        const ipoId = result.ipoId;

        if (!this.allotmentResults.has(ipoId)) {
          this.allotmentResults.set(ipoId, new Map());
        }

        const key = `${result.panNumber}_${result.applicationNumber}`;
        this.allotmentResults.get(ipoId).set(key, {
          panNumber: result.panNumber,
          applicationNumber: result.applicationNumber,
          category: result.category,
          appliedQuantity: result.appliedQuantity,
          allottedQuantity: result.allottedQuantity,
          allottedAmount: result.allottedAmount,
          refundAmount: result.refundAmount,
          allotmentStatus: result.allotmentStatus,
          fetchedAt: result.createdAt,
        });
      });

      console.log(`🎯 Loaded ${results.length} existing allotment results`);
    } catch (error) {
      console.error("Error loading allotment results:", error);
    }
  }

  // Start allotment tracking processes
  startAllotmentTracking() {
    // Active allotment checking for recently closed IPOs
    const activeTrackingInterval = setInterval(async () => {
      await this.processAllotmentChecks();
    }, this.trackingConfig.ACTIVE_TRACKING_INTERVAL);

    this.activeIntervals.set("ACTIVE_TRACKING", activeTrackingInterval);

    // Passive tracking for older IPOs
    const passiveTrackingInterval = setInterval(async () => {
      await this.processPassiveChecks();
    }, this.trackingConfig.PASSIVE_TRACKING_INTERVAL);

    this.activeIntervals.set("PASSIVE_TRACKING", passiveTrackingInterval);

    console.log("🎯 Started allotment tracking processes");
  }

  // Process active allotment checks
  async processAllotmentChecks() {
    const queue = this.processingQueues.ALLOTMENT_CHECK;
    if (queue.length === 0) return;

    console.log(`🔄 Processing ${queue.length} allotment checks...`);

    const batch = queue.splice(0, this.trackingConfig.BATCH_SIZE);

    const checkPromises = batch.map((ipoId) =>
      this.checkAllotmentResults(ipoId).catch((error) => {
        console.error(
          `Error checking allotment for IPO ${ipoId}:`,
          error.message
        );
        // Re-add to queue for retry
        const trackingData = this.trackedIPOs.get(ipoId);
        if (
          trackingData &&
          trackingData.statistics.totalChecks < this.trackingConfig.MAX_RETRIES
        ) {
          queue.push(ipoId);
        }
      })
    );

    await Promise.allSettled(checkPromises);

    // Re-add processed IPOs back to queue if results not yet available
    batch.forEach((ipoId) => {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (
        trackingData &&
        !trackingData.resultAvailable &&
        trackingData.statistics.totalChecks < 50
      ) {
        // Max 50 attempts
        queue.push(ipoId);
      }
    });
  }

  // Check allotment results for individual IPO
  async checkAllotmentResults(ipoId) {
    const trackingData = this.trackedIPOs.get(ipoId);
    if (!trackingData) {
      console.warn(`No tracking data found for IPO ${ipoId}`);
      return;
    }

    const startTime = Date.now();
    console.log(`🎯 Checking allotment results for ${trackingData.symbol}...`);

    try {
      // Check if results are available from registrar
      const resultsAvailable =
        await this.checkResultsAvailability(trackingData);

      if (!resultsAvailable) {
        console.log(
          `ℹ️  Allotment results not yet available for ${trackingData.symbol}`
        );
        trackingData.statistics.totalChecks++;
        return;
      }

      // Fetch allotment results
      const allotmentData = await this.fetchAllotmentResults(trackingData);

      if (allotmentData && allotmentData.length > 0) {
        // Process and store results
        await this.processAllotmentResults(trackingData, allotmentData);

        // Update tracking data
        trackingData.resultAvailable = true;
        trackingData.allotmentStatus = "completed";
        trackingData.lastChecked = Date.now();

        // Trigger notifications
        this.addToProcessingQueue(ipoId, "NOTIFICATION");

        // Update performance metrics
        this.updatePerformanceMetrics(true, Date.now() - startTime);

        console.log(
          `✅ Successfully processed allotment results for ${trackingData.symbol}`
        );
      }

      trackingData.statistics.totalChecks++;
      trackingData.statistics.successfulChecks++;
    } catch (error) {
      this.updatePerformanceMetrics(false, Date.now() - startTime);
      trackingData.statistics.totalChecks++;

      console.error(
        `❌ Failed to check allotment for ${trackingData.symbol}:`,
        error.message
      );
      throw error;
    }
  }

  // Check if allotment results are available
  async checkResultsAvailability(trackingData) {
    try {
      const registrar = trackingData.ipoDetails.registrar;
      const symbol = trackingData.symbol;

      // Check multiple sources for result availability
      const availabilitySources = [
        () => this.checkNSEAllotmentStatus(symbol),
        () => this.checkRegistrarWebsite(registrar, symbol),
        () => this.checkThirdPartyAPIs(symbol),
      ];

      for (const checkMethod of availabilitySources) {
        try {
          const isAvailable = await checkMethod();
          if (isAvailable) {
            return true;
          }
        } catch (error) {
          console.warn(`Result availability check failed:`, error.message);
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking results availability:", error);
      return false;
    }
  }

  // Check NSE allotment status
  async checkNSEAllotmentStatus(symbol) {
    try {
      // Use NSE API to check allotment status
      const allotmentData = await nseAPI.fetchAllotmentData(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        new Date().toISOString()
      );

      // Check if this symbol has allotment data
      const symbolResults = allotmentData.filter(
        (item) =>
          item.symbol && item.symbol.toUpperCase() === symbol.toUpperCase()
      );

      return symbolResults.length > 0;
    } catch (error) {
      console.warn(
        `NSE allotment status check failed for ${symbol}:`,
        error.message
      );
      return false;
    }
  }

  // Check registrar website (mock implementation)
  async checkRegistrarWebsite(registrar, symbol) {
    // Simulate registrar website check
    // In production, this would make HTTP requests to registrar websites

    const registrarSites = {
      "Link Intime": "https://linkintime.co.in",
      Karvy: "https://karvy.com",
      Bigshare: "https://bigshareonline.com",
      CDSL: "https://cdslindia.com",
    };

    // Simulate delay and random availability
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000)
    );

    // Mock result - in production, scrape/API call to registrar
    return Math.random() > 0.7; // 30% chance of being available
  }

  // Check third-party APIs for allotment status
  async checkThirdPartyAPIs(symbol) {
    // Simulate third-party API calls
    // In production, integrate with services like IPO Watch, Chittorgarh, etc.

    try {
      // Mock API response
      await new Promise((resolve) => setTimeout(resolve, 500));
      return Math.random() > 0.8; // 20% chance of being available
    } catch (error) {
      return false;
    }
  }

  // Fetch allotment results from various sources
  async fetchAllotmentResults(trackingData) {
    const allotmentData = [];

    try {
      const symbol = trackingData.symbol;
      const registrar = trackingData.ipoDetails.registrar;

      // Try multiple sources for comprehensive data
      const fetchSources = [
        () => this.fetchFromNSE(symbol),
        () => this.fetchFromRegistrar(registrar, symbol),
        () => this.fetchFromThirdParty(symbol),
      ];

      for (const fetchMethod of fetchSources) {
        try {
          const data = await fetchMethod();
          if (data && data.length > 0) {
            allotmentData.push(...data);
          }
        } catch (error) {
          console.warn(`Allotment data fetch failed:`, error.message);
        }
      }

      // Remove duplicates and validate data
      return this.deduplicateAndValidateResults(allotmentData);
    } catch (error) {
      console.error("Error fetching allotment results:", error);
      return [];
    }
  }

  // Fetch allotment data from NSE
  async fetchFromNSE(symbol) {
    try {
      const allotmentData = await nseAPI.fetchAllotmentData(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      );

      return allotmentData.filter(
        (item) =>
          item.symbol && item.symbol.toUpperCase() === symbol.toUpperCase()
      );
    } catch (error) {
      console.error(`NSE allotment fetch failed for ${symbol}:`, error);
      return [];
    }
  }

  // Fetch from registrar (mock implementation)
  async fetchFromRegistrar(registrar, symbol) {
    // Mock registrar data fetch
    // In production, this would scrape or use registrar APIs

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate delay

    // Mock allotment data
    const mockData = [];
    for (let i = 0; i < 100; i++) {
      // Simulate 100 applications
      mockData.push({
        panNumber: `ABCDE${String(i).padStart(4, "0")}F`,
        applicationNumber: `APP${String(Date.now() + i).substr(-8)}`,
        category: i < 70 ? "RETAIL" : i < 85 ? "HNI" : "QIB",
        appliedQuantity: Math.floor(Math.random() * 10) + 1,
        allottedQuantity:
          Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 1 : 0,
        allottedAmount: 0, // Calculated later
        refundAmount: 0, // Calculated later
        allotmentStatus: Math.random() > 0.3 ? "allotted" : "not_allotted",
      });
    }

    return mockData;
  }

  // Fetch from third-party sources
  async fetchFromThirdParty(symbol) {
    // Mock third-party data
    return [];
  }

  // Deduplicate and validate allotment results
  deduplicateAndValidateResults(allotmentData) {
    const uniqueResults = new Map();
    const validatedResults = [];

    allotmentData.forEach((result) => {
      try {
        // Validate required fields
        if (!result.panNumber || !result.applicationNumber) {
          return;
        }

        // Create unique key
        const key = `${result.panNumber}_${result.applicationNumber}`;

        // Keep the most recent or complete record
        if (
          !uniqueResults.has(key) ||
          this.isMoreCompleteResult(result, uniqueResults.get(key))
        ) {
          uniqueResults.set(key, result);
        }
      } catch (error) {
        console.warn("Invalid allotment result:", error, result);
      }
    });

    // Convert to array and final validation
    for (const result of uniqueResults.values()) {
      if (this.validateAllotmentResult(result)) {
        validatedResults.push(result);
      }
    }

    return validatedResults;
  }

  // Check if result is more complete
  isMoreCompleteResult(newResult, existingResult) {
    const newFields = Object.keys(newResult).length;
    const existingFields = Object.keys(existingResult).length;

    if (newFields > existingFields) return true;

    // Prefer results with allotment status
    if (newResult.allotmentStatus && !existingResult.allotmentStatus)
      return true;

    return false;
  }

  // Validate individual allotment result
  validateAllotmentResult(result) {
    try {
      // Required fields check
      if (!result.panNumber || !result.applicationNumber) {
        return false;
      }

      // PAN format validation
      const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panPattern.test(result.panNumber)) {
        return false;
      }

      // Quantity validation
      if (result.appliedQuantity < 0 || result.allottedQuantity < 0) {
        return false;
      }

      if (result.allottedQuantity > result.appliedQuantity) {
        return false;
      }

      // Status validation
      const validStatuses = ["allotted", "not_allotted", "partially_allotted"];
      if (
        result.allotmentStatus &&
        !validStatuses.includes(result.allotmentStatus)
      ) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Process and store allotment results
  async processAllotmentResults(trackingData, allotmentData) {
    try {
      console.log(
        `📊 Processing ${allotmentData.length} allotment results for ${trackingData.symbol}...`
      );

      const ipoId = trackingData.id;
      const finalPrice =
        trackingData.ipoDetails.finalPrice ||
        trackingData.ipoDetails.priceRange.max;
      const lotSize = trackingData.ipoDetails.lotSize || 1;

      let processedCount = 0;
      let allottedCount = 0;
      let totalRefund = 0;

      // Process each result
      for (const result of allotmentData) {
        try {
          // Calculate amounts
          const appliedAmount = result.appliedQuantity * lotSize * finalPrice;
          const allottedAmount = result.allottedQuantity * lotSize * finalPrice;
          const refundAmount = appliedAmount - allottedAmount;

          // Enhanced result data
          const processedResult = {
            ...result,
            appliedAmount,
            allottedAmount,
            refundAmount,
            finalPrice,
            lotSize,
            processedAt: new Date(),
          };

          // Store in database
          await this.storeAllotmentResult(ipoId, processedResult);

          // Update tracking maps
          const key = `${result.panNumber}_${result.applicationNumber}`;
          if (!this.allotmentResults.has(ipoId)) {
            this.allotmentResults.set(ipoId, new Map());
          }
          this.allotmentResults.get(ipoId).set(key, processedResult);

          // Update user applications if exists
          await this.updateUserApplication(ipoId, processedResult);

          processedCount++;
          if (result.allottedQuantity > 0) allottedCount++;
          totalRefund += refundAmount;
        } catch (error) {
          console.error("Error processing individual result:", error, result);
        }
      }

      // Update tracking statistics
      trackingData.statistics.totalApplications = processedCount;
      trackingData.statistics.allottedApplications = allottedCount;
      trackingData.statistics.refundedApplications =
        processedCount - allottedCount;

      // Perform analysis
      await this.performAllotmentAnalysis(trackingData, allotmentData);

      // Cache results
      await this.cacheAllotmentResults(ipoId, allotmentData);

      console.log(
        `✅ Processed ${processedCount} results, ${allottedCount} allotted`
      );
    } catch (error) {
      console.error("Error processing allotment results:", error);
      throw error;
    }
  }

  // Store allotment result in database
  async storeAllotmentResult(ipoId, result) {
    try {
      await prisma.allotmentResult.upsert({
        where: {
          ipoId_panNumber_applicationNumber: {
            ipoId,
            panNumber: result.panNumber,
            applicationNumber: result.applicationNumber,
          },
        },
        update: {
          category: result.category,
          appliedQuantity: result.appliedQuantity,
          appliedAmount: result.appliedAmount,
          allottedQuantity: result.allottedQuantity,
          allottedAmount: result.allottedAmount,
          refundAmount: result.refundAmount,
          allotmentStatus: result.allotmentStatus,
          finalPrice: result.finalPrice,
          updatedAt: new Date(),
        },
        create: {
          ipoId,
          panNumber: result.panNumber,
          applicationNumber: result.applicationNumber,
          category: result.category || "UNKNOWN",
          appliedQuantity: result.appliedQuantity,
          appliedAmount: result.appliedAmount,
          allottedQuantity: result.allottedQuantity,
          allottedAmount: result.allottedAmount,
          refundAmount: result.refundAmount,
          allotmentStatus: result.allotmentStatus,
          finalPrice: result.finalPrice,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Error storing allotment result:", error);
      throw error;
    }
  }

  // Update user application with allotment result
  async updateUserApplication(ipoId, result) {
    try {
      const userApplications = this.userApplications.get(ipoId);
      if (!userApplications) return;

      // Find matching user application
      for (const [appId, application] of userApplications) {
        if (
          application.panNumber === result.panNumber &&
          application.applicationNumber === result.applicationNumber
        ) {
          // Update application with allotment result
          application.allotmentStatus = result.allotmentStatus;
          application.allottedQuantity = result.allottedQuantity;
          application.allottedAmount = result.allottedAmount;
          application.refundAmount = result.refundAmount;

          // Update in database
          await prisma.userApplication.update({
            where: { id: appId },
            data: {
              allotmentStatus: result.allotmentStatus,
              allottedQuantity: result.allottedQuantity,
              allottedAmount: result.allottedAmount,
              refundAmount: result.refundAmount,
              resultReceivedAt: new Date(),
            },
          });

          console.log(
            `📧 Updated user application ${appId} with allotment result`
          );
          break;
        }
      }
    } catch (error) {
      console.error("Error updating user application:", error);
    }
  }

  // Perform comprehensive allotment analysis
  async performAllotmentAnalysis(trackingData, allotmentData) {
    try {
      const analysis = trackingData.analysis;

      // Overall allotment ratio
      const totalApplications = allotmentData.length;
      const allottedApplications = allotmentData.filter(
        (r) => r.allottedQuantity > 0
      ).length;
      analysis.overallAllotmentRatio =
        totalApplications > 0
          ? (allottedApplications / totalApplications) * 100
          : 0;

      // Category-wise analysis
      const categoryStats = new Map();

      allotmentData.forEach((result) => {
        const category = result.category || "UNKNOWN";

        if (!categoryStats.has(category)) {
          categoryStats.set(category, {
            total: 0,
            allotted: 0,
            totalQuantityApplied: 0,
            totalQuantityAllotted: 0,
            totalAmountApplied: 0,
            totalAmountAllotted: 0,
            totalRefund: 0,
          });
        }

        const stats = categoryStats.get(category);
        stats.total++;
        if (result.allottedQuantity > 0) stats.allotted++;
        stats.totalQuantityApplied += result.appliedQuantity || 0;
        stats.totalQuantityAllotted += result.allottedQuantity || 0;
        stats.totalAmountApplied += result.appliedAmount || 0;
        stats.totalAmountAllotted += result.allottedAmount || 0;
        stats.totalRefund += result.refundAmount || 0;
      });

      // Calculate category-wise ratios
      for (const [category, stats] of categoryStats) {
        const ratio =
          stats.total > 0 ? (stats.allotted / stats.total) * 100 : 0;
        const avgAllotment =
          stats.allotted > 0 ? stats.totalQuantityAllotted / stats.allotted : 0;

        analysis.categoryWiseRatio.set(category, {
          allotmentRatio: Math.round(ratio * 100) / 100,
          averageAllotment: Math.round(avgAllotment * 100) / 100,
          totalApplications: stats.total,
          allottedApplications: stats.allotted,
          refundPercentage:
            stats.totalAmountApplied > 0
              ? (stats.totalRefund / stats.totalAmountApplied) * 100
              : 0,
        });
      }

      // Overall refund percentage
      const totalApplied = allotmentData.reduce(
        (sum, r) => sum + (r.appliedAmount || 0),
        0
      );
      const totalRefunded = allotmentData.reduce(
        (sum, r) => sum + (r.refundAmount || 0),
        0
      );
      analysis.refundPercentage =
        totalApplied > 0 ? (totalRefunded / totalApplied) * 100 : 0;

      // Average allotment size
      analysis.averageAllotmentSize =
        allottedApplications > 0
          ? allotmentData
              .filter((r) => r.allottedQuantity > 0)
              .reduce((sum, r) => sum + r.allottedQuantity, 0) /
            allottedApplications
          : 0;

      // Generate insights
      analysis.insights = this.generateAllotmentAnalysisInsights(
        analysis,
        trackingData
      );

      // Detect patterns
      analysis.patterns = this.detectAllotmentPatterns(
        allotmentData,
        trackingData
      );
    } catch (error) {
      console.error("Error performing allotment analysis:", error);
    }
  }

  // Generate allotment analysis insights
  generateAllotmentAnalysisInsights(analysis, trackingData) {
    const insights = [];

    try {
      // Overall allotment insights
      if (analysis.overallAllotmentRatio > 80) {
        insights.push({
          type: "HIGH_ALLOTMENT_RATE",
          message: `High overall allotment rate: ${analysis.overallAllotmentRatio.toFixed(1)}%`,
          impact: "Most applicants received allotment",
        });
      } else if (analysis.overallAllotmentRatio < 30) {
        insights.push({
          type: "LOW_ALLOTMENT_RATE",
          message: `Low overall allotment rate: ${analysis.overallAllotmentRatio.toFixed(1)}%`,
          impact: "Majority of applicants did not receive allotment",
        });
      }

      // Category comparison insights
      const categoryRatios = Array.from(
        analysis.categoryWiseRatio.entries()
      ).sort((a, b) => b[1].allotmentRatio - a[1].allotmentRatio);

      if (categoryRatios.length > 1) {
        const best = categoryRatios[0];
        const worst = categoryRatios[categoryRatios.length - 1];

        if (best[1].allotmentRatio > worst[1].allotmentRatio * 2) {
          insights.push({
            type: "CATEGORY_DISPARITY",
            message: `${best[0]} category had significantly better allotment rate (${best[1].allotmentRatio.toFixed(1)}%) compared to ${worst[0]} (${worst[1].allotmentRatio.toFixed(1)}%)`,
            suggestion: `${best[0]} category was more favorable for this IPO`,
          });
        }
      }

      // Refund insights
      if (analysis.refundPercentage > 70) {
        insights.push({
          type: "HIGH_REFUND",
          message: `High refund percentage: ${analysis.refundPercentage.toFixed(1)}%`,
          impact: "Significant amount refunded to investors",
        });
      }

      // Compare with predictions
      const overallPrediction = trackingData.predictions.overall;
      if (overallPrediction && overallPrediction.probability > 0) {
        const actualVsPredicted =
          analysis.overallAllotmentRatio - overallPrediction.probability;

        if (Math.abs(actualVsPredicted) > 20) {
          insights.push({
            type: "PREDICTION_VARIANCE",
            message: `Actual allotment rate (${analysis.overallAllotmentRatio.toFixed(1)}%) ${actualVsPredicted > 0 ? "exceeded" : "fell short of"} prediction (${overallPrediction.probability.toFixed(1)}%)`,
            variance: Math.abs(actualVsPredicted),
          });
        }
      }
    } catch (error) {
      insights.push({
        type: "ERROR",
        message: "Error generating some analysis insights",
      });
    }

    return insights;
  }

  // Detect allotment patterns
  detectAllotmentPatterns(allotmentData, trackingData) {
    const patterns = [];

    try {
      // Lot size pattern analysis
      const allottedResults = allotmentData.filter(
        (r) => r.allottedQuantity > 0
      );
      const lotSizeFreq = new Map();

      allottedResults.forEach((result) => {
        const lots = result.allottedQuantity;
        lotSizeFreq.set(lots, (lotSizeFreq.get(lots) || 0) + 1);
      });

      // Find most common allotment size
      if (lotSizeFreq.size > 0) {
        const sortedLots = Array.from(lotSizeFreq.entries()).sort(
          (a, b) => b[1] - a[1]
        );

        const mostCommon = sortedLots[0];
        if (mostCommon[1] > allottedResults.length * 0.6) {
          patterns.push({
            type: "UNIFORM_ALLOTMENT",
            description: `${((mostCommon[1] / allottedResults.length) * 100).toFixed(1)}% of allottees received ${mostCommon[0]} lots`,
            commonLots: mostCommon[0],
            percentage: (
              (mostCommon[1] / allottedResults.length) *
              100
            ).toFixed(1),
          });
        }
      }

      // Application number pattern (if detectable)
      const appNumbers = allotmentData
        .map((r) => r.applicationNumber)
        .filter(Boolean);
      if (appNumbers.length > 100) {
        const sequentialPattern = this.detectSequentialPattern(appNumbers);
        if (sequentialPattern) {
          patterns.push({
            type: "SEQUENTIAL_PATTERN",
            description: "Sequential application number pattern detected",
            ...sequentialPattern,
          });
        }
      }

      // Time-based patterns (if timestamps available)
      // This would analyze when applications were submitted vs allotment results
    } catch (error) {
      console.error("Error detecting allotment patterns:", error);
    }

    return patterns;
  }

  // Detect sequential pattern in application numbers
  detectSequentialPattern(appNumbers) {
    try {
      // Extract numeric parts and check for sequences
      const numericParts = appNumbers
        .map((num) => {
          const match = num.match(/(\d+)/);
          return match ? parseInt(match[1]) : null;
        })
        .filter((n) => n !== null)
        .sort((a, b) => a - b);

      if (numericParts.length < 10) return null;

      let consecutiveCount = 1;
      let maxConsecutive = 1;

      for (let i = 1; i < numericParts.length; i++) {
        if (numericParts[i] === numericParts[i - 1] + 1) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else {
          consecutiveCount = 1;
        }
      }

      if (maxConsecutive > numericParts.length * 0.3) {
        return {
          maxConsecutiveLength: maxConsecutive,
          totalNumbers: numericParts.length,
          sequentialPercentage: (
            (maxConsecutive / numericParts.length) *
            100
          ).toFixed(1),
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // Cache allotment results for quick access
  async cacheAllotmentResults(ipoId, allotmentData) {
    try {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (!trackingData) return;

      const cacheData = {
        ipoId,
        symbol: trackingData.symbol,
        totalResults: allotmentData.length,
        allottedCount: allotmentData.filter((r) => r.allottedQuantity > 0)
          .length,
        analysis: trackingData.analysis,
        lastUpdated: Date.now(),
        resultsSummary: {
          overallAllotmentRatio: trackingData.analysis.overallAllotmentRatio,
          categoryWiseRatio: Object.fromEntries(
            trackingData.analysis.categoryWiseRatio
          ),
          refundPercentage: trackingData.analysis.refundPercentage,
          insights: trackingData.analysis.insights,
          patterns: trackingData.analysis.patterns,
        },
      };

      // Cache with different keys for different access patterns
      await Promise.all([
        cache.set(
          cache.key("ALLOTMENT", `results:${ipoId}`),
          cacheData,
          24 * 60 * 60
        ), // 24 hours
        cache.set(
          cache.key("ALLOTMENT", `summary:${trackingData.symbol}`),
          cacheData.resultsSummary,
          12 * 60 * 60
        ), // 12 hours
      ]);

      console.log(`📦 Cached allotment results for ${trackingData.symbol}`);
    } catch (error) {
      console.error("Error caching allotment results:", error);
    }
  }

  // Start result processing workflow
  startResultProcessing() {
    const processingInterval = setInterval(async () => {
      await this.processResultQueue();
    }, this.trackingConfig.RESULT_PROCESSING_INTERVAL);

    this.activeIntervals.set("RESULT_PROCESSING", processingInterval);

    console.log("📊 Started result processing workflow");
  }

  // Process result processing queue
  async processResultQueue() {
    const queue = this.processingQueues.RESULT_PROCESSING;
    if (queue.length === 0) return;

    console.log(`📊 Processing ${queue.length} result analysis tasks...`);

    const batch = queue.splice(0, this.trackingConfig.BATCH_SIZE);

    for (const ipoId of batch) {
      try {
        await this.generateDetailedAnalytics(ipoId);
      } catch (error) {
        console.error(
          `Error processing results for IPO ${ipoId}:`,
          error.message
        );
      }
    }
  }

  // Generate detailed analytics for processed results
  async generateDetailedAnalytics(ipoId) {
    try {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (!trackingData || !trackingData.resultAvailable) return;

      // Generate comprehensive analytics using analytics service
      const analytics = await analyticsService.computeIPOAnalytics(ipoId, {
        includeHistorical: true,
        includePredictions: false, // Results are already known
        includeAllotmentData: true,
        timeRange: 60,
      });

      // Store analytics in database
      const dbAnalytics = this.extractAnalyticsForDB(analytics);
      await prisma.iPOAnalytics.upsert({
        where: { ipoId },
        update: {
          ...dbAnalytics,
          hasAllotmentData: true,
          allotmentCompletedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          ipoId,
          ...dbAnalytics,
          hasAllotmentData: true,
          allotmentCompletedAt: new Date(),
        },
      });

      // Broadcast analytics update
      await webSocketService.broadcastAnalyticsUpdate(ipoId, {
        analytics: dbAnalytics,
        allotmentResults: trackingData.analysis,
        completedAt: Date.now(),
      });

      console.log(`📈 Generated detailed analytics for ${trackingData.symbol}`);
    } catch (error) {
      console.error("Error generating detailed analytics:", error);
    }
  }

  // Start prediction updates
  startPredictionUpdates() {
    const predictionInterval = setInterval(async () => {
      await this.updatePredictionAccuracy();
    }, this.trackingConfig.PREDICTION_UPDATE_INTERVAL);

    this.activeIntervals.set("PREDICTION_UPDATES", predictionInterval);

    console.log("🔮 Started prediction accuracy updates");
  }

  // Update prediction accuracy based on actual results
  async updatePredictionAccuracy() {
    try {
      let totalPredictions = 0;
      let accuratePredictions = 0;

      for (const [ipoId, trackingData] of this.trackedIPOs) {
        if (!trackingData.resultAvailable || !trackingData.predictions)
          continue;

        const predictions = trackingData.predictions;
        const actualResults = trackingData.analysis;

        // Compare overall prediction with actual results
        const predictedProbability = predictions.overall.probability;
        const actualRatio = actualResults.overallAllotmentRatio;

        if (predictedProbability > 0) {
          const accuracy = 100 - Math.abs(predictedProbability - actualRatio);
          if (accuracy > 70) {
            // Consider 70%+ as accurate
            accuratePredictions++;
          }
          totalPredictions++;
        }

        // Compare category-wise predictions
        for (const [category, prediction] of predictions.categories) {
          const actualCategoryResult =
            actualResults.categoryWiseRatio.get(category);

          if (actualCategoryResult && prediction.allotmentProbability > 0) {
            const categoryAccuracy =
              100 -
              Math.abs(
                prediction.allotmentProbability -
                  actualCategoryResult.allotmentRatio
              );

            if (categoryAccuracy > 60) {
              // Category predictions are harder
              accuratePredictions++;
            }
            totalPredictions++;
          }
        }
      }

      // Update overall prediction accuracy
      this.performance.predictionAccuracy =
        totalPredictions > 0
          ? (accuratePredictions / totalPredictions) * 100
          : 0;

      console.log(
        `🎯 Prediction accuracy: ${this.performance.predictionAccuracy.toFixed(1)}% (${accuratePredictions}/${totalPredictions})`
      );
    } catch (error) {
      console.error("Error updating prediction accuracy:", error);
    }
  }

  // Start notification processing
  startNotificationProcessing() {
    const notificationInterval = setInterval(async () => {
      await this.processNotificationQueue();
    }, this.trackingConfig.NOTIFICATION_DELAY);

    this.activeIntervals.set("NOTIFICATIONS", notificationInterval);

    console.log("📧 Started notification processing");
  }

  // Process notification queue
  async processNotificationQueue() {
    const queue = this.processingQueues.NOTIFICATION;
    if (queue.length === 0) return;

    console.log(`📧 Processing ${queue.length} notification tasks...`);

    const batch = queue.splice(0, this.trackingConfig.BATCH_SIZE);

    for (const ipoId of batch) {
      try {
        await this.sendAllotmentNotifications(ipoId);
      } catch (error) {
        console.error(
          `Error processing notifications for IPO ${ipoId}:`,
          error.message
        );
      }
    }
  }

  // Send allotment notifications to users
  async sendAllotmentNotifications(ipoId) {
    try {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (!trackingData || trackingData.notifications.resultAvailable) return;

      const userApplications = this.userApplications.get(ipoId);
      if (!userApplications) return;

      let notificationsSent = 0;

      for (const [appId, application] of userApplications) {
        try {
          // Skip if already notified or no result
          if (application.allotmentStatus === "pending") continue;

          // Prepare notification data
          const notificationData = {
            userId: application.userId,
            ipoId,
            ipoSymbol: trackingData.symbol,
            ipoName: trackingData.name,
            applicationId: appId,
            panNumber: application.panNumber,
            applicationNumber: application.applicationNumber,
            allotmentStatus: application.allotmentStatus,
            appliedQuantity: application.quantity,
            allottedQuantity: application.allottedQuantity,
            appliedAmount: application.amount,
            allottedAmount: application.allottedAmount,
            refundAmount: application.refundAmount,
            category: application.category,
            finalPrice: trackingData.ipoDetails.finalPrice,
          };

          // Send notification via WebSocket
          await webSocketService.broadcastAlert(
            "allotment_result",
            notificationData
          );

          // Store notification in database
          await this.storeNotification(notificationData);

          notificationsSent++;
        } catch (error) {
          console.error(
            `Error sending notification for application ${appId}:`,
            error
          );
        }
      }

      // Mark notifications as sent
      trackingData.notifications.resultAvailable = true;
      trackingData.notifications.usersNotified = notificationsSent;

      this.performance.notificationsSent += notificationsSent;

      console.log(
        `📧 Sent ${notificationsSent} allotment notifications for ${trackingData.symbol}`
      );
    } catch (error) {
      console.error("Error sending allotment notifications:", error);
    }
  }

  // Store notification in database for history
  async storeNotification(notificationData) {
    try {
      await prisma.notification.create({
        data: {
          userId: notificationData.userId,
          type: "allotment_result",
          title: `${notificationData.ipoSymbol} Allotment Result`,
          message:
            notificationData.allotmentStatus === "allotted"
              ? `Congratulations! You have been allotted ${notificationData.allottedQuantity} shares in ${notificationData.ipoName}`
              : `Unfortunately, you were not allotted shares in ${notificationData.ipoName}. Refund will be processed shortly.`,
          data: JSON.stringify(notificationData),
          isRead: false,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Error storing notification:", error);
    }
  }

  // Helper methods
  getAllotmentTrackingPriority(ipo) {
    const now = Date.now();
    const closeDate = new Date(ipo.closeDate).getTime();
    const daysSinceClosed = (now - closeDate) / (1000 * 60 * 60 * 24);

    if (daysSinceClosed <= 7) return "HIGH_PRIORITY";
    if (daysSinceClosed <= 14) return "MEDIUM_PRIORITY";
    return "LOW_PRIORITY";
  }

  calculateAllotmentTimeline(ipo) {
    const timeline = {
      expectedAllotmentDate: null,
      expectedResultsDate: null,
      daysFromClose: 0,
      status: "pending",
    };

    const closeDate = new Date(ipo.closeDate);
    const now = new Date();

    timeline.daysFromClose = Math.ceil(
      (now - closeDate) / (1000 * 60 * 60 * 24)
    );

    // Typical IPO timeline: Results available 7-10 days after close
    timeline.expectedAllotmentDate =
      ipo.allotmentDate ||
      new Date(closeDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    timeline.expectedResultsDate = new Date(
      closeDate.getTime() + 8 * 24 * 60 * 60 * 1000
    );

    if (timeline.daysFromClose >= 8) {
      timeline.status = "expected";
    } else if (timeline.daysFromClose >= 12) {
      timeline.status = "overdue";
    }

    return timeline;
  }

  addToProcessingQueue(ipoId, queueType) {
    const queue = this.processingQueues[queueType];
    if (queue && !queue.includes(ipoId)) {
      queue.push(ipoId);
    }
  }

  extractAnalyticsForDB(fullAnalytics) {
    // Extract relevant analytics for database storage
    return {
      totalGMPChanges: fullAnalytics.gmpAnalytics?.recordCount || 0,
      avgGMP: fullAnalytics.gmpAnalytics?.statistics?.average || null,
      finalSubscription:
        fullAnalytics.subscriptionAnalytics?.overall?.totalSubscription || null,
      predictedListingGain:
        fullAnalytics.predictions?.listingGain?.value || null,
      riskScore: fullAnalytics.riskAssessment?.overallRiskScore || null,
      // Add allotment specific fields
      allotmentRatio:
        fullAnalytics.allotmentAnalysis?.overallAllotmentRatio || null,
      refundPercentage:
        fullAnalytics.allotmentAnalysis?.refundPercentage || null,
    };
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

    console.log("📊 Started allotment service performance monitoring");
  }

  updatePerformanceMetrics(success, processingTime) {
    this.performance.totalChecks++;

    if (success) {
      this.performance.successfulChecks++;
    } else {
      this.performance.failedChecks++;
    }

    // Update average processing time
    this.performance.averageProcessingTime =
      (this.performance.averageProcessingTime *
        (this.performance.totalChecks - 1) +
        processingTime) /
      this.performance.totalChecks;

    this.performance.lastProcessedAt = Date.now();
  }

  logPerformanceMetrics() {
    const metrics = this.getPerformanceMetrics();
    console.log("📊 Allotment Service Performance:", metrics);

    // Store metrics in cache
    cache.set("allotment_service_metrics", metrics, 300);
  }

  getPerformanceMetrics() {
    const successRate =
      this.performance.totalChecks > 0
        ? (this.performance.successfulChecks / this.performance.totalChecks) *
          100
        : 100;

    return {
      totalChecks: this.performance.totalChecks,
      successfulChecks: this.performance.successfulChecks,
      failedChecks: this.performance.failedChecks,
      successRate: `${successRate.toFixed(2)}%`,
      resultsFetched: this.performance.resultsFetched,
      notificationsSent: this.performance.notificationsSent,
      predictionAccuracy: `${this.performance.predictionAccuracy.toFixed(2)}%`,
      averageProcessingTime: Math.round(this.performance.averageProcessingTime),
      trackedIPOs: this.trackedIPOs.size,
      activeResults: this.allotmentResults.size,
      lastProcessedAt: this.performance.lastProcessedAt
        ? new Date(this.performance.lastProcessedAt).toISOString()
        : null,
    };
  }

  // Maintenance tasks
  startMaintenanceTasks() {
    const maintenanceInterval = setInterval(
      () => {
        this.performMaintenance();
      },
      60 * 60 * 1000
    ); // Every hour

    this.activeIntervals.set("MAINTENANCE", maintenanceInterval);

    console.log("🧹 Started allotment service maintenance tasks");
  }

  performMaintenance() {
    const now = Date.now();

    // Clean up old tracking data for listed IPOs
    for (const [ipoId, trackingData] of this.trackedIPOs) {
      if (
        trackingData.status === "listed" &&
        trackingData.resultAvailable &&
        now - trackingData.lastChecked > 7 * 24 * 60 * 60 * 1000
      ) {
        // 7 days old

        // Archive instead of delete
        this.archiveTrackingData(ipoId, trackingData);
        this.trackedIPOs.delete(ipoId);
      }
    }

    // Clean up old user applications
    for (const [ipoId, applications] of this.userApplications) {
      if (!this.trackedIPOs.has(ipoId)) {
        this.userApplications.delete(ipoId);
      }
    }

    console.log("🧹 Allotment service maintenance completed");
  }

  archiveTrackingData(ipoId, trackingData) {
    // In production, you might want to store this in a different table or file
    console.log(`📁 Archiving tracking data for ${trackingData.symbol}`);
  }

  // Manual operations
  async checkIPOAllotment(ipoId) {
    try {
      const result = await this.checkAllotmentResults(ipoId);
      console.log(`✅ Manual allotment check completed for IPO: ${ipoId}`);
      return result;
    } catch (error) {
      console.error(`Error in manual allotment check for IPO ${ipoId}:`, error);
      throw error;
    }
  }

  async getUserAllotmentStatus(userId, ipoId) {
    try {
      const applications = await prisma.userApplication.findMany({
        where: {
          userId,
          ipoId,
        },
        include: {
          ipo: {
            select: { symbol: true, name: true },
          },
        },
      });

      return applications.map((app) => ({
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        category: app.category,
        appliedQuantity: app.quantity,
        appliedAmount: app.amount,
        allotmentStatus: app.allotmentStatus,
        allottedQuantity: app.allottedQuantity,
        allottedAmount: app.allottedAmount,
        refundAmount: app.refundAmount,
        ipo: {
          symbol: app.ipo.symbol,
          name: app.ipo.name,
        },
      }));
    } catch (error) {
      console.error("Error fetching user allotment status:", error);
      throw error;
    }
  }

  async getIPOAllotmentSummary(ipoId) {
    try {
      const trackingData = this.trackedIPOs.get(ipoId);
      if (!trackingData) {
        throw new Error(`No tracking data found for IPO ${ipoId}`);
      }

      return {
        ipoId,
        symbol: trackingData.symbol,
        name: trackingData.name,
        status: trackingData.allotmentStatus,
        resultAvailable: trackingData.resultAvailable,
        analysis: trackingData.analysis,
        predictions: trackingData.predictions,
        timeline: trackingData.timeline,
        statistics: trackingData.statistics,
        lastUpdated: trackingData.lastChecked,
      };
    } catch (error) {
      console.error("Error fetching IPO allotment summary:", error);
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
        allotmentCheck: this.processingQueues.ALLOTMENT_CHECK.length,
        resultProcessing: this.processingQueues.RESULT_PROCESSING.length,
        notification: this.processingQueues.NOTIFICATION.length,
        predictionUpdate: this.processingQueues.PREDICTION_UPDATE.length,
      },
      categories: Object.keys(this.allotmentCategories).length,
      activeResults: this.allotmentResults.size,
      userApplications: Array.from(this.userApplications.values()).reduce(
        (sum, apps) => sum + apps.size,
        0
      ),
      activeIntervals: this.activeIntervals.size,
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheck() {
    try {
      // Check database connectivity
      const dbCheck = await prisma.allotmentResult.findFirst();

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
    console.log("🛑 Stopping Allotment Service...");

    this.isRunning = false;

    // Clear all active intervals
    for (const [name, intervalId] of this.activeIntervals) {
      clearInterval(intervalId);
      console.log(`⏹️  Stopped ${name} interval`);
    }

    this.activeIntervals.clear();

    // Process any remaining notifications
    if (this.processingQueues.NOTIFICATION.length > 0) {
      console.log("📧 Processing remaining notifications...");
      try {
        await this.processNotificationQueue();
      } catch (error) {
        console.error("Error processing final notifications:", error);
      }
    }

    // Broadcast shutdown notification
    try {
      await webSocketService.broadcastSystemStatus(
        {
          type: "allotment_service_shutdown",
          message: "Allotment service has been stopped",
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
    this.allotmentResults.clear();
    this.allotmentPredictions.clear();
    this.userApplications.clear();
    this.notificationPreferences.clear();

    Object.values(this.processingQueues).forEach((queue) => (queue.length = 0));

    // Clear pattern tracking
    Object.values(this.patterns).forEach((pattern) => {
      if (pattern instanceof Map) pattern.clear();
    });

    console.log("✅ Allotment Service stopped gracefully");
    console.log("📊 Final Performance Metrics:", this.getPerformanceMetrics());
  }
}

// Export singleton instance
export const allotmentService = new AllotmentService();

// Auto-start if not in test environment
if (
  process.env.NODE_ENV !== "test" &&
  process.env.AUTO_START_ALLOTMENT_SERVICE !== "false"
) {
  allotmentService.start().catch((error) => {
    console.error("Failed to auto-start Allotment Service:", error);
    process.exit(1);
  });
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(
    `🛑 Received ${signal}, shutting down Allotment Service gracefully...`
  );
  try {
    await allotmentService.stop();
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
  checkIPOAllotment,
  getUserAllotmentStatus,
  getIPOAllotmentSummary,
} = allotmentService;

export default allotmentService;
