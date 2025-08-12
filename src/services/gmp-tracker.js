import { cache } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { webSocketService } from "../lib/websocket.js";
import { analyticsService } from "../lib/analytics.js";

class GMPTrackerService {
  constructor() {
    this.isRunning = false;
    this.trackedIPOs = new Map();
    this.gmpSources = new Map();
    this.alertThresholds = new Map();
    this.historicalData = new Map();

    // Tracking intervals and configuration
    this.trackingConfig = {
      ACTIVE_IPO_INTERVAL: 30 * 1000, // 30 seconds for active IPOs
      UPCOMING_IPO_INTERVAL: 5 * 60 * 1000, // 5 minutes for upcoming IPOs
      CLOSED_IPO_INTERVAL: 15 * 60 * 1000, // 15 minutes for recently closed IPOs
      HISTORICAL_RETENTION: 30 * 24 * 60 * 60 * 1000, // 30 days
      MAX_RETRIES: 3,
      TIMEOUT: 30000, // 30 seconds
    };

    // GMP data sources configuration
    this.sources = {
      PRIMARY: {
        name: "primary_market",
        url: process.env.PRIMARY_GMP_SOURCE,
        weight: 0.4,
        reliability: 0.9,
        timeout: 15000,
      },
      SECONDARY: {
        name: "secondary_market",
        url: process.env.SECONDARY_GMP_SOURCE,
        weight: 0.3,
        reliability: 0.8,
        timeout: 20000,
      },
      BROKER: {
        name: "broker_network",
        url: process.env.BROKER_GMP_SOURCE,
        weight: 0.2,
        reliability: 0.7,
        timeout: 25000,
      },
      AGGREGATOR: {
        name: "data_aggregator",
        url: process.env.AGGREGATOR_GMP_SOURCE,
        weight: 0.1,
        reliability: 0.6,
        timeout: 30000,
      },
    };

    // Performance and reliability tracking
    this.performance = {
      totalTracked: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      averageLatency: 0,
      alertsTriggered: 0,
      sourcesStatus: new Map(),
      lastTrackedAt: null,
    };

    // Real-time analysis and alerting
    this.realtimeAnalysis = {
      volatilityThreshold: 15, // 15% volatility threshold
      rapidChangeThreshold: 10, // 10 rupees rapid change
      volumeSpike: 200, // 200% volume increase threshold
      anomalyDetection: true,
      trendAnalysis: true,
    };

    // Tracking queues for different priority levels
    this.trackingQueues = {
      HIGH_PRIORITY: [], // Open IPOs
      MEDIUM_PRIORITY: [], // Upcoming IPOs
      LOW_PRIORITY: [], // Closed IPOs
    };

    // Active intervals for cleanup
    this.activeIntervals = new Map();

    console.log("💰 GMP Tracker Service initialized");
  }

