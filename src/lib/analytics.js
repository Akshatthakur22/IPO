import { prisma } from "./db.js";
import { cache } from "./cache.js";

class AnalyticsService {
  constructor() {
    // Performance metrics
    this.metrics = {
      computationsPerformed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageComputationTime: 0,
      errors: 0,
    };

    // Analytics cache with TTL
    this.analyticsCache = new Map();
    this.cacheTTL = {
      BASIC: 5 * 60 * 1000, // 5 minutes
      DETAILED: 10 * 60 * 1000, // 10 minutes
      HISTORICAL: 30 * 60 * 1000, // 30 minutes
      PREDICTIONS: 15 * 60 * 1000, // 15 minutes
    };

    // Risk assessment weights
    this.riskWeights = {
      GMP_VOLATILITY: 0.3,
      SUBSCRIPTION_RATIO: 0.25,
      ISSUE_SIZE: 0.2,
      MARKET_CONDITIONS: 0.15,
      SECTOR_PERFORMANCE: 0.1,
    };

    // Prediction models configuration
    this.predictionModels = {
      LISTING_GAIN: {
        factors: [
          "avgGMP",
          "subscriptionRatio",
          "issueSize",
          "marketSentiment",
        ],
        weights: [0.4, 0.3, 0.2, 0.1],
      },
      ALLOTMENT_PROBABILITY: {
        factors: ["subscriptionRatio", "applicationAmount", "category"],
        weights: [0.6, 0.3, 0.1],
      },
    };
  }

