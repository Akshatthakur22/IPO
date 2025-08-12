import {
  nseAPI,
  transformIPOData,
  transformSubscriptionData,
  transformDemandData,
} from "../lib/nse-api.js";
import { cache } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { webSocketService } from "../lib/websocket.js";
import { analyticsService } from "../lib/analytics.js";

class DataSyncService {
  constructor() {
    this.isRunning = false;
    this.lastSync = new Map();
    this.syncIntervals = {
      IPO_MASTER: 5 * 60 * 1000, // 5 minutes
      LIVE_DATA: 60 * 1000, // 1 minute
      GMP_DATA: 30 * 1000, // 30 seconds for live IPOs
      SUBSCRIPTION: 30 * 1000, // 30 seconds for live IPOs
      DEMAND: 30 * 1000, // 30 seconds for live IPOs
      ALLOTMENT: 10 * 60 * 1000, // 10 minutes
      ANALYTICS: 15 * 60 * 1000, // 15 minutes
      SYSTEM_STATUS: 60 * 1000, // 1 minute
    };

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      exponentialBackoff: true,
    };

    // Performance tracking
    this.performance = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageResponseTime: 0,
      lastSyncTime: null,
      dataPointsProcessed: 0,
      errorRate: 0,
    };

    // Sync status tracking
    this.syncStatus = {
      ipoMaster: "idle",
      liveData: "idle",
      gmpData: "idle",
      analytics: "idle",
      lastHealthCheck: null,
    };

    // Active intervals for cleanup
    this.activeIntervals = new Map();

    // Queue for failed operations
    this.failedOperationsQueue = [];
    this.maxQueueSize = 1000;

    // Data consistency tracking
    this.dataIntegrity = {
      lastConsistencyCheck: null,
      inconsistentRecords: [],
      autoRepairEnabled: true,
    };

    console.log("🔄 Data Sync Service initialized");
  }

  // Enhanced start method with health checks
  async start() {
    if (this.isRunning) {
      console.log("⚠️  Data sync service is already running");
      return;
    }

    try {
      console.log("🚀 Starting Enhanced Data Sync Service...");

      // Comprehensive system health check
      const healthCheck = await this.performSystemHealthCheck();
      if (!healthCheck.allHealthy) {
        console.warn("⚠️  System health issues detected:", healthCheck);
        if (healthCheck.critical) {
          throw new Error(
            `Critical system health failure: ${JSON.stringify(healthCheck)}`
          );
        }
      }

      this.isRunning = true;

      // Initialize sync processes with staggered startup
      await this.initializeSyncProcesses();

      // Perform initial data sync
      await this.performInitialSync();

      // Start monitoring and maintenance tasks
      this.startMonitoringTasks();

      console.log("✅ Enhanced Data Sync Service started successfully");
      console.log(`📊 Sync intervals configured:`, this.syncIntervals);
    } catch (error) {
      console.error("❌ Failed to start Data Sync Service:", error);
      this.isRunning = false;
      throw error;
    }
  }

  // Comprehensive system health check
  async performSystemHealthCheck() {
    console.log("🏥 Performing system health check...");

    const checks = await Promise.allSettled([
      nseAPI.healthCheck(),
      cache.healthCheck(),
      prisma.$queryRaw`SELECT 1 as health`,
      webSocketService.getHealthCheck(),
    ]);

    const results = {
      nseAPI:
        checks[0].status === "fulfilled" &&
        checks[0].value.status === "healthy",
      cache:
        checks[1].status === "fulfilled" &&
        checks[1].value.status === "healthy",
      database: checks[2].status === "fulfilled",
      websocket:
        checks[3].status === "fulfilled" &&
        checks[3].value.status === "healthy",
      allHealthy: true,
      critical: false,
    };

    results.allHealthy = Object.values(results).slice(0, -2).every(Boolean);
    results.critical = !results.database || !results.nseAPI;

    this.syncStatus.lastHealthCheck = {
      timestamp: new Date().toISOString(),
      results,
    };

    console.log("🏥 System Health Check:", results);
    return results;
  }

  // Initialize all sync processes with staggered startup
  async initializeSyncProcesses() {
    console.log("⚙️  Initializing sync processes...");

    // Stagger the startup to avoid overwhelming the system
    const processes = [
      { name: "IPO_MASTER", delay: 0 },
      { name: "LIVE_DATA", delay: 5000 }, // 5 seconds delay
      { name: "GMP_DATA", delay: 10000 }, // 10 seconds delay
      { name: "ANALYTICS", delay: 15000 }, // 15 seconds delay
    ];

    for (const process of processes) {
      setTimeout(() => this.startSyncProcess(process.name), process.delay);
    }

    console.log("🔄 All sync processes initialized with staggered startup");
  }

  // Start individual sync process
  async startSyncProcess(processName) {
    try {
      const interval = this.syncIntervals[processName];
      if (!interval) {
        console.error(`Unknown sync process: ${processName}`);
        return;
      }

      const syncFunction = this.getSyncFunction(processName);
      if (!syncFunction) {
        console.error(`No sync function found for: ${processName}`);
        return;
      }

      // Immediate first run
      await this.safeExecute(processName, syncFunction);

      // Schedule recurring sync
      const intervalId = setInterval(async () => {
        await this.safeExecute(processName, syncFunction);
      }, interval);

      this.activeIntervals.set(processName, intervalId);

      console.log(
        `✅ ${processName} sync process started (interval: ${interval}ms)`
      );
    } catch (error) {
      console.error(`Failed to start ${processName} sync process:`, error);
    }
  }

  // Get sync function by name
  getSyncFunction(processName) {
    const syncFunctions = {
      IPO_MASTER: () => this.syncIPOMaster(),
      LIVE_DATA: () => this.syncLiveData(),
      GMP_DATA: () => this.syncGMPData(),
      ANALYTICS: () => this.syncAnalytics(),
    };

    return syncFunctions[processName];
  }

  // Perform initial sync with progress tracking
  async performInitialSync() {
    console.log("🌟 Performing initial comprehensive sync...");

    const initialSyncs = [
      { name: "IPO Master", fn: () => this.syncIPOMaster() },
      { name: "Live Data", fn: () => this.syncLiveData() },
      { name: "GMP Data", fn: () => this.syncGMPData() },
      { name: "Analytics", fn: () => this.syncAnalytics() },
    ];

    const results = [];

    for (const sync of initialSyncs) {
      try {
        console.log(`🔄 Initial sync: ${sync.name}...`);
        const result = await sync.fn();
        results.push({ name: sync.name, status: "success", result });

        // Small delay between syncs to prevent overwhelming
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Initial ${sync.name} sync failed:`, error.message);
        results.push({
          name: sync.name,
          status: "failed",
          error: error.message,
        });
      }
    }

    console.log("✅ Initial sync completed:", results);

    // Broadcast initial sync completion
    await webSocketService.broadcastSystemStatus({
      type: "initial_sync_complete",
      results,
      timestamp: Date.now(),
    });
  }

  // Safe execution wrapper with comprehensive error handling and metrics
  async safeExecute(operationName, operation) {
    const startTime = Date.now();

    this.syncStatus[operationName.toLowerCase().replace("_", "")] = "running";
    this.performance.totalSyncs++;

    try {
      const result = await operation();

      // Update performance metrics
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, true);

      this.syncStatus[operationName.toLowerCase().replace("_", "")] = "success";
      this.lastSync.set(operationName, Date.now());

      // Log successful operation
      await this.logSync(
        operationName.toLowerCase().replace("_", "-"),
        "sync",
        "success",
        result?.processed || result?.updates || 1,
        null,
        responseTime
      );

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, false);

      this.syncStatus[operationName.toLowerCase().replace("_", "")] = "failed";
      this.performance.failedSyncs++;

      console.error(`❌ ${operationName} failed:`, error.message);

      // Add to failed operations queue for retry
      this.queueFailedOperation(operationName, operation, error);

      // Log error
      await this.logSync(
        operationName.toLowerCase().replace("_", "-"),
        "sync",
        "failed",
        0,
        { error: error.message, stack: error.stack },
        responseTime
      );

      // Broadcast error status
      await webSocketService.broadcastSystemStatus(
        {
          type: "sync_error",
          operation: operationName,
          error: error.message,
          timestamp: Date.now(),
        },
        { priority: "high" }
      );

      throw error;
    }
  }

  // Update performance metrics with rolling averages
  updatePerformanceMetrics(responseTime, success) {
    if (success) {
      this.performance.successfulSyncs++;
    }

    // Update rolling average response time
    this.performance.averageResponseTime =
      (this.performance.averageResponseTime *
        (this.performance.totalSyncs - 1) +
        responseTime) /
      this.performance.totalSyncs;

    // Update error rate
    this.performance.errorRate =
      (this.performance.failedSyncs / this.performance.totalSyncs) * 100;

    this.performance.lastSyncTime = Date.now();
  }

  // Enhanced IPO Master Data Sync with data validation
  async syncIPOMaster() {
    const startTime = Date.now();
    console.log("📊 Syncing IPO Master Data...");

    try {
      const nseIPOs = await this.withRetry(
        () => nseAPI.fetchIPOMasterData(),
        "IPO Master Sync"
      );

      if (!nseIPOs || !Array.isArray(nseIPOs)) {
        throw new Error("Invalid IPO master data received");
      }

      let processed = 0;
      let created = 0;
      let updated = 0;
      let errors = {};
      let dataValidationErrors = [];

      for (const nseIPO of nseIPOs) {
        try {
          // Validate data before processing
          const validationErrors = this.validateIPOData(nseIPO);
          if (validationErrors.length > 0) {
            dataValidationErrors.push({
              symbol: nseIPO.symbol,
              errors: validationErrors,
            });
            continue;
          }

          const ipoData = transformIPOData(nseIPO);

          // Check if IPO exists
          const existingIPO = await prisma.iPO.findUnique({
            where: { symbol: ipoData.symbol },
          });

          if (existingIPO) {
            // Check if update is needed
            if (this.hasSignificantChanges(existingIPO, ipoData)) {
              await prisma.iPO.update({
                where: { symbol: ipoData.symbol },
                data: {
                  ...ipoData,
                  updatedAt: new Date(),
                  lastSyncAt: new Date(),
                },
              });
              updated++;

              // Invalidate cache and notify clients
              await cache.invalidateIPOCache(existingIPO.id);
              await webSocketService.broadcastIPOUpdate(
                existingIPO.id,
                ipoData
              );
            }
          } else {
            // Create new IPO
            const newIPO = await prisma.iPO.create({
              data: ipoData,
            });
            created++;

            // Cache new IPO and notify clients
            await cache.cacheIPODetail(newIPO.id, newIPO);
            await webSocketService.broadcastIPOUpdate(newIPO.id, newIPO, {
              priority: "high",
            });
          }

          // Update categories if provided
          if (nseIPO.categoryDetails) {
            await this.updateIPOCategories(
              ipoData.symbol,
              nseIPO.categoryDetails
            );
          }

          processed++;
        } catch (error) {
          errors[nseIPO.symbol] = error.message;
          console.error(`Error processing IPO ${nseIPO.symbol}:`, error);
        }
      }

      // Update cache with fresh data
      await this.refreshIPOListCache();

      const duration = Date.now() - startTime;
      const summary = {
        processed,
        created,
        updated,
        errors: Object.keys(errors).length,
        validationErrors: dataValidationErrors.length,
        duration,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ IPO Master sync completed:`, summary);

      // Store data integrity information
      if (dataValidationErrors.length > 0) {
        this.dataIntegrity.inconsistentRecords.push(...dataValidationErrors);
        console.warn(
          `⚠️  ${dataValidationErrors.length} records failed validation`
        );
      }

      // Broadcast completion status
      await webSocketService.broadcastSystemStatus({
        type: "sync_complete",
        service: "ipo-master",
        summary,
      });

      return summary;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logSync(
        "ipo-master",
        "sync",
        "failed",
        0,
        { error: error.message },
        duration
      );
      console.error("❌ IPO Master sync failed:", error);
      throw error;
    }
  }

  // Validate IPO data before processing
  validateIPOData(ipoData) {
    const errors = [];

    if (!ipoData.symbol || typeof ipoData.symbol !== "string") {
      errors.push("Invalid or missing symbol");
    }

    if (!ipoData.name || typeof ipoData.name !== "string") {
      errors.push("Invalid or missing name");
    }

    if (!ipoData.biddingStartDate || !ipoData.biddingEndDate) {
      errors.push("Missing bidding dates");
    }

    if (ipoData.minPrice !== undefined && ipoData.maxPrice !== undefined) {
      if (ipoData.minPrice > ipoData.maxPrice) {
        errors.push("Min price cannot be greater than max price");
      }
    }

    if (
      ipoData.lotSize &&
      (ipoData.lotSize <= 0 || !Number.isInteger(ipoData.lotSize))
    ) {
      errors.push("Invalid lot size");
    }

    return errors;
  }

  // Check for significant changes that warrant an update
  hasSignificantChanges(existing, updated) {
    const significantFields = [
      "name",
      "minPrice",
      "maxPrice",
      "openDate",
      "closeDate",
      "listingDate",
      "status",
      "lotSize",
      "issueSize",
    ];

    for (const field of significantFields) {
      if (existing[field] !== updated[field]) {
        // Special handling for dates and BigInt
        if (field.includes("Date")) {
          const existingDate = new Date(existing[field]).getTime();
          const updatedDate = new Date(updated[field]).getTime();
          if (existingDate !== updatedDate) return true;
        } else if (field === "issueSize") {
          if (String(existing[field]) !== String(updated[field])) return true;
        } else {
          return true;
        }
      }
    }

    return false;
  }

  // Refresh IPO list cache with different filters
  async refreshIPOListCache() {
    try {
      const activeIPOs = await prisma.iPO.findMany({
        where: {
          isActive: true,
        },
        include: {
          gmp: { take: 1, orderBy: { timestamp: "desc" } },
          subscription: { take: 1, orderBy: { timestamp: "desc" } },
          analytics: true,
        },
      });

      // Cache with different filters
      const filterGroups = [
        {
          filter: { status: "open" },
          data: activeIPOs.filter((ipo) => ipo.status === "open"),
        },
        {
          filter: { status: "upcoming" },
          data: activeIPOs.filter((ipo) => ipo.status === "upcoming"),
        },
        {
          filter: { status: "closed" },
          data: activeIPOs.filter((ipo) => ipo.status === "closed"),
        },
        {
          filter: { status: "listed" },
          data: activeIPOs.filter((ipo) => ipo.status === "listed"),
        },
        { filter: {}, data: activeIPOs }, // All active IPOs
      ];

      const cachePromises = filterGroups.map((group) =>
        cache.cacheIPOList(group.data, group.filter)
      );

      await Promise.all(cachePromises);

      console.log(
        `🔄 Refreshed cache for ${activeIPOs.length} IPOs across ${filterGroups.length} filter groups`
      );
    } catch (error) {
      console.error("Error refreshing IPO list cache:", error);
    }
  }

  // Enhanced Live Data Sync with intelligent batching
  async syncLiveData() {
    console.log("📈 Syncing Live Market Data...");

    const activeIPOs = await prisma.iPO.findMany({
      where: {
        status: "open",
        isActive: true,
      },
      select: { id: true, symbol: true, name: true },
    });

    if (activeIPOs.length === 0) {
      console.log("ℹ️  No active IPOs to sync");
      return { message: "No active IPOs", count: 0 };
    }

    const symbols = activeIPOs.map((ipo) => ipo.symbol);
    const symbolToData = Object.fromEntries(
      activeIPOs.map((ipo) => [ipo.symbol, ipo])
    );

    try {
      // Enhanced batch fetch with intelligent chunking
      const { results, errors } = await nseAPI.batchFetchMarketData(symbols, {
        maxConcurrent: 3, // Increased for better throughput
        priority: 2, // Higher priority for live data
      });

      let subscriptionUpdates = 0;
      let demandUpdates = 0;
      const processedSymbols = [];
      const realTimeUpdates = [];

      for (const [symbol, data] of Object.entries(results)) {
        const ipo = symbolToData[symbol];

        try {
          // Process subscription data
          if (data.categories && data.categories.length > 0) {
            const subscriptionData = transformSubscriptionData(
              data.categories,
              ipo.id
            );

            if (subscriptionData.length > 0) {
              // Use transaction for consistency
              await prisma.$transaction(async (tx) => {
                await tx.subscriptionData.createMany({
                  data: subscriptionData,
                  skipDuplicates: true,
                });
              });

              subscriptionUpdates += subscriptionData.length;
            }

            // Prepare real-time update
            const subscriptionUpdate = {
              symbol,
              categories: data.categories,
              totalSubscription: this.calculateTotalSubscription(
                data.categories
              ),
              lastUpdated: new Date().toISOString(),
            };

            // Cache and prepare for broadcast
            await cache.cacheRealTimeData(
              "SUBSCRIPTION",
              symbol,
              subscriptionUpdate
            );
            realTimeUpdates.push({
              type: "subscription",
              symbol,
              data: subscriptionUpdate,
            });
          }

          // Process demand data
          if (data.demand && data.demand.length > 0) {
            const demandData = transformDemandData(data.demand, ipo.id);

            if (demandData.length > 0) {
              await prisma.$transaction(async (tx) => {
                await tx.marketDemand.createMany({
                  data: demandData,
                  skipDuplicates: true,
                });
              });

              demandUpdates += demandData.length;
            }

            // Prepare real-time update
            const demandUpdate = {
              symbol,
              demand: data.demand,
              totalDemand: this.calculateTotalDemand(data.demand),
              lastUpdated: new Date().toISOString(),
            };

            // Cache and prepare for broadcast
            await cache.cacheRealTimeData("DEMAND", symbol, demandUpdate);
            realTimeUpdates.push({
              type: "demand",
              symbol,
              data: demandUpdate,
            });
          }

          processedSymbols.push(symbol);
          this.performance.dataPointsProcessed +=
            (data.categories?.length || 0) + (data.demand?.length || 0);
        } catch (error) {
          console.error(`Error processing live data for ${symbol}:`, error);
        }
      }

      // Batch broadcast all real-time updates
      await this.broadcastRealtimeUpdates(realTimeUpdates);

      const summary = {
        processedSymbols: processedSymbols.length,
        subscriptionUpdates,
        demandUpdates,
        errors: Object.keys(errors).length,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ Live data sync completed:`, summary);

      return summary;
    } catch (error) {
      console.error("❌ Live data sync failed:", error);
      throw error;
    }
  }

  // Broadcast real-time updates efficiently
  async broadcastRealtimeUpdates(updates) {
    try {
      const groupedUpdates = {
        subscription: updates.filter((u) => u.type === "subscription"),
        demand: updates.filter((u) => u.type === "demand"),
      };

      // Broadcast subscription updates
      for (const update of groupedUpdates.subscription) {
        await webSocketService.broadcastSubscriptionUpdate(
          update.symbol,
          update.data,
          { skipRateLimit: true } // Skip rate limiting for batch updates
        );
      }

      // Broadcast demand updates
      for (const update of groupedUpdates.demand) {
        await webSocketService.broadcastDemandUpdate(
          update.symbol,
          update.data,
          { skipRateLimit: true }
        );
      }

      console.log(`📡 Broadcast ${updates.length} real-time updates`);
    } catch (error) {
      console.error("Error broadcasting real-time updates:", error);
    }
  }

  // Calculate subscription metrics
  calculateTotalSubscription(categories) {
    if (!Array.isArray(categories)) return 0;
    return categories.reduce((total, category) => {
      return Math.max(total, parseFloat(category.subscriptionRatio || 0));
    }, 0);
  }

  calculateTotalDemand(demandData) {
    if (!Array.isArray(demandData)) return 0;
    return demandData.reduce((total, demand) => {
      return total + parseInt(demand.absoluteQuantity || 0);
    }, 0);
  }

  // Enhanced GMP Data Sync with trend analysis
  async syncGMPData() {
    console.log("💰 Syncing GMP Data with trend analysis...");

    const activeIPOs = await prisma.iPO.findMany({
      where: {
        status: { in: ["open", "upcoming", "closed"] },
        isActive: true,
      },
      select: {
        id: true,
        symbol: true,
        name: true,
        minPrice: true,
        maxPrice: true,
        status: true,
      },
    });

    if (activeIPOs.length === 0) {
      return { message: "No IPOs for GMP sync", updates: 0 };
    }

    let updates = 0;
    const gmpUpdates = [];

    for (const ipo of activeIPOs) {
      try {
        // Simulate fetching GMP data from multiple sources
        const gmpResults = await this.fetchGMPFromMultipleSources(ipo);

        if (gmpResults.length > 0) {
          // Calculate weighted average GMP
          const averageGMP = this.calculateWeightedGMP(gmpResults);

          // Get previous GMP for trend calculation
          const previousGMP = await this.getPreviousGMP(ipo.id);
          const gmpChange = this.calculateGMPChange(previousGMP, averageGMP);

          // Create GMP record with enhanced data
          const gmpData = await prisma.gMP.create({
            data: {
              ipoId: ipo.id,
              value: averageGMP.value,
              percentage: averageGMP.percentage,
              source: "aggregated",
              volume: averageGMP.volume,
              timestamp: new Date(),
              date: new Date(),
              // Additional metadata
              bidPrice: averageGMP.bidPrice,
              askPrice: averageGMP.askPrice,
            },
          });

          // Prepare real-time GMP update with trend analysis
          const gmpUpdate = {
            ipoId: ipo.id,
            symbol: ipo.symbol,
            value: averageGMP.value,
            percentage: averageGMP.percentage,
            change: gmpChange,
            trend: this.analyzeTrend([previousGMP?.value, averageGMP.value]),
            volume: averageGMP.volume,
            reliability: averageGMP.reliability,
            sources: gmpResults.map((r) => r.source),
            timestamp: Date.now(),
          };

          // Cache real-time GMP
          await cache.cacheRealTimeData("GMP", ipo.id, gmpUpdate);
          gmpUpdates.push(gmpUpdate);

          updates++;
        }
      } catch (error) {
        console.error(`Error syncing GMP for ${ipo.symbol}:`, error);
      }
    }

    // Batch broadcast GMP updates
    await this.broadcastGMPUpdates(gmpUpdates);

    console.log(`✅ GMP sync completed: ${updates} updates`);

    return { updates, gmpUpdates: gmpUpdates.length };
  }

  // Fetch GMP from multiple sources with reliability scoring
  async fetchGMPFromMultipleSources(ipo) {
    const gmpSources = ["market", "broker", "portal", "aggregator"];
    const results = [];

    for (const source of gmpSources) {
      try {
        const gmpValue = await this.simulateGMPFetch(ipo.symbol, source);

        if (gmpValue !== null) {
          results.push({
            source,
            value: gmpValue.value,
            percentage: (
              (gmpValue.value / (ipo.maxPrice || 100)) *
              100
            ).toFixed(2),
            volume: gmpValue.volume || Math.floor(Math.random() * 1000) + 100,
            reliability: this.getSourceReliability(source),
            timestamp: Date.now(),
            bidPrice: gmpValue.bidPrice,
            askPrice: gmpValue.askPrice,
          });
        }
      } catch (error) {
        console.warn(
          `Failed to fetch GMP from ${source} for ${ipo.symbol}:`,
          error.message
        );
      }
    }

    return results;
  }

  // Simulate GMP fetch (replace with actual API calls)
  async simulateGMPFetch(symbol, source) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

    // Simulate different source behaviors
    const baseValue = Math.floor(Math.random() * 200) - 50;
    const sourceVariation = {
      market: { offset: 0, reliability: 0.9 },
      broker: { offset: Math.floor(Math.random() * 10) - 5, reliability: 0.8 },
      portal: { offset: Math.floor(Math.random() * 15) - 7, reliability: 0.7 },
      aggregator: {
        offset: Math.floor(Math.random() * 5) - 2,
        reliability: 0.85,
      },
    };

    const config = sourceVariation[source] || { offset: 0, reliability: 0.6 };
    const finalValue = Math.max(0, baseValue + config.offset);

    return {
      value: finalValue,
      volume: Math.floor(Math.random() * 2000) + 500,
      bidPrice: finalValue - Math.floor(Math.random() * 5),
      askPrice: finalValue + Math.floor(Math.random() * 5),
      reliability: config.reliability,
    };
  }

  // Calculate weighted GMP from multiple sources
  calculateWeightedGMP(gmpResults) {
    if (gmpResults.length === 0) return null;

    const totalWeight = gmpResults.reduce(
      (sum, result) => sum + result.reliability,
      0
    );

    if (totalWeight === 0) return null;

    const weightedValue =
      gmpResults.reduce(
        (sum, result) => sum + result.value * result.reliability,
        0
      ) / totalWeight;

    const weightedPercentage =
      gmpResults.reduce(
        (sum, result) =>
          sum + parseFloat(result.percentage) * result.reliability,
        0
      ) / totalWeight;

    const totalVolume = gmpResults.reduce(
      (sum, result) => sum + result.volume,
      0
    );
    const avgBidPrice =
      gmpResults.reduce((sum, result) => sum + result.bidPrice, 0) /
      gmpResults.length;
    const avgAskPrice =
      gmpResults.reduce((sum, result) => sum + result.askPrice, 0) /
      gmpResults.length;

    return {
      value: Math.round(weightedValue * 100) / 100,
      percentage: Math.round(weightedPercentage * 100) / 100,
      volume: totalVolume,
      reliability: Math.round((totalWeight / gmpResults.length) * 100) / 100,
      bidPrice: Math.round(avgBidPrice * 100) / 100,
      askPrice: Math.round(avgAskPrice * 100) / 100,
    };
  }

  // Get reliability score for different sources
  getSourceReliability(source) {
    const reliabilityMap = {
      market: 0.9,
      broker: 0.8,
      portal: 0.7,
      aggregator: 0.85,
    };
    return reliabilityMap[source] || 0.6;
  }

  // Get previous GMP for trend calculation
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

  // Calculate GMP change
  calculateGMPChange(previousGMP, currentGMP) {
    if (!previousGMP || !currentGMP) {
      return { absolute: 0, percentage: 0, direction: "stable" };
    }

    const absolute = currentGMP.value - previousGMP.value;
    const percentage =
      previousGMP.value > 0
        ? parseFloat(((absolute / previousGMP.value) * 100).toFixed(2))
        : 0;

    let direction = "stable";
    if (absolute > 2) direction = "up";
    else if (absolute < -2) direction = "down";

    return { absolute, percentage, direction };
  }

  // Analyze trend from values
  analyzeTrend(values) {
    if (!values || values.length < 2) return "stable";

    const validValues = values.filter((v) => v !== null && v !== undefined);
    if (validValues.length < 2) return "stable";

    const change = validValues[validValues.length - 1] - validValues[0];

    if (Math.abs(change) < 1) return "stable";
    return change > 0 ? "bullish" : "bearish";
  }

  // Broadcast GMP updates
  async broadcastGMPUpdates(gmpUpdates) {
    try {
      for (const update of gmpUpdates) {
        await webSocketService.broadcastGMPUpdate(update.ipoId, update, {
          skipRateLimit: true,
          includeAnalytics: true,
        });
      }

      console.log(`📡 Broadcast ${gmpUpdates.length} GMP updates`);
    } catch (error) {
      console.error("Error broadcasting GMP updates:", error);
    }
  }

  // Enhanced Analytics Sync with comprehensive calculations
  async syncAnalytics() {
    console.log("📊 Syncing comprehensive analytics...");

    const ipos = await prisma.iPO.findMany({
      where: { isActive: true },
      include: {
        gmp: {
          orderBy: { timestamp: "desc" },
          take: 100, // More data for better analytics
        },
        subscription: {
          orderBy: { timestamp: "desc" },
          take: 50,
        },
        analytics: true,
        demand: {
          orderBy: { timestamp: "desc" },
          take: 20,
        },
      },
    });

    let updates = 0;
    const analyticsResults = [];

    // Process analytics in batches for better performance
    const batchSize = 5;
    for (let i = 0; i < ipos.length; i += batchSize) {
      const batch = ipos.slice(i, i + batchSize);

      const batchPromises = batch.map(async (ipo) => {
        try {
          // Use the enhanced analytics service
          const analytics = await analyticsService.computeIPOAnalytics(ipo.id, {
            includeHistorical: true,
            includePredictions: true,
            timeRange: 30,
          });

          // Extract the computed analytics for database storage
          const dbAnalytics = this.extractAnalyticsForDB(analytics);

          // Upsert analytics data
          const updatedAnalytics = await prisma.iPOAnalytics.upsert({
            where: { ipoId: ipo.id },
            update: {
              ...dbAnalytics,
              updatedAt: new Date(),
            },
            create: {
              ipoId: ipo.id,
              ...dbAnalytics,
            },
          });

          // Cache analytics with multiple keys for different access patterns
          await Promise.all([
            cache.cacheAnalytics("ipo", ipo.id, analytics),
            cache.cacheAnalytics("symbol", ipo.symbol, analytics),
          ]);

          // Broadcast analytics update
          await webSocketService.broadcastAnalyticsUpdate(ipo.id, {
            analytics: updatedAnalytics,
            insights: analytics.insights,
            predictions: analytics.predictions,
            timestamp: Date.now(),
          });

          analyticsResults.push({
            symbol: ipo.symbol,
            analytics: updatedAnalytics,
            insights: analytics.insights?.length || 0,
            predictions: Object.keys(analytics.predictions || {}).length,
          });

          return true;
        } catch (error) {
          console.error(
            `Error calculating analytics for ${ipo.symbol}:`,
            error
          );
          return false;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      updates += batchResults.filter(
        (r) => r.status === "fulfilled" && r.value
      ).length;

      // Small delay between batches to prevent overwhelming
      if (i + batchSize < ipos.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Analytics sync completed: ${updates} updates`);

    // Update system analytics
    await this.updateSystemAnalytics();

    return { updates, results: analyticsResults.length };
  }

  // Extract analytics data suitable for database storage
  extractAnalyticsForDB(fullAnalytics) {
    const gmp = fullAnalytics.gmpAnalytics?.statistics || {};
    const sub = fullAnalytics.subscriptionAnalytics?.overall || {};
    const predictions = fullAnalytics.predictions || {};
    const risk = fullAnalytics.riskAssessment || {};

    return {
      totalGMPChanges: fullAnalytics.gmpAnalytics?.recordCount || 0,
      avgGMP: gmp.average || null,
      maxGMP: gmp.max || null,
      minGMP: gmp.min || null,
      gmpVolatility: gmp.standardDeviation || null,
      finalSubscription: sub.totalSubscription || null,
      retailSubscription: this.extractCategorySubscription(
        fullAnalytics,
        "RETAIL"
      ),
      qibSubscription: this.extractCategorySubscription(fullAnalytics, "QIB"),
      nibSubscription: this.extractCategorySubscription(fullAnalytics, "NIB"),
      predictedListingGain: predictions.listingGain?.value || null,
      allotmentProbability: predictions.allotmentProbability?.retail || null,
      riskScore: risk.overallRiskScore || null,
    };
  }

  // Extract category subscription data
  extractCategorySubscription(analytics, category) {
    const categories = analytics.subscriptionAnalytics?.categories || {};
    return categories[category]?.subscriptionRatio || null;
  }

  // Update system-wide analytics
  async updateSystemAnalytics() {
    try {
      const systemStats = {
        totalIPOs: await prisma.iPO.count({ where: { isActive: true } }),
        openIPOs: await prisma.iPO.count({
          where: { status: "open", isActive: true },
        }),
        upcomingIPOs: await prisma.iPO.count({
          where: { status: "upcoming", isActive: true },
        }),
        listedIPOs: await prisma.iPO.count({
          where: { status: "listed", isActive: true },
        }),
        totalGMPRecords: await prisma.gMP.count(),
        totalSubscriptionRecords: await prisma.subscriptionData.count(),
        lastUpdated: new Date().toISOString(),
        syncPerformance: this.getPerformanceMetrics(),
      };

      // Cache system analytics
      await cache.set(
        cache.key("SYSTEM", "analytics"),
        systemStats,
        300 // 5 minutes
      );

      console.log("📊 System analytics updated:", systemStats);
    } catch (error) {
      console.error("Error updating system analytics:", error);
    }
  }

  // Enhanced retry mechanism with exponential backoff
  async withRetry(operation, operationName, customRetries = null) {
    const config = customRetries || this.retryConfig;
    let lastError;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `${operationName} attempt ${attempt}/${config.maxRetries} failed:`,
          error.message
        );

        if (attempt < config.maxRetries) {
          let delay = config.baseDelay;

          if (config.exponentialBackoff) {
            delay = Math.min(
              config.baseDelay * Math.pow(2, attempt - 1),
              config.maxDelay
            );
          }

          // Add jitter to prevent thundering herd
          delay += Math.random() * 1000;

          console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${config.maxRetries} attempts: ${lastError.message}`
    );
  }

  // Queue failed operations for retry
  queueFailedOperation(operationName, operation, error) {
    if (this.failedOperationsQueue.length >= this.maxQueueSize) {
      // Remove oldest entry
      this.failedOperationsQueue.shift();
    }

    this.failedOperationsQueue.push({
      operationName,
      operation,
      error: error.message,
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  // Process failed operations queue
  async processFailedOperations() {
    if (this.failedOperationsQueue.length === 0) return;

    console.log(
      `🔄 Processing ${this.failedOperationsQueue.length} failed operations...`
    );

    const operations = [...this.failedOperationsQueue];
    this.failedOperationsQueue = [];

    for (const item of operations) {
      try {
        if (item.retryCount < 3) {
          // Max 3 retries for failed operations
          await item.operation();
          console.log(`✅ Recovered failed operation: ${item.operationName}`);
        } else {
          console.warn(
            `❌ Permanently failed operation: ${item.operationName}`
          );
        }
      } catch (error) {
        item.retryCount++;
        if (item.retryCount < 3) {
          this.failedOperationsQueue.push(item);
        }
        console.warn(
          `Failed to recover operation ${item.operationName}:`,
          error.message
        );
      }
    }
  }

  // Start monitoring and maintenance tasks
  startMonitoringTasks() {
    // Health check monitoring
    const healthCheckInterval = setInterval(async () => {
      try {
        await this.performSystemHealthCheck();
        await this.updateSystemStatus();
      } catch (error) {
        console.error("Health check failed:", error);
      }
    }, 60000); // Every minute

    this.activeIntervals.set("HEALTH_CHECK", healthCheckInterval);

    // Failed operations processing
    const failedOpsInterval = setInterval(async () => {
      try {
        await this.processFailedOperations();
      } catch (error) {
        console.error("Failed operations processing error:", error);
      }
    }, 300000); // Every 5 minutes

    this.activeIntervals.set("FAILED_OPS", failedOpsInterval);

    // Data consistency check
    const consistencyInterval = setInterval(async () => {
      try {
        await this.performDataConsistencyCheck();
      } catch (error) {
        console.error("Data consistency check failed:", error);
      }
    }, 3600000); // Every hour

    this.activeIntervals.set("CONSISTENCY_CHECK", consistencyInterval);

    // Performance metrics cleanup
    const cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 1800000); // Every 30 minutes

    this.activeIntervals.set("CLEANUP", cleanupInterval);

    console.log("📊 Monitoring tasks started");
  }

  // Update system status
  async updateSystemStatus() {
    const status = {
      isRunning: this.isRunning,
      syncStatus: this.syncStatus,
      performance: this.getPerformanceMetrics(),
      lastSync: Object.fromEntries(this.lastSync),
      uptime: Date.now() - (this.startTime || Date.now()),
      failedOperationsQueue: this.failedOperationsQueue.length,
      dataIntegrity: {
        lastCheck: this.dataIntegrity.lastConsistencyCheck,
        inconsistentRecords: this.dataIntegrity.inconsistentRecords.length,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache system status
    await cache.set(
      cache.key("SYSTEM", "sync_status"),
      status,
      60 // 1 minute
    );

    // Broadcast to monitoring clients
    await webSocketService.broadcastSystemStatus({
      type: "system_status",
      ...status,
    });
  }

  // Data consistency check
  async performDataConsistencyCheck() {
    console.log("🔍 Performing data consistency check...");

    try {
      const inconsistencies = [];

      // Check for IPOs without recent sync
      const staleIPOs = await prisma.iPO.findMany({
        where: {
          isActive: true,
          lastSyncAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          },
        },
        select: { id: true, symbol: true, lastSyncAt: true },
      });

      if (staleIPOs.length > 0) {
        inconsistencies.push({
          type: "stale_ipos",
          count: staleIPOs.length,
          details: staleIPOs.map((ipo) => ({
            symbol: ipo.symbol,
            lastSync: ipo.lastSyncAt,
          })),
        });
      }

      // Check for missing analytics
      const iposWithoutAnalytics = await prisma.iPO.findMany({
        where: {
          isActive: true,
          analytics: null,
        },
        select: { id: true, symbol: true },
      });

      if (iposWithoutAnalytics.length > 0) {
        inconsistencies.push({
          type: "missing_analytics",
          count: iposWithoutAnalytics.length,
          details: iposWithoutAnalytics.map((ipo) => ({ symbol: ipo.symbol })),
        });
      }

      // Update consistency status
      this.dataIntegrity.lastConsistencyCheck = new Date().toISOString();
      this.dataIntegrity.inconsistentRecords = inconsistencies;

      if (inconsistencies.length > 0 && this.dataIntegrity.autoRepairEnabled) {
        await this.attemptAutoRepair(inconsistencies);
      }

      console.log(
        `🔍 Consistency check completed: ${inconsistencies.length} issues found`
      );
    } catch (error) {
      console.error("Data consistency check failed:", error);
    }
  }

  // Attempt automatic repair of data inconsistencies
  async attemptAutoRepair(inconsistencies) {
    console.log("🔧 Attempting auto-repair of data inconsistencies...");

    for (const issue of inconsistencies) {
      try {
        switch (issue.type) {
          case "missing_analytics":
            // Trigger analytics sync for IPOs without analytics
            for (const ipo of issue.details) {
              await this.safeExecute(`Analytics-${ipo.symbol}`, async () => {
                const ipoData = await prisma.iPO.findUnique({
                  where: { symbol: ipo.symbol },
                  include: { gmp: true, subscription: true, demand: true },
                });

                if (ipoData) {
                  const analytics = await analyticsService.computeIPOAnalytics(
                    ipoData.id
                  );
                  const dbAnalytics = this.extractAnalyticsForDB(analytics);

                  await prisma.iPOAnalytics.create({
                    data: { ipoId: ipoData.id, ...dbAnalytics },
                  });
                }
              });
            }
            break;

          case "stale_ipos":
            // Mark for priority sync
            console.log(`Marking ${issue.count} stale IPOs for priority sync`);
            break;
        }
      } catch (error) {
        console.error(`Auto-repair failed for ${issue.type}:`, error);
      }
    }
  }

  // Cleanup old metrics and logs
  cleanupOldMetrics() {
    // Clean up data integrity records older than 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.dataIntegrity.inconsistentRecords =
      this.dataIntegrity.inconsistentRecords.filter(
        (record) => record.timestamp && record.timestamp > oneDayAgo
      );

    // Clean up failed operations older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.failedOperationsQueue = this.failedOperationsQueue.filter(
      (op) => op.timestamp > oneHourAgo
    );
  }

  // Enhanced logging with structured data
  async logSync(
    service,
    operation,
    status,
    recordsProcessed = 0,
    errors = null,
    duration = null
  ) {
    try {
      const logData = {
        service,
        operation,
        status,
        recordsProcessed,
        errors: errors
          ? typeof errors === "object"
            ? errors
            : { error: errors }
          : null,
        duration,
        timestamp: new Date(),
        syncVersion: "2.0",
        systemMetrics: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
        },
      };

      await prisma.syncLog.create({
        data: {
          service,
          operation,
          status,
          recordsProcessed,
          errors: logData.errors ? JSON.stringify(logData.errors) : null,
          duration,
          createdAt: logData.timestamp,
        },
      });

      // Also log to console with structured format
      console.log(
        `📝 [${status.toUpperCase()}] ${service}:${operation} - ${recordsProcessed} records in ${duration}ms`
      );
    } catch (error) {
      console.error("Failed to log sync operation:", error);
    }
  }

  // Update IPO Categories with enhanced validation
  async updateIPOCategories(symbol, categoryDetails) {
    try {
      const ipo = await prisma.iPO.findUnique({ where: { symbol } });
      if (!ipo) {
        console.warn(`IPO not found for category update: ${symbol}`);
        return;
      }

      // Validate category data
      const validCategories = categoryDetails.filter(this.validateCategoryData);

      if (validCategories.length !== categoryDetails.length) {
        console.warn(
          `${categoryDetails.length - validCategories.length} invalid categories filtered out for ${symbol}`
        );
      }

      // Clear existing categories
      await prisma.iPOCategory.deleteMany({
        where: { ipoId: ipo.id },
      });

      // Add new categories
      if (validCategories.length > 0) {
        const categoryData = validCategories.map((category) => ({
          ipoId: ipo.id,
          categoryCode: category.categoryCode || category.code,
          subCategoryCode:
            category.subCategoryCode || category.subCatCode || null,
          minValue: category.minValue || null,
          maxValue: category.maxValue || null,
          maxQuantity: category.maxQuantity
            ? BigInt(category.maxQuantity)
            : null,
          maxUpiLimit: category.maxUpiLimit || null,
          allowCutOff: Boolean(category.allowCutOff),
          allowUpi: Boolean(category.allowUpi),
          discountType: category.discountType || null,
          discountPrice: category.discountPrice || null,
          startTime: category.startTime ? new Date(category.startTime) : null,
          endTime: category.endTime ? new Date(category.endTime) : null,
        }));

        await prisma.iPOCategory.createMany({
          data: categoryData,
          skipDuplicates: true,
        });

        console.log(
          `✅ Updated ${validCategories.length} categories for ${symbol}`
        );
      }
    } catch (error) {
      console.error(`Error updating categories for ${symbol}:`, error);
    }
  }

  // Validate category data
  validateCategoryData(category) {
    return (
      category &&
      (category.categoryCode || category.code) &&
      typeof (category.categoryCode || category.code) === "string"
    );
  }

  // Manual sync triggers with enhanced options
  async triggerSync(type, options = {}) {
    console.log(`🎯 Manual sync triggered: ${type}`, options);

    try {
      switch (type.toLowerCase()) {
        case "ipo-master":
          return await this.syncIPOMaster();

        case "live-data":
          return await this.syncLiveData();

        case "gmp":
          return await this.syncGMPData();

        case "analytics":
          if (options.ipoId) {
            // Sync analytics for specific IPO
            const analytics = await analyticsService.computeIPOAnalytics(
              options.ipoId,
              options
            );
            const dbAnalytics = this.extractAnalyticsForDB(analytics);

            const result = await prisma.iPOAnalytics.upsert({
              where: { ipoId: options.ipoId },
              update: { ...dbAnalytics, updatedAt: new Date() },
              create: { ipoId: options.ipoId, ...dbAnalytics },
            });

            return { updates: 1, result };
          } else {
            return await this.syncAnalytics();
          }

        case "all":
          const results = await Promise.allSettled([
            this.syncIPOMaster(),
            this.syncLiveData(),
            this.syncGMPData(),
            this.syncAnalytics(),
          ]);

          return results.map((result, index) => ({
            sync: ["ipo-master", "live-data", "gmp", "analytics"][index],
            status: result.status,
            result:
              result.status === "fulfilled"
                ? result.value
                : result.reason?.message,
          }));

        case "failed-operations":
          await this.processFailedOperations();
          return { message: "Failed operations processed" };

        case "consistency-check":
          await this.performDataConsistencyCheck();
          return {
            message: "Consistency check completed",
            issues: this.dataIntegrity.inconsistentRecords.length,
          };

        default:
          throw new Error(`Unknown sync type: ${type}`);
      }
    } catch (error) {
      console.error(`Manual sync ${type} failed:`, error);
      throw error;
    }
  }

  // Get comprehensive sync status
  getSyncStatus() {
    const uptime = Date.now() - (this.startTime || Date.now());

    return {
      isRunning: this.isRunning,
      uptime,
      startTime: this.startTime,
      syncStatus: this.syncStatus,
      lastSync: Object.fromEntries(this.lastSync),
      nextSync: this.calculateNextSyncTimes(),
      performance: this.getPerformanceMetrics(),
      activeIntervals: Array.from(this.activeIntervals.keys()),
      queueStatus: {
        failedOperations: this.failedOperationsQueue.length,
        maxQueueSize: this.maxQueueSize,
      },
      dataIntegrity: this.dataIntegrity,
      systemHealth: this.syncStatus.lastHealthCheck,
    };
  }

  // Calculate next sync times
  calculateNextSyncTimes() {
    const nextSync = {};

    for (const [key, interval] of Object.entries(this.syncIntervals)) {
      const lastSyncTime = this.lastSync.get(key) || Date.now();
      nextSync[key] = new Date(lastSyncTime + interval).toISOString();
    }

    return nextSync;
  }

  // Get performance metrics
  getPerformanceMetrics() {
    const successRate =
      this.performance.totalSyncs > 0
        ? (
            (this.performance.successfulSyncs / this.performance.totalSyncs) *
            100
          ).toFixed(2)
        : "100.00";

    return {
      totalSyncs: this.performance.totalSyncs,
      successfulSyncs: this.performance.successfulSyncs,
      failedSyncs: this.performance.failedSyncs,
      successRate: `${successRate}%`,
      errorRate: `${this.performance.errorRate.toFixed(2)}%`,
      averageResponseTime: Math.round(this.performance.averageResponseTime),
      dataPointsProcessed: this.performance.dataPointsProcessed,
      lastSyncTime: this.performance.lastSyncTime
        ? new Date(this.performance.lastSyncTime).toISOString()
        : null,
      uptime: Date.now() - (this.startTime || Date.now()),
    };
  }

  // Enhanced health check
  async healthCheck() {
    try {
      const [nseHealth, cacheHealth, dbHealth] = await Promise.allSettled([
        nseAPI.healthCheck(),
        cache.healthCheck(),
        prisma.$queryRaw`SELECT 1 as health`,
      ]);

      const wsHealth = await webSocketService.getHealthCheck();

      const servicesStatus = {
        nseAPI:
          nseHealth.status === "fulfilled" &&
          nseHealth.value.status === "healthy",
        cache:
          cacheHealth.status === "fulfilled" &&
          cacheHealth.value.status === "healthy",
        database: dbHealth.status === "fulfilled",
        websocket: wsHealth.status === "healthy",
      };

      const overallHealthy = Object.values(servicesStatus).every(Boolean);

      return {
        status: overallHealthy ? "healthy" : "degraded",
        isRunning: this.isRunning,
        services: servicesStatus,
        performance: this.getPerformanceMetrics(),
        lastSync: Object.fromEntries(this.lastSync),
        dataIntegrity: this.dataIntegrity,
        queueStatus: {
          failedOperations: this.failedOperationsQueue.length,
          maxSize: this.maxQueueSize,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        isRunning: this.isRunning,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Stop all sync processes with graceful shutdown
  async stop() {
    console.log("🛑 Stopping Data Sync Service...");

    this.isRunning = false;

    // Clear all active intervals
    for (const [name, intervalId] of this.activeIntervals) {
      clearInterval(intervalId);
      console.log(`⏹️  Stopped ${name} sync interval`);
    }

    this.activeIntervals.clear();

    // Process any remaining failed operations
    if (this.failedOperationsQueue.length > 0) {
      console.log("🔄 Processing remaining failed operations...");
      try {
        await this.processFailedOperations();
      } catch (error) {
        console.error("Error processing final failed operations:", error);
      }
    }

    // Broadcast shutdown notification
    try {
      await webSocketService.broadcastSystemStatus(
        {
          type: "sync_service_shutdown",
          message: "Data sync service has been stopped",
          finalMetrics: this.getPerformanceMetrics(),
          timestamp: Date.now(),
        },
        { priority: "high" }
      );
    } catch (error) {
      console.error("Error broadcasting shutdown:", error);
    }

    console.log("✅ Data Sync Service stopped gracefully");

    // Log final performance metrics
    console.log("📊 Final Performance Metrics:", this.getPerformanceMetrics());
  }

  // Set start time for uptime calculation
  setStartTime() {
    this.startTime = Date.now();
  }
}

// Export singleton instance
export const dataSyncService = new DataSyncService();

// Auto-start if not in test environment
if (
  process.env.NODE_ENV !== "test" &&
  process.env.AUTO_START_SYNC !== "false"
) {
  dataSyncService.setStartTime();
  dataSyncService.start().catch((error) => {
    console.error("Failed to auto-start Data Sync Service:", error);
    process.exit(1);
  });
}

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(
    `🛑 Received ${signal}, shutting down Data Sync Service gracefully...`
  );
  try {
    await dataSyncService.stop();
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

// Handle uncaught exceptions and unhandled rejections
process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception in Data Sync Service:", error);
  try {
    await dataSyncService.stop();
  } catch (stopError) {
    console.error("Error during emergency stop:", stopError);
  }
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  console.error(
    "Unhandled Rejection in Data Sync Service at:",
    promise,
    "reason:",
    reason
  );
  try {
    await dataSyncService.stop();
  } catch (stopError) {
    console.error("Error during emergency stop:", stopError);
  }
  process.exit(1);
});

export default dataSyncService;