  // Start comprehensive GMP tracking
  async start() {
    if (this.isRunning) {
      console.log("⚠️  GMP Tracker is already running");
      return;
    }

    try {
      console.log("🚀 Starting Enhanced GMP Tracker Service...");

      // Initialize tracking data structures
      await this.initializeTrackingData();

      // Start tracking processes for different IPO categories
      this.startCategorizedTracking();

      // Initialize real-time monitoring
      this.startRealtimeMonitoring();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Start cleanup and maintenance
      this.startMaintenanceTasks();

      this.isRunning = true;

      console.log("✅ Enhanced GMP Tracker Service started successfully");
      console.log(
        `📊 Tracking ${this.trackedIPOs.size} IPOs across ${Object.keys(this.sources).length} sources`
      );

      // Broadcast service start
      await webSocketService.broadcastSystemStatus({
        type: "gmp_tracker_started",
        trackedIPOs: this.trackedIPOs.size,
        sources: Object.keys(this.sources).length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Failed to start GMP Tracker Service:", error);
      throw error;
    }
  }

  // Initialize tracking data from database
  async initializeTrackingData() {
    console.log("📊 Initializing GMP tracking data...");

    try {
      // Get all trackable IPOs
      const ipos = await prisma.iPO.findMany({
        where: {
          isActive: true,
          status: { in: ["upcoming", "open", "closed"] },
        },
        include: {
          gmp: {
            orderBy: { timestamp: "desc" },
            take: 10, // Last 10 GMP records for trend analysis
          },
          analytics: true,
        },
      });

      // Initialize tracking for each IPO
      for (const ipo of ipos) {
        await this.initializeIPOTracking(ipo);
      }

      console.log(`✅ Initialized tracking for ${ipos.length} IPOs`);
    } catch (error) {
      console.error("❌ Failed to initialize tracking data:", error);
      throw error;
    }
  }

  // Initialize individual IPO tracking
  async initializeIPOTracking(ipo) {
    try {
      // Determine tracking priority based on status
      const priority = this.getTrackingPriority(ipo.status);
      const interval = this.getTrackingInterval(ipo.status);

      // Calculate baseline metrics from historical data
      const baseline = this.calculateBaseline(ipo.gmp);

      // Initialize tracking data structure
      const trackingData = {
        id: ipo.id,
        symbol: ipo.symbol,
        name: ipo.name,
        status: ipo.status,
        priority,
        interval,
        baseline,
        lastTracked: null,
        consecutiveFailures: 0,
        sourceReliability: new Map(),
        alerts: new Set(),
        trends: {
          short: [], // Last hour
          medium: [], // Last 6 hours
          long: [], // Last 24 hours
        },
        statistics: {
          totalUpdates: 0,
          successfulUpdates: 0,
          averageValue: baseline.average || 0,
          volatility: baseline.volatility || 0,
          lastVolatilityCheck: Date.now(),
        },
        priceTargets: this.calculatePriceTargets(ipo, baseline),
      };

      this.trackedIPOs.set(ipo.id, trackingData);

      // Add to appropriate tracking queue
      this.addToTrackingQueue(ipo.id, priority);

      // Initialize source reliability tracking
      Object.keys(this.sources).forEach((sourceKey) => {
        trackingData.sourceReliability.set(sourceKey, {
          successCount: 0,
          failureCount: 0,
          averageLatency: 0,
          lastSuccess: null,
          reliability: this.sources[sourceKey].reliability,
        });
      });

      console.log(
        `📈 Initialized tracking for ${ipo.symbol} (Priority: ${priority})`
      );
    } catch (error) {
      console.error(
        `Error initializing tracking for IPO ${ipo.symbol}:`,
        error
      );
    }
  }

  // Calculate baseline metrics from historical GMP data
  calculateBaseline(gmpData) {
    if (!gmpData || gmpData.length === 0) {
      return {
        average: 0,
        volatility: 0,
        trend: "stable",
        volume: 0,
        range: { min: 0, max: 0 },
      };
    }

    const values = gmpData.map((g) => g.value);
    const volumes = gmpData.map((g) => g.volume || 0);

    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) /
      values.length;
    const volatility = Math.sqrt(variance);

    // Trend calculation
    const recentValues = values.slice(0, Math.min(5, values.length));
    const trend = this.calculateTrend(recentValues);

    return {
      average: Math.round(average * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      trend,
      volume: Math.round(
        volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length
      ),
      range: {
        min: Math.min(...values),
        max: Math.max(...values),
      },
      dataPoints: values.length,
    };
  }

  // Calculate trend from recent values
  calculateTrend(values) {
    if (values.length < 2) return "stable";

    const recent = values[0];
    const older = values[values.length - 1];
    const change = recent - older;
    const changePercent = older > 0 ? (change / older) * 100 : 0;

    if (Math.abs(changePercent) < 2) return "stable";
    return changePercent > 0 ? "bullish" : "bearish";
  }

  // Calculate dynamic price targets
  calculatePriceTargets(ipo, baseline) {
    const basePrice = ipo.maxPrice || 100;
    const averageGMP = baseline.average || 0;

    return {
      conservative: basePrice + averageGMP * 0.7,
      realistic: basePrice + averageGMP * 1.0,
      optimistic: basePrice + averageGMP * 1.3,
      resistance: Math.max(baseline.range.max || 0, averageGMP * 1.2),
      support: Math.min(baseline.range.min || 0, averageGMP * 0.8),
    };
  }

  // Start categorized tracking for different IPO types
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

    // Low priority tracking (Closed IPOs)
    const lowPriorityInterval = setInterval(async () => {
      await this.processTrackingQueue("LOW_PRIORITY");
    }, this.trackingConfig.CLOSED_IPO_INTERVAL);

    this.activeIntervals.set("LOW_PRIORITY", lowPriorityInterval);

    console.log("🎯 Started categorized GMP tracking");
  }

  // Process tracking queue for specific priority level
  async processTrackingQueue(priorityLevel) {
    const queue = this.trackingQueues[priorityLevel];
    if (queue.length === 0) return;

    console.log(`🔄 Processing ${priorityLevel} queue: ${queue.length} IPOs`);

    // Process in batches to avoid overwhelming the system
    const batchSize = priorityLevel === "HIGH_PRIORITY" ? 5 : 3;
    const batch = queue.splice(0, batchSize);

    const trackingPromises = batch.map((ipoId) =>
      this.trackIPOGMP(ipoId).catch((error) => {
        console.error(`Error tracking IPO ${ipoId}:`, error.message);
        // Re-add to queue for retry if not too many failures
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

  // Track GMP for individual IPO with enhanced multi-source aggregation
  async trackIPOGMP(ipoId) {
    const trackingData = this.trackedIPOs.get(ipoId);
    if (!trackingData) {
      console.warn(`No tracking data found for IPO ${ipoId}`);
      return;
    }

    const startTime = Date.now();
    console.log(`💰 Tracking GMP for ${trackingData.symbol}...`);

    try {
      // Fetch GMP from multiple sources concurrently
      const sourceResults = await this.fetchGMPFromAllSources(trackingData);

      if (sourceResults.length === 0) {
        throw new Error("No GMP data received from any source");
      }

      // Calculate weighted average GMP
      const aggregatedGMP = this.calculateAggregatedGMP(
        sourceResults,
        trackingData
      );

      // Validate and enrich GMP data
      const enrichedGMP = await this.enrichGMPData(aggregatedGMP, trackingData);

      // Perform real-time analysis
      const analysis = await this.performRealtimeAnalysis(
        enrichedGMP,
        trackingData
      );

      // Store in database
      const gmpRecord = await this.storeGMPData(enrichedGMP, trackingData);

      // Update tracking data
      await this.updateTrackingData(trackingData, enrichedGMP, analysis);

      // Cache and broadcast updates
      await this.cacheAndBroadcastGMP(enrichedGMP, trackingData, analysis);

      // Check and trigger alerts
      await this.checkAndTriggerAlerts(enrichedGMP, trackingData, analysis);

      // Update performance metrics
      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics(true, latency);

      trackingData.statistics.totalUpdates++;
      trackingData.statistics.successfulUpdates++;
      trackingData.consecutiveFailures = 0;
      trackingData.lastTracked = Date.now();

      console.log(
        `✅ Successfully tracked ${trackingData.symbol}: ₹${enrichedGMP.value} (${enrichedGMP.change?.percentage > 0 ? "+" : ""}${enrichedGMP.change?.percentage}%)`
      );

      return gmpRecord;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics(false, latency);

      trackingData.consecutiveFailures++;
      trackingData.statistics.totalUpdates++;

      console.error(
        `❌ Failed to track GMP for ${trackingData.symbol}:`,
        error.message
      );
      throw error;
    }
  }

  // Fetch GMP from all configured sources
  async fetchGMPFromAllSources(trackingData) {
    const fetchPromises = Object.entries(this.sources).map(
      ([sourceKey, sourceConfig]) =>
        this.fetchGMPFromSource(sourceKey, sourceConfig, trackingData)
    );

    const results = await Promise.allSettled(fetchPromises);

    // Filter successful results and update source reliability
    const successfulResults = [];

    results.forEach((result, index) => {
      const sourceKey = Object.keys(this.sources)[index];
      const sourceReliability = trackingData.sourceReliability.get(sourceKey);

      if (result.status === "fulfilled" && result.value) {
        successfulResults.push({
          source: sourceKey,
          ...result.value,
          reliability: sourceReliability.reliability,
        });

        // Update source reliability stats
        sourceReliability.successCount++;
        sourceReliability.lastSuccess = Date.now();
      } else {
        sourceReliability.failureCount++;
        console.warn(
          `Source ${sourceKey} failed for ${trackingData.symbol}:`,
          result.reason?.message
        );
      }
    });

    return successfulResults;
  }

  // Fetch GMP from individual source (mock implementation)
  async fetchGMPFromSource(sourceKey, sourceConfig, trackingData) {
    const startTime = Date.now();

    try {
      // Simulate API call to GMP source
      const gmpData = await this.simulateGMPFetch(sourceKey, trackingData);

      const latency = Date.now() - startTime;

      // Update source reliability latency
      const sourceReliability = trackingData.sourceReliability.get(sourceKey);
      sourceReliability.averageLatency =
        (sourceReliability.averageLatency * sourceReliability.successCount +
          latency) /
        (sourceReliability.successCount + 1);

      return {
        value: gmpData.value,
        volume: gmpData.volume,
        bidPrice: gmpData.bidPrice,
        askPrice: gmpData.askPrice,
        timestamp: Date.now(),
        latency,
        confidence: gmpData.confidence || sourceConfig.reliability,
      };
    } catch (error) {
      console.error(`Source ${sourceKey} error:`, error.message);
      throw error;
    }
  }

  // Simulate GMP fetch (replace with actual API calls)
  async simulateGMPFetch(sourceKey, trackingData) {
    // Simulate network delay based on source
    const delay = this.sources[sourceKey]?.timeout || 1000;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * (delay / 10))
    );

    // Simulate different source behaviors and reliability
    const baseValue = trackingData.baseline.average || Math.random() * 200;
    const volatility = Math.random() * 20 - 10; // ±10 variance

    // Source-specific variations
    const sourceVariations = {
      PRIMARY: { accuracy: 0.95, delay: 0.8 },
      SECONDARY: { accuracy: 0.9, delay: 1.0 },
      BROKER: { accuracy: 0.85, delay: 1.2 },
      AGGREGATOR: { accuracy: 0.8, delay: 1.5 },
    };

    const variation = sourceVariations[sourceKey] || {
      accuracy: 0.7,
      delay: 1.0,
    };

    // Occasionally simulate failures
    if (Math.random() > variation.accuracy) {
      throw new Error(`Source ${sourceKey} temporarily unavailable`);
    }

    const finalValue = Math.max(0, baseValue + volatility);

    return {
      value: Math.round(finalValue * 100) / 100,
      volume: Math.floor(Math.random() * 2000) + 500,
      bidPrice: finalValue - Math.random() * 5,
      askPrice: finalValue + Math.random() * 5,
      confidence: variation.accuracy,
    };
  }

  // Calculate aggregated GMP from multiple sources
  calculateAggregatedGMP(sourceResults, trackingData) {
    if (sourceResults.length === 0) {
      throw new Error("No source results to aggregate");
    }

    // Calculate weighted average based on source reliability and confidence
    const totalWeight = sourceResults.reduce((sum, result) => {
      const sourceConfig = this.sources[result.source];
      return sum + sourceConfig.weight * result.confidence;
    }, 0);

    const weightedValue =
      sourceResults.reduce((sum, result) => {
        const sourceConfig = this.sources[result.source];
        const weight = sourceConfig.weight * result.confidence;
        return sum + result.value * weight;
      }, 0) / totalWeight;

    // Calculate other aggregated metrics
    const totalVolume = sourceResults.reduce(
      (sum, result) => sum + result.volume,
      0
    );
    const avgBidPrice =
      sourceResults.reduce((sum, result) => sum + result.bidPrice, 0) /
      sourceResults.length;
    const avgAskPrice =
      sourceResults.reduce((sum, result) => sum + result.askPrice, 0) /
      sourceResults.length;
    const avgConfidence =
      sourceResults.reduce((sum, result) => sum + result.confidence, 0) /
      sourceResults.length;

    // Calculate spread and market depth indicators
    const spread = avgAskPrice - avgBidPrice;
    const midPrice = (avgBidPrice + avgAskPrice) / 2;

    return {
      value: Math.round(weightedValue * 100) / 100,
      volume: totalVolume,
      bidPrice: Math.round(avgBidPrice * 100) / 100,
      askPrice: Math.round(avgAskPrice * 100) / 100,
      midPrice: Math.round(midPrice * 100) / 100,
      spread: Math.round(spread * 100) / 100,
      confidence: Math.round(avgConfidence * 100) / 100,
      sourceCount: sourceResults.length,
      sources: sourceResults.map((r) => r.source),
      aggregatedAt: Date.now(),
    };
  }

  // Enrich GMP data with additional calculations
  async enrichGMPData(aggregatedGMP, trackingData) {
    // Get previous GMP for comparison
    const previousGMP = await this.getPreviousGMP(trackingData.id);

    // Calculate change metrics
    const change = this.calculateChange(
      aggregatedGMP.value,
      previousGMP?.value
    );

    // Calculate percentage based on IPO price
    const ipo = await prisma.iPO.findUnique({
      where: { id: trackingData.id },
      select: { maxPrice: true, minPrice: true },
    });

    const basePrice = ipo?.maxPrice || 100;
    const percentage = ((aggregatedGMP.value / basePrice) * 100).toFixed(2);

    // Calculate technical indicators
    const technicalIndicators =
      await this.calculateTechnicalIndicators(trackingData);

    // Market sentiment analysis
    const sentiment = this.analyzeSentiment(
      aggregatedGMP,
      change,
      technicalIndicators
    );

    return {
      ...aggregatedGMP,
      change,
      percentage: parseFloat(percentage),
      basePrice,
      technicalIndicators,
      sentiment,
      quality: this.assessDataQuality(aggregatedGMP),
      timestamp: new Date(),
    };
  }

  // Calculate change metrics
  calculateChange(currentValue, previousValue) {
    if (!previousValue) {
      return {
        absolute: 0,
        percentage: 0,
        direction: "stable",
        magnitude: "none",
      };
    }

    const absolute = currentValue - previousValue;
    const percentage = ((absolute / previousValue) * 100).toFixed(2);

    let direction = "stable";
    let magnitude = "small";

    if (Math.abs(absolute) > 0.5) {
      direction = absolute > 0 ? "up" : "down";

      if (Math.abs(percentage) > 10) magnitude = "large";
      else if (Math.abs(percentage) > 5) magnitude = "medium";
      else magnitude = "small";
    }

    return {
      absolute: Math.round(absolute * 100) / 100,
      percentage: parseFloat(percentage),
      direction,
      magnitude,
    };
  }

  // Calculate technical indicators
  async calculateTechnicalIndicators(trackingData) {
    try {
      const recentGMP = await prisma.gMP.findMany({
        where: { ipoId: trackingData.id },
        orderBy: { timestamp: "desc" },
        take: 20, // Last 20 records for indicators
      });

      if (recentGMP.length < 5) {
        return { available: false, reason: "Insufficient data" };
      }

      const values = recentGMP.map((g) => g.value).reverse(); // Chronological order
      const volumes = recentGMP.map((g) => g.volume || 0).reverse();

      return {
        available: true,
        sma5: this.calculateSMA(values.slice(-5), 5),
        sma10: this.calculateSMA(values.slice(-10), 10),
        rsi: this.calculateRSI(values),
        volatility: this.calculateVolatility(values),
        volumeTrend: this.calculateVolumeTrend(volumes),
        momentum: this.calculateMomentum(values),
        resistance: Math.max(...values.slice(-10)),
        support: Math.min(...values.slice(-10)),
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  // Calculate Simple Moving Average
  calculateSMA(values, period) {
    if (values.length < period) return null;
    const sum = values.slice(-period).reduce((a, b) => a + b, 0);
    return Math.round((sum / period) * 100) / 100;
  }

  // Calculate RSI (Relative Strength Index)
  calculateRSI(values, period = 14) {
    if (values.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }

    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return Math.round(rsi * 100) / 100;
  }

  // Calculate volatility
  calculateVolatility(values) {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;

    return Math.round(Math.sqrt(variance) * 100) / 100;
  }

  // Calculate volume trend
  calculateVolumeTrend(volumes) {
    if (volumes.length < 2) return "stable";

    const recent = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = volumes.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;

    if (recent > older * 1.2) return "increasing";
    if (recent < older * 0.8) return "decreasing";
    return "stable";
  }

  // Calculate momentum
  calculateMomentum(values, period = 5) {
    if (values.length < period) return 0;

    const current = values[values.length - 1];
    const previous = values[values.length - period];

    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
  }

  // Analyze market sentiment
  analyzeSentiment(gmpData, change, technicalIndicators) {
    let score = 50; // Neutral baseline

    // Price change sentiment
    if (change.direction === "up") {
      score +=
        change.magnitude === "large"
          ? 20
          : change.magnitude === "medium"
            ? 10
            : 5;
    } else if (change.direction === "down") {
      score -=
        change.magnitude === "large"
          ? 20
          : change.magnitude === "medium"
            ? 10
            : 5;
    }

    // Volume sentiment
    if (gmpData.volume > 1500) score += 10;
    else if (gmpData.volume < 500) score -= 5;

    // Technical indicators sentiment
    if (technicalIndicators.available) {
      if (technicalIndicators.rsi > 70)
        score -= 15; // Overbought
      else if (technicalIndicators.rsi < 30) score += 15; // Oversold

      if (technicalIndicators.volumeTrend === "increasing") score += 5;
      else if (technicalIndicators.volumeTrend === "decreasing") score -= 5;
    }

    // Spread sentiment (tighter spread = better sentiment)
    if (gmpData.spread < 2) score += 5;
    else if (gmpData.spread > 5) score -= 5;

    score = Math.max(0, Math.min(100, score));

    let sentiment = "neutral";
    if (score > 70) sentiment = "very_bullish";
    else if (score > 60) sentiment = "bullish";
    else if (score > 40) sentiment = "neutral";
    else if (score > 30) sentiment = "bearish";
    else sentiment = "very_bearish";

    return {
      score: Math.round(score),
      sentiment,
      factors: {
        priceChange: change.direction,
        volume: gmpData.volume > 1000 ? "high" : "normal",
        technicals: technicalIndicators.available
          ? "analyzed"
          : "insufficient_data",
        spread: gmpData.spread < 3 ? "tight" : "wide",
      },
    };
  }

  // Assess data quality
  assessDataQuality(gmpData) {
    let quality = 100;

    // Source diversity
    if (gmpData.sourceCount < 2) quality -= 20;
    else if (gmpData.sourceCount < 3) quality -= 10;

    // Confidence level
    if (gmpData.confidence < 0.8) quality -= 15;
    else if (gmpData.confidence < 0.9) quality -= 5;

    // Spread tightness
    if (gmpData.spread > 10) quality -= 15;
    else if (gmpData.spread > 5) quality -= 10;

    // Volume adequacy
    if (gmpData.volume < 100) quality -= 20;
    else if (gmpData.volume < 500) quality -= 10;

    quality = Math.max(0, Math.min(100, quality));

    let grade = "A";
    if (quality < 90) grade = "B";
    if (quality < 80) grade = "C";
    if (quality < 70) grade = "D";
    if (quality < 60) grade = "F";

    return {
      score: quality,
      grade,
      factors: {
        sourceCount: gmpData.sourceCount,
        confidence: gmpData.confidence,
        spread: gmpData.spread,
        volume: gmpData.volume,
      },
    };
  }

  // Perform real-time analysis
  async performRealtimeAnalysis(gmpData, trackingData) {
    const analysis = {
      alerts: [],
      anomalies: [],
      patterns: [],
      recommendations: [],
    };

    // Volatility analysis
    if (
      Math.abs(gmpData.change.percentage) >
      this.realtimeAnalysis.volatilityThreshold
    ) {
      analysis.alerts.push({
        type: "HIGH_VOLATILITY",
        severity: "medium",
        message: `High volatility detected: ${gmpData.change.percentage}%`,
        threshold: this.realtimeAnalysis.volatilityThreshold,
        actual: Math.abs(gmpData.change.percentage),
      });
    }

    // Rapid change analysis
    if (
      Math.abs(gmpData.change.absolute) >
      this.realtimeAnalysis.rapidChangeThreshold
    ) {
      analysis.alerts.push({
        type: "RAPID_CHANGE",
        severity: "high",
        message: `Rapid price change: ₹${gmpData.change.absolute}`,
        threshold: this.realtimeAnalysis.rapidChangeThreshold,
        actual: Math.abs(gmpData.change.absolute),
      });
    }

    // Volume spike analysis
    const baseVolume = trackingData.baseline.volume || 1000;
    if (
      gmpData.volume >
      baseVolume * (this.realtimeAnalysis.volumeSpike / 100)
    ) {
      analysis.alerts.push({
        type: "VOLUME_SPIKE",
        severity: "medium",
        message: `Volume spike detected: ${gmpData.volume} vs baseline ${baseVolume}`,
        increase: Math.round((gmpData.volume / baseVolume - 1) * 100),
      });
    }

    // Anomaly detection
    if (this.realtimeAnalysis.anomalyDetection) {
      const anomalies = await this.detectAnomalies(gmpData, trackingData);
      analysis.anomalies.push(...anomalies);
    }

    // Pattern recognition
    if (this.realtimeAnalysis.trendAnalysis) {
      const patterns = await this.recognizePatterns(gmpData, trackingData);
      analysis.patterns.push(...patterns);
    }

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(
      gmpData,
      analysis,
      trackingData
    );

    return analysis;
  }

  // Detect price and volume anomalies
  async detectAnomalies(gmpData, trackingData) {
    const anomalies = [];

    try {
      // Z-score analysis for price anomalies
      const recentPrices = await this.getRecentPrices(trackingData.id, 20);
      if (recentPrices.length >= 10) {
        const zScore = this.calculateZScore(gmpData.value, recentPrices);

        if (Math.abs(zScore) > 2.5) {
          anomalies.push({
            type: "PRICE_ANOMALY",
            severity: Math.abs(zScore) > 3 ? "high" : "medium",
            zScore: Math.round(zScore * 100) / 100,
            message: `Price anomaly detected: ${Math.abs(zScore)} standard deviations from mean`,
          });
        }
      }

      // Volume anomaly detection
      const recentVolumes = await this.getRecentVolumes(trackingData.id, 10);
      if (recentVolumes.length >= 5) {
        const volumeZScore = this.calculateZScore(
          gmpData.volume,
          recentVolumes
        );

        if (Math.abs(volumeZScore) > 2) {
          anomalies.push({
            type: "VOLUME_ANOMALY",
            severity: Math.abs(volumeZScore) > 3 ? "high" : "medium",
            zScore: Math.round(volumeZScore * 100) / 100,
            message: `Volume anomaly detected: ${Math.abs(volumeZScore)} standard deviations from mean`,
          });
        }
      }
    } catch (error) {
      console.error("Error detecting anomalies:", error);
    }

    return anomalies;
  }

  // Calculate Z-score for anomaly detection
  calculateZScore(value, dataset) {
    const mean = dataset.reduce((sum, val) => sum + val, 0) / dataset.length;
    const variance =
      dataset.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      dataset.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (value - mean) / stdDev : 0;
  }

  // Recognize price patterns
  async recognizePatterns(gmpData, trackingData) {
    const patterns = [];

    try {
      const recentPrices = await this.getRecentPrices(trackingData.id, 10);

      if (recentPrices.length >= 5) {
        // Support/Resistance pattern
        const support = Math.min(...recentPrices.slice(-5));
        const resistance = Math.max(...recentPrices.slice(-5));

        if (gmpData.value <= support * 1.02) {
          patterns.push({
            type: "SUPPORT_TEST",
            level: support,
            message: `Price testing support level at ₹${support}`,
            strength: this.calculateSupportStrength(recentPrices, support),
          });
        }

        if (gmpData.value >= resistance * 0.98) {
          patterns.push({
            type: "RESISTANCE_TEST",
            level: resistance,
            message: `Price testing resistance level at ₹${resistance}`,
            strength: this.calculateResistanceStrength(
              recentPrices,
              resistance
            ),
          });
        }

        // Trend patterns
        const trend = this.identifyTrend(recentPrices);
        if (trend !== "sideways") {
          patterns.push({
            type: "TREND",
            direction: trend,
            strength: this.calculateTrendStrength(recentPrices),
            message: `${trend.toUpperCase()} trend identified`,
          });
        }
      }
    } catch (error) {
      console.error("Error recognizing patterns:", error);
    }

    return patterns;
  }

  // Generate trading recommendations
  generateRecommendations(gmpData, analysis, trackingData) {
    const recommendations = [];

    // Based on sentiment
    if (
      gmpData.sentiment.sentiment === "very_bullish" &&
      gmpData.quality.score > 80
    ) {
      recommendations.push({
        type: "BUY_SIGNAL",
        confidence: 0.8,
        reason: "Strong bullish sentiment with high data quality",
        target: trackingData.priceTargets.optimistic,
      });
    } else if (
      gmpData.sentiment.sentiment === "very_bearish" &&
      gmpData.quality.score > 80
    ) {
      recommendations.push({
        type: "SELL_SIGNAL",
        confidence: 0.7,
        reason: "Strong bearish sentiment with high data quality",
        target: trackingData.priceTargets.support,
      });
    }

    // Based on technical patterns
    const resistanceTests = analysis.patterns.filter(
      (p) => p.type === "RESISTANCE_TEST"
    );
    const supportTests = analysis.patterns.filter(
      (p) => p.type === "SUPPORT_TEST"
    );

    if (
      resistanceTests.length > 0 &&
      gmpData.volume > trackingData.baseline.volume * 1.5
    ) {
      recommendations.push({
        type: "BREAKOUT_WATCH",
        confidence: 0.6,
        reason: "High volume resistance test - potential breakout",
        target: resistanceTests[0].level * 1.1,
      });
    }

    if (supportTests.length > 0 && supportTests[0].strength > 0.7) {
      recommendations.push({
        type: "SUPPORT_BUY",
        confidence: 0.65,
        reason: "Strong support level test - potential bounce",
        target: trackingData.priceTargets.realistic,
      });
    }

    // Based on anomalies
    const priceAnomalies = analysis.anomalies.filter(
      (a) => a.type === "PRICE_ANOMALY"
    );
    if (priceAnomalies.length > 0 && priceAnomalies[0].severity === "high") {
      recommendations.push({
        type: "CAUTION",
        confidence: 0.9,
        reason: "Significant price anomaly detected - exercise caution",
        action: "Wait for price stabilization",
      });
    }

    return recommendations;
  }

  // Store GMP data in database
  async storeGMPData(gmpData, trackingData) {
    try {
      const gmpRecord = await prisma.gMP.create({
        data: {
          ipoId: trackingData.id,
          value: gmpData.value,
          percentage: gmpData.percentage,
          source: "aggregated",
          volume: gmpData.volume,
          bidPrice: gmpData.bidPrice,
          askPrice: gmpData.askPrice,
          timestamp: gmpData.timestamp,
          date: gmpData.timestamp,
          // Store additional metadata as JSON
          metadata: JSON.stringify({
            sources: gmpData.sources,
            confidence: gmpData.confidence,
            spread: gmpData.spread,
            quality: gmpData.quality,
            sentiment: gmpData.sentiment,
            technicalIndicators: gmpData.technicalIndicators,
          }),
        },
      });

      return gmpRecord;
    } catch (error) {
      console.error("Error storing GMP data:", error);
      throw error;
    }
  }

  // Update tracking data with latest information
  async updateTrackingData(trackingData, gmpData, analysis) {
    // Update statistics
    trackingData.statistics.averageValue =
      (trackingData.statistics.averageValue *
        trackingData.statistics.successfulUpdates +
        gmpData.value) /
      (trackingData.statistics.successfulUpdates + 1);

    // Update trends
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const sixHours = 6 * 60 * 60 * 1000;
    const twentyFourHours = 24 * 60 * 60 * 1000;

    // Add to trends and clean old data
    trackingData.trends.short.push({ value: gmpData.value, timestamp: now });
    trackingData.trends.medium.push({ value: gmpData.value, timestamp: now });
    trackingData.trends.long.push({ value: gmpData.value, timestamp: now });

    // Clean old trend data
    trackingData.trends.short = trackingData.trends.short.filter(
      (t) => now - t.timestamp < oneHour
    );
    trackingData.trends.medium = trackingData.trends.medium.filter(
      (t) => now - t.timestamp < sixHours
    );
    trackingData.trends.long = trackingData.trends.long.filter(
      (t) => now - t.timestamp < twentyFourHours
    );

    // Update alerts
    if (analysis.alerts.length > 0) {
      analysis.alerts.forEach((alert) => {
        trackingData.alerts.add(JSON.stringify(alert));
      });

      // Clean old alerts (keep only last 100)
      if (trackingData.alerts.size > 100) {
        const alertsArray = Array.from(trackingData.alerts);
        trackingData.alerts.clear();
        alertsArray
          .slice(-100)
          .forEach((alert) => trackingData.alerts.add(alert));
      }
    }

    // Update price targets based on new data
    const newBaseline = this.calculateBaseline([
      { value: gmpData.value, volume: gmpData.volume },
      ...Array.from(trackingData.trends.medium).map((t) => ({
        value: t.value,
        volume: gmpData.volume,
      })),
    ]);

    trackingData.baseline = newBaseline;
    trackingData.priceTargets = this.calculatePriceTargets(
      { maxPrice: gmpData.basePrice },
      newBaseline
    );
  }

  // Cache and broadcast GMP updates
  async cacheAndBroadcastGMP(gmpData, trackingData, analysis) {
    try {
      // Prepare real-time update data
      const updateData = {
        ipoId: trackingData.id,
        symbol: trackingData.symbol,
        value: gmpData.value,
        change: gmpData.change,
        percentage: gmpData.percentage,
        volume: gmpData.volume,
        spread: gmpData.spread,
        confidence: gmpData.confidence,
        quality: gmpData.quality,
        sentiment: gmpData.sentiment,
        technicalIndicators: gmpData.technicalIndicators,
        priceTargets: trackingData.priceTargets,
        analysis: {
          alerts: analysis.alerts,
          patterns: analysis.patterns,
          recommendations: analysis.recommendations,
        },
        timestamp: gmpData.timestamp,
        lastUpdated: Date.now(),
      };

      // Cache real-time data
      await cache.cacheRealTimeData("GMP", trackingData.id, updateData);
      await cache.cacheRealTimeData(
        "GMP_SYMBOL",
        trackingData.symbol,
        updateData
      );

      // Broadcast to WebSocket clients
      await webSocketService.broadcastGMPUpdate(trackingData.id, updateData, {
        includeAnalytics: true,
        includeTechnicals: gmpData.technicalIndicators.available,
      });

      console.log(
        `📡 Cached and broadcast GMP update for ${trackingData.symbol}`
      );
    } catch (error) {
      console.error("Error caching and broadcasting GMP:", error);
    }
  }

  // Check and trigger alerts
  async checkAndTriggerAlerts(gmpData, trackingData, analysis) {
    try {
      // System-wide alerts
      for (const alert of analysis.alerts) {
        if (alert.severity === "high") {
          await webSocketService.broadcastAlert("gmp_alert", {
            ipoId: trackingData.id,
            symbol: trackingData.symbol,
            alert,
            gmpValue: gmpData.value,
            timestamp: Date.now(),
          });

          this.performance.alertsTriggered++;
        }
      }

      // User-specific threshold alerts
      const thresholds = this.alertThresholds.get(trackingData.id) || [];

      for (const threshold of thresholds) {
        if (this.shouldTriggerThresholdAlert(gmpData.value, threshold)) {
          await webSocketService.broadcastAlert("threshold_alert", {
            ipoId: trackingData.id,
            symbol: trackingData.symbol,
            threshold: threshold.value,
            currentValue: gmpData.value,
            userId: threshold.userId,
            timestamp: Date.now(),
          });

          // Mark as triggered to avoid spam
          threshold.triggered = true;
          threshold.triggeredAt = Date.now();
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

  async getPreviousGMP(ipoId) {
    try {
      return await prisma.gMP.findFirst({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        select: { value: true, timestamp: true },
      });
    } catch (error) {
      return null;
    }
  }

  async getRecentPrices(ipoId, count) {
    try {
      const records = await prisma.gMP.findMany({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        take: count,
        select: { value: true },
      });
      return records.map((r) => r.value);
    } catch (error) {
      return [];
    }
  }

  async getRecentVolumes(ipoId, count) {
    try {
      const records = await prisma.gMP.findMany({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        take: count,
        select: { volume: true },
      });
      return records.map((r) => r.volume || 0);
    } catch (error) {
      return [];
    }
  }

  // Alert management
  setAlertThreshold(ipoId, userId, threshold, direction = "above") {
    if (!this.alertThresholds.has(ipoId)) {
      this.alertThresholds.set(ipoId, []);
    }

    const thresholds = this.alertThresholds.get(ipoId);
    thresholds.push({
      userId,
      value: threshold,
      direction,
      createdAt: Date.now(),
      triggered: false,
    });

    console.log(
      `🚨 Alert threshold set: ${direction} ₹${threshold} for IPO ${ipoId}`
    );
  }

  shouldTriggerThresholdAlert(currentValue, threshold) {
    if (threshold.triggered) return false;

    if (threshold.direction === "above" && currentValue >= threshold.value) {
      return true;
    }

    if (threshold.direction === "below" && currentValue <= threshold.value) {
      return true;
    }

    return false;
  }

  // Real-time monitoring
  startRealtimeMonitoring() {
    const monitoringInterval = setInterval(() => {
      this.performSystemMonitoring();
    }, 60000); // Every minute

    this.activeIntervals.set("MONITORING", monitoringInterval);

    console.log("📊 Started real-time monitoring");
  }

  performSystemMonitoring() {
    // Monitor source reliability
    this.monitorSourceReliability();

    // Check for stale data
    this.checkForStaleData();

    // Update performance metrics
    this.updateSystemMetrics();

    // Broadcast system status
    this.broadcastSystemStatus();
  }

  monitorSourceReliability() {
    for (const [ipoId, trackingData] of this.trackedIPOs) {
      for (const [sourceKey, reliability] of trackingData.sourceReliability) {
        const totalRequests =
          reliability.successCount + reliability.failureCount;

        if (totalRequests > 0) {
          const currentReliability = reliability.successCount / totalRequests;

          // Update reliability score with exponential moving average
          reliability.reliability =
            reliability.reliability * 0.7 + currentReliability * 0.3;

          // Update performance tracking
          this.performance.sourcesStatus.set(sourceKey, {
            reliability: reliability.reliability,
            averageLatency: reliability.averageLatency,
            lastSuccess: reliability.lastSuccess,
            status: reliability.reliability > 0.8 ? "healthy" : "degraded",
          });
        }
      }
    }
  }

  checkForStaleData() {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [ipoId, trackingData] of this.trackedIPOs) {
      if (
        trackingData.lastTracked &&
        now - trackingData.lastTracked > staleThreshold
      ) {
        console.warn(
          `⚠️  Stale data detected for ${trackingData.symbol} (${trackingData.priority})`
        );

        // Re-add to high priority queue for immediate tracking
        this.addToTrackingQueue(ipoId, "HIGH_PRIORITY");
      }
    }
  }

  updateSystemMetrics() {
    const now = Date.now();
    this.performance.lastTrackedAt = now;

    // Calculate success rate
    const totalUpdates =
      this.performance.successfulUpdates + this.performance.failedUpdates;
    const successRate =
      totalUpdates > 0
        ? (this.performance.successfulUpdates / totalUpdates) * 100
        : 100;

    this.performance.successRate = Math.round(successRate * 100) / 100;
  }

  async broadcastSystemStatus() {
    try {
      const status = {
        type: "gmp_tracker_status",
        isRunning: this.isRunning,
        trackedIPOs: this.trackedIPOs.size,
        performance: this.getPerformanceMetrics(),
        queues: {
          highPriority: this.trackingQueues.HIGH_PRIORITY.length,
          mediumPriority: this.trackingQueues.MEDIUM_PRIORITY.length,
          lowPriority: this.trackingQueues.LOW_PRIORITY.length,
        },
        sources: Array.from(this.performance.sourcesStatus.entries()).map(
          ([key, status]) => ({
            name: key,
            ...status,
          })
        ),
        timestamp: Date.now(),
      };

      await webSocketService.broadcastSystemStatus(status);
    } catch (error) {
      console.error("Error broadcasting system status:", error);
    }
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
  }

  logPerformanceMetrics() {
    const metrics = this.getPerformanceMetrics();
    console.log("📊 GMP Tracker Performance Metrics:", metrics);

    // Store metrics in cache for monitoring dashboard
    cache.set("gmp_tracker_metrics", metrics, 300);
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
      activeSources: this.performance.sourcesStatus.size,
      lastTrackedAt: this.performance.lastTrackedAt
        ? new Date(this.performance.lastTrackedAt).toISOString()
        : null,
    };
  }

  // Maintenance tasks
  startMaintenanceTasks() {
    // Cleanup old data
    const cleanupInterval = setInterval(
      () => {
        this.performCleanup();
      },
      30 * 60 * 1000
    ); // Every 30 minutes

    this.activeIntervals.set("CLEANUP", cleanupInterval);

    console.log("🧹 Started maintenance tasks");
  }

  performCleanup() {
    const now = Date.now();

    // Clean up old historical data
    for (const [ipoId, trackingData] of this.trackedIPOs) {
      // Clean trends
      const oneHour = 60 * 60 * 1000;
      const sixHours = 6 * 60 * 60 * 1000;
      const twentyFourHours = 24 * 60 * 60 * 1000;

      trackingData.trends.short = trackingData.trends.short.filter(
        (t) => now - t.timestamp < oneHour
      );
      trackingData.trends.medium = trackingData.trends.medium.filter(
        (t) => now - t.timestamp < sixHours
      );
      trackingData.trends.long = trackingData.trends.long.filter(
        (t) => now - t.timestamp < twentyFourHours
      );
    }

    // Clean up old alert thresholds
    for (const [ipoId, thresholds] of this.alertThresholds) {
      const activeThresholds = thresholds.filter(
        (t) => !t.triggered || now - t.triggeredAt < 24 * 60 * 60 * 1000 // Keep for 24 hours after trigger
      );

      if (activeThresholds.length === 0) {
        this.alertThresholds.delete(ipoId);
      } else {
        this.alertThresholds.set(ipoId, activeThresholds);
      }
    }

    console.log("🧹 Cleanup completed");
  }

  // Manual operations
  async addIPOTracking(ipoId) {
    try {
      const ipo = await prisma.iPO.findUnique({
        where: { id: ipoId },
        include: {
          gmp: {
            orderBy: { timestamp: "desc" },
            take: 10,
          },
          analytics: true,
        },
      });

      if (!ipo) {
        throw new Error(`IPO not found: ${ipoId}`);
      }

      await this.initializeIPOTracking(ipo);

      console.log(`✅ Added tracking for IPO: ${ipo.symbol}`);
      return true;
    } catch (error) {
      console.error(`Error adding IPO tracking:`, error);
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
      this.alertThresholds.delete(ipoId);

      console.log(`✅ Removed tracking for IPO: ${trackingData.symbol}`);
      return true;
    }

    return false;
  }

  async forceTrackIPO(ipoId) {
    try {
      const result = await this.trackIPOGMP(ipoId);
      console.log(`✅ Force tracked IPO: ${ipoId}`);
      return result;
    } catch (error) {
      console.error(`Error force tracking IPO ${ipoId}:`, error);
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
      sources: Object.keys(this.sources).length,
      activeIntervals: this.activeIntervals.size,
      alerts: {
        total: Array.from(this.alertThresholds.values()).reduce(
          (sum, thresholds) => sum + thresholds.length,
          0
        ),
        triggered: this.performance.alertsTriggered,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheck() {
    try {
      // Check if critical components are working
      const dbCheck = await prisma.gMP.findFirst();
      const cacheCheck = await cache.healthCheck();

      // Check source connectivity (simulate)
      const sourceChecks = await Promise.allSettled(
        Object.keys(this.sources).map(async (sourceKey) => {
          // Simulate source health check
          return { source: sourceKey, healthy: Math.random() > 0.1 };
        })
      );

      const healthySources = sourceChecks.filter(
        (check) => check.status === "fulfilled" && check.value.healthy
      ).length;

      const isHealthy =
        this.isRunning &&
        dbCheck !== undefined &&
        cacheCheck.status === "healthy" &&
        healthySources > 0;

      return {
        status: isHealthy ? "healthy" : "degraded",
        isRunning: this.isRunning,
        database: dbCheck !== undefined ? "connected" : "disconnected",
        cache: cacheCheck.status,
        sources: {
          total: Object.keys(this.sources).length,
          healthy: healthySources,
          status: healthySources > 2 ? "good" : "degraded",
        },
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
    console.log("🛑 Stopping GMP Tracker Service...");

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
          type: "gmp_tracker_shutdown",
          message: "GMP Tracker service has been stopped",
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
    this.alertThresholds.clear();
    this.performance.sourcesStatus.clear();

    Object.values(this.trackingQueues).forEach((queue) => (queue.length = 0));

    console.log("✅ GMP Tracker Service stopped gracefully");
    console.log("📊 Final Performance Metrics:", this.getPerformanceMetrics());
  }

  // Helper pattern recognition methods
  calculateSupportStrength(prices, supportLevel) {
    const touchCount = prices.filter(
      (price) => Math.abs(price - supportLevel) <= supportLevel * 0.02
    ).length;
    return Math.min(touchCount / 5, 1); // Normalize to 0-1
  }

  calculateResistanceStrength(prices, resistanceLevel) {
    const touchCount = prices.filter(
      (price) => Math.abs(price - resistanceLevel) <= resistanceLevel * 0.02
    ).length;
    return Math.min(touchCount / 5, 1); // Normalize to 0-1
  }

  identifyTrend(prices) {
    if (prices.length < 3) return "sideways";

    const first =
      prices
        .slice(0, Math.floor(prices.length / 3))
        .reduce((a, b) => a + b, 0) / Math.floor(prices.length / 3);
    const last =
      prices.slice(-Math.floor(prices.length / 3)).reduce((a, b) => a + b, 0) /
      Math.floor(prices.length / 3);

    const change = ((last - first) / first) * 100;

    if (change > 3) return "uptrend";
    if (change < -3) return "downtrend";
    return "sideways";
  }

  calculateTrendStrength(prices) {
    if (prices.length < 2) return 0;

    const linearRegression = this.calculateLinearRegression(prices);
    return (
      Math.abs(linearRegression.slope) /
      (Math.max(...prices) - Math.min(...prices))
    );
  }

  calculateLinearRegression(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }
}

// Export singleton instance
export const gmpTrackerService = new GMPTrackerService();

// Auto-start if not in test environment
if (
  process.env.NODE_ENV !== "test" &&
  process.env.AUTO_START_GMP_TRACKER !== "false"
) {
  gmpTrackerService.start().catch((error) => {
    console.error("Failed to auto-start GMP Tracker Service:", error);
    process.exit(1);
  });
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(
    `🛑 Received ${signal}, shutting down GMP Tracker Service gracefully...`
  );
  try {
    await gmpTrackerService.stop();
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
  setAlertThreshold: setGMPAlertThreshold,
  addIPOTracking: addGMPTracking,
  removeIPOTracking: removeGMPTracking,
  forceTrackIPO: forceGMPTrack,
} = gmpTrackerService;

export default gmpTrackerService;