  // Comprehensive IPO analytics computation
  async computeIPOAnalytics(ipoId, options = {}) {
    const startTime = Date.now();

    try {
      const {
        includeHistorical = true,
        includePredictions = true,
        timeRange = 30, // days
        refreshCache = false,
      } = options;

      // Check cache first
      const cacheKey = `analytics:${ipoId}:${timeRange}:${includeHistorical}:${includePredictions}`;

      if (!refreshCache) {
        const cached = await this.getCachedAnalytics(cacheKey);
        if (cached) {
          this.metrics.cacheHits++;
          return cached;
        }
      }

      this.metrics.cacheMisses++;

      // Fetch comprehensive data
      const [ipoData, gmpData, subscriptionData, demandData, categoryData] =
        await Promise.all([
          this.getIPOBasicData(ipoId),
          this.getGMPData(ipoId, timeRange),
          this.getSubscriptionData(ipoId, timeRange),
          this.getDemandData(ipoId, timeRange),
          this.getIPOCategories(ipoId),
        ]);

      if (!ipoData) {
        throw new Error(`IPO with ID ${ipoId} not found`);
      }

      // Compute analytics
      const analytics = {
        ipoId,
        symbol: ipoData.symbol,
        name: ipoData.name,
        status: ipoData.status,
        computedAt: new Date().toISOString(),

        // Basic metrics
        basicMetrics: this.computeBasicMetrics(ipoData),

        // GMP analytics
        gmpAnalytics: this.computeGMPAnalytics(gmpData),

        // Subscription analytics
        subscriptionAnalytics: this.computeSubscriptionAnalytics(
          subscriptionData,
          categoryData
        ),

        // Market demand analytics
        demandAnalytics: this.computeDemandAnalytics(demandData),

        // Risk assessment
        riskAssessment: this.computeRiskAssessment(
          ipoData,
          gmpData,
          subscriptionData
        ),

        // Performance indicators
        performanceIndicators: this.computePerformanceIndicators(
          ipoData,
          gmpData,
          subscriptionData
        ),
      };

      // Add historical analysis
      if (includeHistorical) {
        analytics.historicalAnalysis = await this.computeHistoricalAnalysis(
          ipoId,
          timeRange
        );
      }

      // Add predictions
      if (includePredictions) {
        analytics.predictions = await this.computePredictions(analytics);
      }

      // Add comparative analysis
      analytics.comparativeAnalysis =
        await this.computeComparativeAnalysis(ipoData);

      // Add insights and recommendations
      analytics.insights = this.generateInsights(analytics);
      analytics.recommendations = this.generateRecommendations(analytics);

      // Cache the results
      await this.setCachedAnalytics(
        cacheKey,
        analytics,
        this.cacheTTL.DETAILED
      );

      // Update metrics
      const computationTime = Date.now() - startTime;
      this.updateMetrics(computationTime);

      return analytics;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Analytics computation failed for IPO ${ipoId}:`, error);
      throw error;
    }
  }

  // Basic IPO metrics computation
  computeBasicMetrics(ipoData) {
    const priceRange = ipoData.maxPrice - ipoData.minPrice;
    const issueSize = Number(ipoData.issueSize || 0);
    const lotValue = ipoData.lotSize * (ipoData.maxPrice || 0);

    return {
      priceRange: {
        min: ipoData.minPrice,
        max: ipoData.maxPrice,
        spread: priceRange,
        spreadPercentage:
          ipoData.minPrice > 0
            ? parseFloat(((priceRange / ipoData.minPrice) * 100).toFixed(2))
            : 0,
      },
      issue: {
        size: issueSize,
        sizeCategory: this.categorizeIssueSize(issueSize),
        lotSize: ipoData.lotSize,
        lotValue,
        faceValue: ipoData.faceValue,
      },
      timeline: {
        openDate: ipoData.openDate,
        closeDate: ipoData.closeDate,
        listingDate: ipoData.listingDate,
        durationDays: this.calculateDuration(
          ipoData.openDate,
          ipoData.closeDate
        ),
        daysToListing: ipoData.listingDate
          ? this.calculateDuration(ipoData.closeDate, ipoData.listingDate)
          : null,
      },
      type: {
        issueType: ipoData.issueType,
        subType: ipoData.subType,
        registrar: ipoData.registrar,
      },
    };
  }

  // GMP analytics computation
  computeGMPAnalytics(gmpData) {
    if (!gmpData || gmpData.length === 0) {
      return {
        status: "no_data",
        message: "No GMP data available",
      };
    }

    const values = gmpData.map((g) => g.value);
    const percentages = gmpData.map((g) => g.percentage);
    const volumes = gmpData.map((g) => g.volume || 0);

    // Statistical measures
    const stats = {
      current: values[0] || 0,
      average: this.calculateAverage(values),
      median: this.calculateMedian(values),
      mode: this.calculateMode(values),
      min: Math.min(...values),
      max: Math.max(...values),
      range: Math.max(...values) - Math.min(...values),
      standardDeviation: this.calculateStandardDeviation(values),
      variance: this.calculateVariance(values),
      coefficient: this.calculateCoefficientOfVariation(values),
    };

    // Trend analysis
    const trend = this.analyzeTrend(values);

    // Volatility analysis
    const volatility = this.analyzeVolatility(
      values,
      gmpData.map((g) => g.timestamp)
    );

    // Volume analysis
    const volumeAnalysis = this.analyzeVolume(volumes, values);

    // Price momentum
    const momentum = this.calculateMomentum(values);

    return {
      status: "available",
      recordCount: gmpData.length,
      timespan: this.calculateTimespan(gmpData),
      statistics: stats,
      trend,
      volatility,
      volumeAnalysis,
      momentum,
      priceTargets: this.calculatePriceTargets(stats),
      riskMetrics: this.calculateGMPRiskMetrics(values),
    };
  }

  // Subscription analytics computation
  computeSubscriptionAnalytics(subscriptionData, categoryData) {
    if (!subscriptionData || subscriptionData.length === 0) {
      return {
        status: "no_data",
        message: "No subscription data available",
      };
    }

    // Get latest subscription by category
    const latestByCategory =
      this.getLatestSubscriptionByCategory(subscriptionData);

    // Overall subscription metrics
    const overallMetrics = {
      totalSubscription: this.calculateOverallSubscription(latestByCategory),
      isOversubscribed: false,
      oversubscriptionRatio: 0,
      totalApplications: 0,
      totalQuantity: BigInt(0),
    };

    overallMetrics.isOversubscribed = overallMetrics.totalSubscription > 1;
    overallMetrics.oversubscriptionRatio = Math.max(
      0,
      overallMetrics.totalSubscription - 1
    );

    // Category-wise analysis
    const categoryAnalysis = {};
    for (const [category, data] of Object.entries(latestByCategory)) {
      categoryAnalysis[category] = {
        subscriptionRatio: data.subscriptionRatio,
        quantity: data.quantity.toString(),
        bidCount: data.bidCount,
        averageBidSize:
          data.bidCount > 0 ? Number(data.quantity) / data.bidCount : 0,
        timestamp: data.timestamp,
      };

      overallMetrics.totalApplications += data.bidCount;
      overallMetrics.totalQuantity += data.quantity;
    }

    // Subscription pattern analysis
    const patterns = this.analyzeSubscriptionPatterns(subscriptionData);

    // Allotment probability calculation
    const allotmentProbability =
      this.calculateAllotmentProbabilities(latestByCategory);

    return {
      status: "available",
      recordCount: subscriptionData.length,
      overall: overallMetrics,
      categories: categoryAnalysis,
      patterns,
      allotmentProbability,
      insights: this.generateSubscriptionInsights(
        overallMetrics,
        categoryAnalysis
      ),
    };
  }

  // Market demand analytics computation
  computeDemandAnalytics(demandData) {
    if (!demandData || demandData.length === 0) {
      return {
        status: "no_data",
        message: "No demand data available",
      };
    }

    // Price-wise demand analysis
    const priceWiseDemand = this.analyzePriceWiseDemand(demandData);

    // Cut-off analysis
    const cutOffAnalysis = this.analyzeCutOffDemand(demandData);

    // Demand distribution
    const distribution = this.analyzeDemandDistribution(demandData);

    // Bid concentration
    const concentration = this.analyzeBidConcentration(demandData);

    return {
      status: "available",
      recordCount: demandData.length,
      priceWiseDemand,
      cutOffAnalysis,
      distribution,
      concentration,
      summary: {
        totalQuantity: demandData.reduce(
          (sum, d) => sum + Number(d.absoluteQuantity),
          0
        ),
        totalBids: demandData.reduce((sum, d) => sum + d.absoluteBidCount, 0),
        priceRange: {
          min: Math.min(
            ...demandData.map((d) => d.price).filter((p) => p !== null)
          ),
          max: Math.max(
            ...demandData.map((d) => d.price).filter((p) => p !== null)
          ),
        },
      },
    };
  }

  // Risk assessment computation
  computeRiskAssessment(ipoData, gmpData, subscriptionData) {
    let riskScore = 50; // Base risk score
    const riskFactors = [];

    // GMP volatility risk
    if (gmpData && gmpData.length > 1) {
      const gmpValues = gmpData.map((g) => g.value);
      const volatility = this.calculateStandardDeviation(gmpValues);
      const avgGMP = this.calculateAverage(gmpValues);
      const volatilityRatio = avgGMP > 0 ? volatility / avgGMP : 0;

      if (volatilityRatio > 0.3) {
        riskScore += 20;
        riskFactors.push({
          type: "HIGH_GMP_VOLATILITY",
          impact: "high",
          description: `High GMP volatility (${(volatilityRatio * 100).toFixed(1)}%)`,
          mitigation: "Consider waiting for price stabilization",
        });
      } else if (volatilityRatio > 0.15) {
        riskScore += 10;
        riskFactors.push({
          type: "MODERATE_GMP_VOLATILITY",
          impact: "medium",
          description: `Moderate GMP volatility (${(volatilityRatio * 100).toFixed(1)}%)`,
          mitigation: "Monitor GMP trends closely",
        });
      }
    }

    // Subscription risk
    if (subscriptionData && subscriptionData.length > 0) {
      const latestSubscription =
        this.getLatestSubscriptionByCategory(subscriptionData);
      const overallSubscription =
        this.calculateOverallSubscription(latestSubscription);

      if (overallSubscription < 0.5) {
        riskScore += 25;
        riskFactors.push({
          type: "LOW_SUBSCRIPTION",
          impact: "high",
          description: `Low subscription ratio (${overallSubscription.toFixed(2)}x)`,
          mitigation: "Reconsider investment due to weak demand",
        });
      } else if (overallSubscription > 10) {
        riskScore += 15;
        riskFactors.push({
          type: "OVER_SUBSCRIPTION",
          impact: "medium",
          description: `Very high subscription (${overallSubscription.toFixed(2)}x)`,
          mitigation: "Low allotment probability, consider alternatives",
        });
      }
    }

    // Issue size risk
    const issueSize = Number(ipoData.issueSize || 0);
    if (issueSize > 5000 * 10000000) {
      // 5000 Cr
      riskScore += 10;
      riskFactors.push({
        type: "LARGE_ISSUE_SIZE",
        impact: "medium",
        description: "Large issue size may impact liquidity",
        mitigation: "Ensure adequate market support post-listing",
      });
    }

    // Price band risk
    const priceRange = ipoData.maxPrice - ipoData.minPrice;
    const spreadPercentage =
      ipoData.minPrice > 0 ? (priceRange / ipoData.minPrice) * 100 : 0;

    if (spreadPercentage > 20) {
      riskScore += 5;
      riskFactors.push({
        type: "WIDE_PRICE_BAND",
        impact: "low",
        description: `Wide price band (${spreadPercentage.toFixed(1)}%)`,
        mitigation: "Price discovery may be challenging",
      });
    }

    // Normalize risk score
    riskScore = Math.max(0, Math.min(100, riskScore));

    return {
      overallRiskScore: riskScore,
      riskLevel: this.categorizeRiskLevel(riskScore),
      riskFactors,
      recommendation: this.generateRiskRecommendation(riskScore, riskFactors),
      lastUpdated: new Date().toISOString(),
    };
  }

  // Performance indicators computation
  computePerformanceIndicators(ipoData, gmpData, subscriptionData) {
    const indicators = {};

    // Market sentiment indicator
    indicators.marketSentiment = this.calculateMarketSentiment(
      gmpData,
      subscriptionData
    );

    // Demand strength indicator
    indicators.demandStrength = this.calculateDemandStrength(subscriptionData);

    // Price momentum indicator
    if (gmpData && gmpData.length > 0) {
      indicators.priceMomentum = this.calculateMomentum(
        gmpData.map((g) => g.value)
      );
    }

    // Listing readiness indicator
    indicators.listingReadiness = this.calculateListingReadiness(
      ipoData,
      subscriptionData
    );

    // Investment attractiveness score
    indicators.attractivenessScore =
      this.calculateAttractivenessScore(indicators);

    return indicators;
  }

  // Historical analysis computation
  async computeHistoricalAnalysis(ipoId, timeRange) {
    try {
      // Get comparable IPOs for benchmarking
      const comparableIPOs = await this.getComparableIPOs(ipoId, timeRange);

      // Historical performance metrics
      const historicalMetrics = await this.calculateHistoricalMetrics(
        ipoId,
        timeRange
      );

      // Trend analysis over time
      const trends = await this.calculateHistoricalTrends(ipoId, timeRange);

      return {
        timeRange,
        comparableIPOs: comparableIPOs.length,
        metrics: historicalMetrics,
        trends,
        benchmarks: await this.calculateBenchmarks(comparableIPOs),
      };
    } catch (error) {
      console.error("Historical analysis failed:", error);
      return {
        status: "error",
        message: "Historical analysis unavailable",
      };
    }
  }

  // Predictions computation
  async computePredictions(analytics) {
    const predictions = {};

    try {
      // Listing gain prediction
      predictions.listingGain = this.predictListingGain(analytics);

      // Allotment probability prediction
      predictions.allotmentProbability =
        this.predictAllotmentProbability(analytics);

      // Price target prediction
      predictions.priceTargets = this.predictPriceTargets(analytics);

      // Risk-adjusted returns
      predictions.riskAdjustedReturns = this.calculateRiskAdjustedReturns(
        predictions.listingGain,
        analytics.riskAssessment.overallRiskScore
      );

      // Confidence intervals
      predictions.confidenceIntervals =
        this.calculateConfidenceIntervals(predictions);

      predictions.lastUpdated = new Date().toISOString();
      predictions.model = "IPO_ANALYTICS_V1.0";
    } catch (error) {
      console.error("Predictions computation failed:", error);
      predictions.status = "error";
      predictions.message = "Predictions unavailable";
    }

    return predictions;
  }

  // Comparative analysis
  async computeComparativeAnalysis(ipoData) {
    try {
      // Find similar IPOs by sector, size, and time period
      const similarIPOs = await this.findSimilarIPOs(ipoData);

      // Calculate relative performance
      const relativePerformance = await this.calculateRelativePerformance(
        ipoData,
        similarIPOs
      );

      // Market positioning
      const marketPositioning = this.calculateMarketPositioning(
        ipoData,
        similarIPOs
      );

      return {
        similarIPOsCount: similarIPOs.length,
        relativePerformance,
        marketPositioning,
        benchmarks: await this.calculateIndustryBenchmarks(ipoData.issueType),
      };
    } catch (error) {
      console.error("Comparative analysis failed:", error);
      return {
        status: "error",
        message: "Comparative analysis unavailable",
      };
    }
  }

  // Insights generation
  generateInsights(analytics) {
    const insights = [];

    // GMP insights
    if (analytics.gmpAnalytics.status === "available") {
      const gmp = analytics.gmpAnalytics;

      if (gmp.statistics.current > gmp.statistics.average * 1.2) {
        insights.push({
          type: "positive",
          category: "GMP",
          title: "Strong GMP Performance",
          description: `Current GMP (₹${gmp.statistics.current}) is ${((gmp.statistics.current / gmp.statistics.average - 1) * 100).toFixed(1)}% above average`,
          impact: "Indicates strong market demand",
        });
      }

      if (gmp.volatility.level === "high") {
        insights.push({
          type: "warning",
          category: "GMP",
          title: "High Price Volatility",
          description: `GMP showing high volatility (${gmp.volatility.coefficient}%)`,
          impact: "Increased uncertainty in price expectations",
        });
      }
    }

    // Subscription insights
    if (analytics.subscriptionAnalytics.status === "available") {
      const sub = analytics.subscriptionAnalytics;

      if (sub.overall.totalSubscription > 5) {
        insights.push({
          type: "positive",
          category: "Subscription",
          title: "Strong Oversubscription",
          description: `IPO oversubscribed by ${sub.overall.totalSubscription.toFixed(2)}x`,
          impact: "High investor interest but lower allotment probability",
        });
      }

      if (sub.overall.totalSubscription < 1) {
        insights.push({
          type: "negative",
          category: "Subscription",
          title: "Undersubscribed IPO",
          description: `IPO subscribed only ${(sub.overall.totalSubscription * 100).toFixed(1)}%`,
          impact: "Weak investor demand, potential listing concerns",
        });
      }
    }

    // Risk insights
    const risk = analytics.riskAssessment;
    if (risk.riskLevel === "high") {
      insights.push({
        type: "warning",
        category: "Risk",
        title: "High Risk Investment",
        description: `Risk score of ${risk.overallRiskScore} indicates elevated risk`,
        impact: "Careful consideration required before investment",
      });
    }

    return insights;
  }

  // Recommendations generation
  generateRecommendations(analytics) {
    const recommendations = [];
    const risk = analytics.riskAssessment.overallRiskScore;
    const subscription =
      analytics.subscriptionAnalytics.overall?.totalSubscription || 0;
    const gmp = analytics.gmpAnalytics.statistics?.current || 0;

    // Investment recommendation
    if (risk < 30 && subscription > 2 && gmp > 0) {
      recommendations.push({
        type: "BUY",
        confidence: "high",
        reasoning: "Low risk, strong demand, positive GMP",
        action: "Consider applying for maximum allocation",
      });
    } else if (risk < 50 && subscription > 1) {
      recommendations.push({
        type: "HOLD",
        confidence: "medium",
        reasoning: "Moderate risk with adequate demand",
        action: "Apply with caution, consider smaller allocation",
      });
    } else if (risk > 70 || subscription < 0.5) {
      recommendations.push({
        type: "AVOID",
        confidence: "high",
        reasoning: "High risk or weak demand indicators",
        action: "Consider alternative investment opportunities",
      });
    }

    // Timing recommendations
    if (analytics.performanceIndicators?.listingReadiness > 0.8) {
      recommendations.push({
        type: "TIMING",
        confidence: "medium",
        reasoning: "IPO appears ready for successful listing",
        action: "Good timing for application",
      });
    }

    // Allocation recommendations
    if (subscription > 10) {
      recommendations.push({
        type: "ALLOCATION",
        confidence: "high",
        reasoning: "Very high oversubscription",
        action: "Apply for maximum retail quota to improve allotment chances",
      });
    }

    return recommendations;
  }

  // Utility methods for calculations
  calculateAverage(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  calculateMedian(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  calculateMode(values) {
    if (!values || values.length === 0) return 0;
    const frequency = {};
    values.forEach((val) => (frequency[val] = (frequency[val] || 0) + 1));
    return Object.keys(frequency).reduce((a, b) =>
      frequency[a] > frequency[b] ? a : b
    );
  }

  calculateStandardDeviation(values) {
    if (!values || values.length < 2) return 0;
    const avg = this.calculateAverage(values);
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }

  calculateVariance(values) {
    if (!values || values.length < 2) return 0;
    const avg = this.calculateAverage(values);
    return (
      values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      values.length
    );
  }

  calculateCoefficientOfVariation(values) {
    const avg = this.calculateAverage(values);
    const stdDev = this.calculateStandardDeviation(values);
    return avg > 0 ? (stdDev / avg) * 100 : 0;
  }

  analyzeTrend(values) {
    if (!values || values.length < 2)
      return { direction: "stable", strength: 0 };

    const recent = values.slice(0, Math.min(5, Math.floor(values.length / 2)));
    const older = values.slice(-Math.min(5, Math.floor(values.length / 2)));

    const recentAvg = this.calculateAverage(recent);
    const olderAvg = this.calculateAverage(older);

    const change = recentAvg - olderAvg;
    const changePercent = olderAvg > 0 ? (change / olderAvg) * 100 : 0;

    let direction = "stable";
    let strength = Math.abs(changePercent);

    if (changePercent > 5) direction = "bullish";
    else if (changePercent < -5) direction = "bearish";

    return { direction, strength, change, changePercent };
  }

  analyzeVolatility(values, timestamps) {
    if (!values || values.length < 2)
      return { level: "unknown", coefficient: 0 };

    const coefficient = this.calculateCoefficientOfVariation(values);
    let level = "low";

    if (coefficient > 30) level = "high";
    else if (coefficient > 15) level = "medium";

    return {
      level,
      coefficient,
      standardDeviation: this.calculateStandardDeviation(values),
    };
  }

  calculateMomentum(values) {
    if (!values || values.length < 3) return { score: 0, direction: "neutral" };

    const recent = values.slice(0, 3);
    const momentum = recent[0] - recent[2];
    const momentumPercent = recent[2] > 0 ? (momentum / recent[2]) * 100 : 0;

    let direction = "neutral";
    if (momentumPercent > 2) direction = "positive";
    else if (momentumPercent < -2) direction = "negative";

    return { score: momentumPercent, direction, absolute: momentum };
  }

  // Data fetching methods
  async getIPOBasicData(ipoId) {
    return await prisma.iPO.findUnique({
      where: { id: ipoId },
      include: { categories: true },
    });
  }

  async getGMPData(ipoId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await prisma.gMP.findMany({
      where: {
        ipoId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "desc" },
    });
  }

  async getSubscriptionData(ipoId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await prisma.subscriptionData.findMany({
      where: {
        ipoId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "desc" },
    });
  }

  async getDemandData(ipoId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await prisma.marketDemand.findMany({
      where: {
        ipoId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "desc" },
    });
  }

  async getIPOCategories(ipoId) {
    return await prisma.iPOCategory.findMany({
      where: { ipoId },
    });
  }

  // Cache management
  async getCachedAnalytics(key) {
    // Check in-memory cache first
    if (this.analyticsCache.has(key)) {
      const cached = this.analyticsCache.get(key);
      if (Date.now() - cached.timestamp < this.cacheTTL.DETAILED) {
        return cached.data;
      }
      this.analyticsCache.delete(key);
    }

    // Check Redis cache
    return await cache.get(key);
  }

  async setCachedAnalytics(key, data, ttl) {
    // Set in-memory cache
    this.analyticsCache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Set in Redis
    return await cache.set(key, data, ttl / 1000);
  }

  // Helper methods
  categorizeIssueSize(size) {
    if (size < 500 * 10000000) return "small"; // < 500 Cr
    if (size < 2000 * 10000000) return "medium"; // < 2000 Cr
    return "large"; // >= 2000 Cr
  }

  calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  categorizeRiskLevel(score) {
    if (score < 30) return "low";
    if (score < 60) return "medium";
    return "high";
  }

  getLatestSubscriptionByCategory(subscriptionData) {
    const latest = {};

    subscriptionData.forEach((item) => {
      const key = item.category + (item.subCategory || "");
      if (!latest[key] || item.timestamp > latest[key].timestamp) {
        latest[key] = item;
      }
    });

    return latest;
  }

  calculateOverallSubscription(latestByCategory) {
    const ratios = Object.values(latestByCategory).map(
      (item) => item.subscriptionRatio || 0
    );
    return ratios.length > 0 ? Math.max(...ratios) : 0;
  }

  // Performance tracking
  updateMetrics(computationTime) {
    this.metrics.computationsPerformed++;
    this.metrics.averageComputationTime =
      (this.metrics.averageComputationTime *
        (this.metrics.computationsPerformed - 1) +
        computationTime) /
      this.metrics.computationsPerformed;
  }

  getPerformanceMetrics() {
    const hitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (
            (this.metrics.cacheHits /
              (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          ).toFixed(2)
        : "0.00";

    return {
      ...this.metrics,
      cacheHitRate: `${hitRate}%`,
      averageComputationTime: Math.round(this.metrics.averageComputationTime),
      successRate:
        this.metrics.computationsPerformed > 0
          ? (
              ((this.metrics.computationsPerformed - this.metrics.errors) /
                this.metrics.computationsPerformed) *
              100
            ).toFixed(2)
          : "100.00",
    };
  }

  // Placeholder methods for advanced features (to be implemented)
  async getComparableIPOs(ipoId, timeRange) {
    return [];
  }
  async calculateHistoricalMetrics(ipoId, timeRange) {
    return {};
  }
  async calculateHistoricalTrends(ipoId, timeRange) {
    return {};
  }
  async calculateBenchmarks(comparableIPOs) {
    return {};
  }
  async findSimilarIPOs(ipoData) {
    return [];
  }
  async calculateRelativePerformance(ipoData, similarIPOs) {
    return {};
  }
  calculateMarketPositioning(ipoData, similarIPOs) {
    return {};
  }
  async calculateIndustryBenchmarks(issueType) {
    return {};
  }

  predictListingGain(analytics) {
    const gmp = analytics.gmpAnalytics.statistics?.current || 0;
    const risk = analytics.riskAssessment.overallRiskScore || 50;
    const subscription =
      analytics.subscriptionAnalytics.overall?.totalSubscription || 1;

    // Simple prediction model (enhance with ML)
    let prediction = gmp * 0.8; // Conservative estimate

    // Adjust for risk
    prediction *= 1 - risk / 200; // Reduce by half the risk percentage

    // Adjust for subscription
    if (subscription > 5)
      prediction *= 0.9; // High subscription may limit gains
    else if (subscription < 1) prediction *= 0.7; // Low subscription is bearish

    return {
      value: Math.round(prediction),
      confidence: 0.6, // 60% confidence
      range: {
        min: Math.round(prediction * 0.7),
        max: Math.round(prediction * 1.3),
      },
    };
  }

  predictAllotmentProbability(analytics) {
    const subscription =
      analytics.subscriptionAnalytics.overall?.totalSubscription || 1;

    let probability = 100;
    if (subscription > 1) {
      probability = Math.min(95, 100 / subscription);
    }

    return {
      retail: Math.round(probability),
      confidence: 0.8,
    };
  }

  predictPriceTargets(analytics) {
    const gmp = analytics.gmpAnalytics.statistics?.current || 0;
    const basePrice = analytics.basicMetrics?.priceRange?.max || 0;

    return {
      conservative: basePrice + gmp * 0.5,
      moderate: basePrice + gmp * 0.8,
      aggressive: basePrice + gmp * 1.2,
    };
  }

  calculateRiskAdjustedReturns(listingGain, riskScore) {
    const gain = listingGain.value || 0;
    const risk = riskScore || 50;

    return {
      riskAdjustedReturn: gain * (1 - risk / 100),
      sharpeRatio: risk > 0 ? gain / risk : 0,
    };
  }

  calculateConfidenceIntervals(predictions) {
    return {
      listingGain: {
        confidence90: {
          min: predictions.listingGain?.range?.min || 0,
          max: predictions.listingGain?.range?.max || 0,
        },
      },
    };
  }

  // Additional helper methods
  analyzeVolume(volumes, values) {
    return { correlation: 0, trend: "stable" };
  }
  calculatePriceTargets(stats) {
    return {
      support: stats.min,
      resistance: stats.max,
      pivot: stats.average,
    };
  }
  calculateGMPRiskMetrics(values) {
    return {
      valueAtRisk: this.calculateStandardDeviation(values) * 1.645, // 95% VaR
      maxDrawdown: this.calculateMaxDrawdown(values),
    };
  }

  calculateMaxDrawdown(values) {
    let maxDrawdown = 0;
    let peak = values[0];

    for (let i = 1; i < values.length; i++) {
      if (values[i] > peak) {
        peak = values[i];
      } else {
        const drawdown = (peak - values[i]) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown * 100; // Return as percentage
  }

  analyzeSubscriptionPatterns(subscriptionData) {
    return { trend: "increasing" };
  }
  calculateAllotmentProbabilities(latestByCategory) {
    const result = {};
    for (const [category, data] of Object.entries(latestByCategory)) {
      const ratio = data.subscriptionRatio || 1;
      result[category] = ratio > 1 ? Math.min(95, 100 / ratio) : 95;
    }
    return result;
  }

  generateSubscriptionInsights(overall, categories) {
    return [];
  }
  analyzePriceWiseDemand(demandData) {
    return { distribution: "normal" };
  }
  analyzeCutOffDemand(demandData) {
    return { percentage: 0 };
  }
  analyzeDemandDistribution(demandData) {
    return { concentration: "distributed" };
  }
  analyzeBidConcentration(demandData) {
    return { herfindahlIndex: 0 };
  }
  calculateMarketSentiment(gmpData, subscriptionData) {
    return 0.5;
  }
  calculateDemandStrength(subscriptionData) {
    return 0.5;
  }
  calculateListingReadiness(ipoData, subscriptionData) {
    return 0.8;
  }
  calculateAttractivenessScore(indicators) {
    return 0.7;
  }
  calculateTimespan(data) {
    if (!data || data.length < 2) return 0;
    const first = new Date(data[data.length - 1].timestamp);
    const last = new Date(data[0].timestamp);
    return Math.ceil((last - first) / (1000 * 60 * 60 * 24));
  }
  generateRiskRecommendation(score, factors) {
    if (score < 30)
      return "Low risk investment, suitable for conservative investors";
    if (score < 60) return "Moderate risk, suitable for balanced portfolios";
    return "High risk investment, suitable only for aggressive investors";
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Cleanup old cache entries periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of analyticsService.analyticsCache.entries()) {
      if (now - value.timestamp > analyticsService.cacheTTL.DETAILED) {
        analyticsService.analyticsCache.delete(key);
      }
    }
  },
  10 * 60 * 1000
); // Every 10 minutes

export default analyticsService;
