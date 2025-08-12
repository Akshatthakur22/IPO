import { cache } from "./cache.js";
import { prisma } from "./db.js";

class NSEAPIService {
  constructor() {
    this.baseURL =
      process.env.NSE_API_BASE_URL || "https://eipo.nseindia.com/eipo";
    this.queryBaseURL =
      process.env.NSE_QUERY_BASE_URL || "https://eipo.nseindia.com/eipo";
    this.memberCode = process.env.NSE_MEMBER_CODE;
    this.loginId = process.env.NSE_LOGIN_ID;
    this.password = process.env.NSE_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    this.rateLimiter = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Performance tracking
    this.performance = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
    };

    // Request retry configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };
  }

  // Enhanced authentication with caching and retry logic
  async login() {
    try {
      this.checkRateLimit("login");

      // Try to get cached token first
      const cachedToken = await cache.get("nse_auth_token");
      if (cachedToken && cachedToken.expiresAt > Date.now()) {
        this.token = cachedToken.token;
        this.tokenExpiry = cachedToken.expiresAt;
        console.log("🔐 Using cached NSE API token");
        return this.token;
      }

      console.log("🔐 Performing NSE API login...");
      const startTime = Date.now();

      const response = await fetch(`${this.baseURL}/v1/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "IPO-Tracker-Platform/1.0",
          Accept: "application/json",
        },
        body: JSON.stringify({
          member: this.memberCode,
          loginId: this.loginId,
          password: this.password,
        }),
        timeout: 30000, // 30 second timeout
      });

      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, response.ok);

      if (!response.ok) {
        throw new Error(
          `Login failed: HTTP ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (data.status === "success" && data.token) {
        this.token = data.token;
        this.tokenExpiry = Date.now() + 3600 * 1000; // 1 hour from now

        // Cache the token with shorter TTL for safety (55 minutes)
        await cache.set(
          "nse_auth_token",
          {
            token: this.token,
            expiresAt: this.tokenExpiry,
            createdAt: Date.now(),
          },
          3300
        );

        console.log("✅ NSE API authentication successful");
        return this.token;
      } else {
        throw new Error(
          `Login failed: ${data.reason || data.message || "Unknown error"}`
        );
      }
    } catch (error) {
      this.performance.failedRequests++;
      console.error("❌ NSE Login Error:", error.message);
      throw new Error(`NSE API login failed: ${error.message}`);
    }
  }

  // Enhanced authentication check with automatic refresh
  async ensureAuthentication() {
    if (!this.token || Date.now() >= this.tokenExpiry - 300000) {
      // Refresh 5 minutes early
      console.log("🔄 Refreshing NSE API token...");
      await this.login();
    }
    return this.token;
  }

  // Enhanced rate limiting with queue management
  checkRateLimit(apiName) {
    const now = Date.now();
    const windowStart = Math.floor(now / 1000) * 1000; // 1-second window
    const key = `${apiName}_${windowStart}`;

    const limits = {
      login: { window: 1000, max: 2 }, // 2 requests per second
      transactions_add: { window: 1000, max: 100 },
      transactions_fetch: { window: 300000, max: 1 }, // 1 per 5 minutes
      allotment_fetch: { window: 1000, max: 10 },
      demand: { window: 5000, max: 20 }, // 20 per 5 seconds
      catwise: { window: 5000, max: 20 },
      ipomaster: { window: 60000, max: 10 }, // 10 per minute
      default: { window: 5000, max: 10 },
    };

    const limit = limits[apiName] || limits.default;
    const count = this.rateLimiter.get(key) || 0;

    if (count >= limit.max) {
      throw new Error(
        `Rate limit exceeded for ${apiName}. Max ${limit.max} requests per ${limit.window / 1000} seconds.`
      );
    }

    this.rateLimiter.set(key, count + 1);

    // Cleanup old entries
    setTimeout(() => {
      this.rateLimiter.delete(key);
    }, limit.window);
  }

  // Update performance metrics
  updatePerformanceMetrics(responseTime, success) {
    this.performance.totalRequests++;
    this.performance.lastRequestTime = Date.now();

    if (success) {
      this.performance.successfulRequests++;
    } else {
      this.performance.failedRequests++;
    }

    // Update rolling average response time
    this.performance.averageResponseTime =
      (this.performance.averageResponseTime *
        (this.performance.totalRequests - 1) +
        responseTime) /
      this.performance.totalRequests;
  }

  // Enhanced request method with comprehensive error handling
  async makeRequest(endpoint, options = {}) {
    const startTime = Date.now();

    try {
      await this.ensureAuthentication();

      const defaultHeaders = {
        "Content-Type": "application/json",
        "Access-Token": this.token,
        "User-Agent": "IPO-Tracker-Platform/1.0",
        Accept: "application/json",
      };

      const response = await fetch(`${this.baseURL}${endpoint}`, {
        timeout: 30000,
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, response.ok);

      // Handle token expiry
      if (response.status === 401) {
        console.log("🔑 Token expired, refreshing and retrying...");
        await cache.del("nse_auth_token"); // Clear cached token
        await this.login();
        return this.makeRequest(endpoint, options); // Retry once
      }

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, false);
      throw error;
    }
  }

  // Query API request with Basic Auth
  async makeQueryRequest(endpoint, symbol) {
    const startTime = Date.now();

    try {
      const credentials = this.encodeCredentials();

      const response = await fetch(
        `${this.queryBaseURL}${endpoint}/${encodeURIComponent(symbol)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${credentials}`,
            "User-Agent": "IPO-Tracker-Platform/1.0",
            Accept: "application/json",
          },
          timeout: 30000,
        }
      );

      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, response.ok);

      if (!response.ok) {
        throw new Error(
          `Query API request failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, false);
      throw error;
    }
  }

  // Encode credentials for Basic Auth
  encodeCredentials() {
    const credentials = `${this.memberCode}^${this.loginId}:${this.password}`;
    return Buffer.from(credentials).toString("base64");
  }

  // Enhanced retry mechanism
  async withRetry(
    operation,
    operationName,
    maxRetries = this.retryConfig.maxRetries
  ) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(
          `${operationName} attempt ${attempt} failed:`,
          error.message
        );

        if (attempt < maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelay
          );

          console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${maxRetries} attempts: ${lastError.message}`
    );
  }

  // Fetch IPO Master Data with enhanced caching and validation
  async fetchIPOMasterData() {
    const cacheKey = cache.key("SYSTEM", "ipo_master_data");

    try {
      // Check cache first (5-minute TTL)
      const cached = await cache.get(cacheKey);
      if (cached && Array.isArray(cached)) {
        console.log("📦 Using cached IPO master data");
        return cached;
      }

      console.log("🔄 Fetching fresh IPO master data from NSE...");

      const data = await this.withRetry(async () => {
        this.checkRateLimit("ipomaster");
        const response = await this.makeRequest("/v1/ipomaster");

        if (!response || response.status !== "success") {
          throw new Error(
            `Invalid response: ${response?.reason || "Unknown error"}`
          );
        }

        return response.data;
      }, "IPO Master Data Fetch");

      // Validate data structure
      if (!Array.isArray(data)) {
        throw new Error("IPO master data is not an array");
      }

      // Cache for 5 minutes
      await cache.set(cacheKey, data, 300);

      console.log(`✅ Fetched ${data.length} IPO records from NSE`);
      return data;
    } catch (error) {
      console.error("❌ Error fetching IPO master data:", error.message);

      // Try to return cached data even if expired
      const staleCache = await cache.get(cacheKey);
      if (staleCache) {
        console.warn("⚠️  Using stale cached IPO master data");
        return staleCache;
      }

      throw error;
    }
  }

  // Fetch Live Demand Data with intelligent caching
  async fetchDemandData(symbol) {
    if (!symbol) {
      throw new Error("Symbol is required for demand data");
    }

    try {
      this.checkRateLimit("demand");

      // Check for recent cached data (30 seconds)
      const cached = await cache.getRealTimeData("DEMAND", symbol);
      if (cached && Date.now() - cached.timestamp < 30000) {
        return cached.data;
      }

      console.log(`📈 Fetching demand data for ${symbol}...`);

      const data = await this.withRetry(async () => {
        const response = await this.makeQueryRequest(
          "/mktdata/v1/demand",
          symbol
        );

        if (!response || response.status !== "success") {
          throw new Error(
            `Invalid demand response: ${response?.reason || "Unknown error"}`
          );
        }

        return response.demand;
      }, `Demand Data Fetch for ${symbol}`);

      // Validate data structure
      if (!Array.isArray(data)) {
        console.warn(`⚠️  Invalid demand data structure for ${symbol}`);
        return [];
      }

      // Cache with real-time data structure
      await cache.cacheRealTimeData("DEMAND", symbol, {
        symbol,
        data,
        lastUpdated: new Date().toISOString(),
        recordCount: data.length,
      });

      console.log(`✅ Fetched ${data.length} demand records for ${symbol}`);
      return data;
    } catch (error) {
      console.error(
        `❌ Error fetching demand data for ${symbol}:`,
        error.message
      );

      // Return stale cache if available
      const staleCache = await cache.getCachedDemandData(symbol);
      if (staleCache) {
        console.warn(`⚠️  Using stale demand cache for ${symbol}`);
        return staleCache.data || staleCache;
      }

      throw error;
    }
  }

  // Fetch Category-wise Subscription Data
  async fetchCategoryData(symbol) {
    if (!symbol) {
      throw new Error("Symbol is required for category data");
    }

    try {
      this.checkRateLimit("catwise");

      // Check for recent cached data (30 seconds)
      const cached = await cache.getRealTimeData("SUBSCRIPTION", symbol);
      if (cached && Date.now() - cached.timestamp < 30000) {
        return cached.data;
      }

      console.log(`📊 Fetching category data for ${symbol}...`);

      const data = await this.withRetry(async () => {
        const response = await this.makeQueryRequest(
          "/mktdata/v1/catwise",
          symbol
        );

        if (!response || response.status !== "success") {
          throw new Error(
            `Invalid category response: ${response?.reason || "Unknown error"}`
          );
        }

        return response.demand; // Note: API returns 'demand' field for category data
      }, `Category Data Fetch for ${symbol}`);

      // Validate data structure
      if (!Array.isArray(data)) {
        console.warn(`⚠️  Invalid category data structure for ${symbol}`);
        return [];
      }

      // Cache with real-time data structure
      await cache.cacheRealTimeData("SUBSCRIPTION", symbol, {
        symbol,
        data,
        lastUpdated: new Date().toISOString(),
        recordCount: data.length,
      });

      console.log(`✅ Fetched ${data.length} category records for ${symbol}`);
      return data;
    } catch (error) {
      console.error(
        `❌ Error fetching category data for ${symbol}:`,
        error.message
      );

      // Return stale cache if available
      const staleCache = await cache.getCachedSubscriptionData(symbol);
      if (staleCache) {
        console.warn(`⚠️  Using stale category cache for ${symbol}`);
        return staleCache.data || staleCache;
      }

      throw error;
    }
  }

  // Fetch Allotment Data
  async fetchAllotmentData(fromTime, toTime) {
    try {
      this.checkRateLimit("allotment_fetch");

      console.log(
        `🎯 Fetching allotment data from ${fromTime} to ${toTime}...`
      );

      const data = await this.withRetry(async () => {
        const endpoint = `/v1/allotment/${encodeURIComponent(fromTime)}/${encodeURIComponent(toTime)}`;
        const response = await this.makeRequest(endpoint);

        if (!response || response.status !== "success") {
          throw new Error(
            `Invalid allotment response: ${response?.reason || "Unknown error"}`
          );
        }

        return response.transactions;
      }, "Allotment Data Fetch");

      // Validate data structure
      if (!Array.isArray(data)) {
        console.warn("⚠️  Invalid allotment data structure");
        return [];
      }

      console.log(`✅ Fetched ${data.length} allotment records`);
      return data;
    } catch (error) {
      console.error("❌ Error fetching allotment data:", error.message);
      throw error;
    }
  }

  // Batch fetch multiple symbols' data with intelligent queuing
  async batchFetchMarketData(symbols, options = {}) {
    const { maxConcurrent = 2, priority = 0, skipErrors = true } = options;
    const results = {};
    const errors = {};

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return { results: {}, errors: {} };
    }

    console.log(
      `📊 Batch fetching market data for ${symbols.length} symbols...`
    );

    // Process in chunks to respect rate limits
    for (let i = 0; i < symbols.length; i += maxConcurrent) {
      const chunk = symbols.slice(i, i + maxConcurrent);

      const chunkPromises = chunk.map((symbol) =>
        this.queueRequest(async () => {
          try {
            const [demandData, categoryData] = await Promise.allSettled([
              this.fetchDemandData(symbol),
              this.fetchCategoryData(symbol),
            ]);

            results[symbol] = {
              demand: demandData.status === "fulfilled" ? demandData.value : [],
              categories:
                categoryData.status === "fulfilled" ? categoryData.value : [],
              timestamp: new Date().toISOString(),
              success:
                demandData.status === "fulfilled" &&
                categoryData.status === "fulfilled",
            };

            // Log any individual failures
            if (demandData.status === "rejected") {
              console.warn(
                `⚠️  Demand data failed for ${symbol}:`,
                demandData.reason
              );
            }
            if (categoryData.status === "rejected") {
              console.warn(
                `⚠️  Category data failed for ${symbol}:`,
                categoryData.reason
              );
            }
          } catch (error) {
            errors[symbol] = error.message;
            if (!skipErrors) {
              throw error;
            }
            console.error(
              `❌ Failed to fetch data for ${symbol}:`,
              error.message
            );
          }
        }, priority)
      );

      await Promise.allSettled(chunkPromises);

      // Small delay between chunks to be nice to the API
      if (i + maxConcurrent < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const successCount = Object.keys(results).length;
    const errorCount = Object.keys(errors).length;

    console.log(
      `✅ Batch fetch completed: ${successCount} successful, ${errorCount} errors`
    );

    return { results, errors };
  }

  // Enhanced queue management
  async queueRequest(requestFn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        requestFn,
        priority,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Sort by priority (higher first) and timestamp
      this.requestQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();

      try {
        const result = await request.requestFn();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }

      // Respect rate limits with adaptive delay
      const delay = this.calculateAdaptiveDelay();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.isProcessingQueue = false;
  }

  // Calculate adaptive delay based on recent performance
  calculateAdaptiveDelay() {
    const baseDelay = 200; // 200ms base delay
    const recentFailureRate =
      this.performance.failedRequests /
      Math.max(this.performance.totalRequests, 1);

    // Increase delay if we're seeing failures
    if (recentFailureRate > 0.1) {
      // More than 10% failure rate
      return baseDelay * 2;
    } else if (recentFailureRate > 0.05) {
      // More than 5% failure rate
      return baseDelay * 1.5;
    }

    return baseDelay;
  }

  // Comprehensive health check
  async healthCheck() {
    const startTime = Date.now();

    try {
      // Test authentication
      const isAuthenticated = await this.ensureAuthentication();

      // Test a simple API call
      let apiCallSuccessful = false;
      let apiError = null;

      try {
        const testData = await this.fetchIPOMasterData();
        apiCallSuccessful = Array.isArray(testData) && testData.length >= 0;
      } catch (error) {
        apiError = error.message;
      }

      const responseTime = Date.now() - startTime;
      const isHealthy = isAuthenticated && apiCallSuccessful;

      return {
        status: isHealthy ? "healthy" : "degraded",
        authenticated: !!isAuthenticated,
        apiCallSuccessful,
        responseTime,
        queueLength: this.requestQueue.length,
        rateLimiterSize: this.rateLimiter.size,
        performance: this.getPerformanceStats(),
        lastError: apiError,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        responseTime: Date.now() - startTime,
        queueLength: this.requestQueue.length,
        rateLimiterSize: this.rateLimiter.size,
        performance: this.getPerformanceStats(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Get performance statistics
  getPerformanceStats() {
    const successRate =
      this.performance.totalRequests > 0
        ? (
            (this.performance.successfulRequests /
              this.performance.totalRequests) *
            100
          ).toFixed(2)
        : "100.00";

    return {
      totalRequests: this.performance.totalRequests,
      successfulRequests: this.performance.successfulRequests,
      failedRequests: this.performance.failedRequests,
      successRate: `${successRate}%`,
      averageResponseTime: Math.round(this.performance.averageResponseTime),
      lastRequestTime: this.performance.lastRequestTime
        ? new Date(this.performance.lastRequestTime).toISOString()
        : null,
    };
  }

  // Get API statistics
  getStats() {
    return {
      queueLength: this.requestQueue.length,
      rateLimiterEntries: this.rateLimiter.size,
      isAuthenticated: !!this.token,
      tokenExpiry: this.tokenExpiry
        ? new Date(this.tokenExpiry).toISOString()
        : null,
      isProcessingQueue: this.isProcessingQueue,
      performance: this.getPerformanceStats(),
    };
  }

  // Cleanup resources
  cleanup() {
    this.requestQueue.length = 0;
    this.rateLimiter.clear();
    this.token = null;
    this.tokenExpiry = null;
    this.performance = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
    };
    console.log("🧹 NSE API service cleaned up");
  }

  // Reset performance metrics
  resetPerformanceMetrics() {
    this.performance = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
    };
    console.log("📊 NSE API performance metrics reset");
  }
}

// Export singleton instance
export const nseAPI = new NSEAPIService();

// Data transformation utilities
export const transformIPOData = (nseIPO) => {
  if (!nseIPO) return null;

  return {
    symbol: nseIPO.symbol?.toUpperCase() || "",
    name: nseIPO.name || "",
    isin: nseIPO.isin || null,
    lotSize: parseInt(nseIPO.lotSize) || 1,
    faceValue: parseFloat(nseIPO.faceValue) || 10,
    minPrice: parseFloat(nseIPO.minPrice) || null,
    maxPrice: parseFloat(nseIPO.maxPrice) || null,
    cutOffPrice: parseFloat(nseIPO.cutOffPrice || nseIPO.cutoffPrice) || null,
    tickSize: parseFloat(nseIPO.tickSize) || 0.05,
    issueSize: nseIPO.issueSize ? BigInt(nseIPO.issueSize) : null,
    issueType: nseIPO.issueType || "EQUITY",
    subType: nseIPO.subType || null,
    registrar: nseIPO.registrar || null,
    openDate: nseIPO.biddingStartDate
      ? new Date(nseIPO.biddingStartDate)
      : new Date(),
    closeDate: nseIPO.biddingEndDate
      ? new Date(nseIPO.biddingEndDate)
      : new Date(),
    listingDate: nseIPO.listingDate ? new Date(nseIPO.listingDate) : null,
    allotmentDate: nseIPO.allotmentDate ? new Date(nseIPO.allotmentDate) : null,
    dailyStartTime: nseIPO.dailyStartTime || "10:00:00",
    dailyEndTime: nseIPO.dailyEndTime || "17:00:00",
    status: determineIPOStatus(nseIPO),
    isActive: true,
    lastSyncAt: new Date(),
  };
};

export const transformSubscriptionData = (nseSubData, ipoId) => {
  if (!Array.isArray(nseSubData)) return [];

  return nseSubData
    .map((item) => {
      const quantity = BigInt(item.quantity || item.absoluteQuantity || 0);
      const bidCount = parseInt(item.bidCount || item.absoluteBidCount || 0);

      // Calculate subscription ratio
      const subscriptionRatio =
        bidCount > 0 && quantity > 0
          ? parseFloat((Number(quantity) / Math.max(bidCount, 1)).toFixed(2))
          : 0;

      return {
        ipoId,
        category: item.category || item.categoryCode || "UNKNOWN",
        subCategory:
          item.subCategory || item.subcategory || item.subCategoryCode || null,
        quantity,
        bidCount,
        subscriptionRatio,
        timestamp: new Date(),
      };
    })
    .filter((item) => item.category !== "UNKNOWN"); // Filter out invalid records
};

export const transformDemandData = (nseDemandData, ipoId) => {
  if (!Array.isArray(nseDemandData)) return [];

  return nseDemandData
    .map((item) => ({
      ipoId,
      cutOffIndicator: Boolean(item.cutOffIndicator || item.cutOff),
      series: item.series || null,
      price: parseFloat(item.price) || null,
      absoluteQuantity: BigInt(item.absoluteQuantity || 0),
      cumulativeQuantity: item.cumulativeQuantity
        ? BigInt(item.cumulativeQuantity)
        : null,
      absoluteBidCount: parseInt(item.absoluteBidCount || 0),
      cumulativeBidCount: parseInt(item.cumulativeBidCount || 0),
      timestamp: new Date(),
    }))
    .filter((item) => item.absoluteQuantity > 0 || item.absoluteBidCount > 0); // Filter out empty records
};

// Helper function to determine IPO status with enhanced logic
const determineIPOStatus = (nseIPO) => {
  const now = new Date();
  const openDate = nseIPO.biddingStartDate
    ? new Date(nseIPO.biddingStartDate)
    : null;
  const closeDate = nseIPO.biddingEndDate
    ? new Date(nseIPO.biddingEndDate)
    : null;
  const listingDate = nseIPO.listingDate ? new Date(nseIPO.listingDate) : null;

  // If we have explicit status from NSE, use it (with validation)
  if (nseIPO.status) {
    const nseStatus = nseIPO.status.toLowerCase();
    if (["upcoming", "open", "closed", "listed"].includes(nseStatus)) {
      return nseStatus;
    }
  }

  // Determine status based on dates
  if (listingDate && now >= listingDate) return "listed";
  if (closeDate && now > closeDate) return "closed";
  if (openDate && closeDate && now >= openDate && now <= closeDate)
    return "open";
  if (openDate && now < openDate) return "upcoming";

  // Default status
  return "upcoming";
};

// Validation utilities
export const validateIPOData = (ipoData) => {
  const errors = [];

  if (!ipoData.symbol || ipoData.symbol.trim() === "") {
    errors.push("Symbol is required");
  }

  if (!ipoData.name || ipoData.name.trim() === "") {
    errors.push("Name is required");
  }

  if (!ipoData.openDate || isNaN(new Date(ipoData.openDate).getTime())) {
    errors.push("Valid open date is required");
  }

  if (!ipoData.closeDate || isNaN(new Date(ipoData.closeDate).getTime())) {
    errors.push("Valid close date is required");
  }

  if (
    ipoData.openDate &&
    ipoData.closeDate &&
    new Date(ipoData.openDate) >= new Date(ipoData.closeDate)
  ) {
    errors.push("Open date must be before close date");
  }

  if (
    ipoData.minPrice &&
    ipoData.maxPrice &&
    ipoData.minPrice > ipoData.maxPrice
  ) {
    errors.push("Min price must be less than or equal to max price");
  }

  return errors;
};

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("🛑 Cleaning up NSE API service...");
  nseAPI.cleanup();
});

process.on("SIGINT", () => {
  console.log("🛑 Cleaning up NSE API service...");
  nseAPI.cleanup();
});

// Periodic performance metrics reset (every 24 hours)
setInterval(
  () => {
    nseAPI.resetPerformanceMetrics();
  },
  24 * 60 * 60 * 1000
);

export default nseAPI;
