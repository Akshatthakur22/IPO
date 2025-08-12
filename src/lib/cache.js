import { Redis } from "@upstash/redis";
import { prisma } from "./db.js";

class CacheService {
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Memory cache fallback for when Redis is unavailable
    this.memoryCache = new Map();
    this.memoryCacheSize = 0;
    this.maxMemoryCache = 1000; // Maximum items in memory cache

    // Cache key prefixes for organization
    this.prefixes = {
      IPO: "ipo:",
      GMP: "gmp:",
      SUBSCRIPTION: "sub:",
      DEMAND: "demand:",
      ALLOTMENT: "allot:",
      USER: "user:",
      SESSION: "session:",
      API: "api:",
      ANALYTICS: "analytics:",
      REALTIME: "rt:",
      SEARCH: "search:",
      SYSTEM: "sys:",
    };

    // Default TTL values (in seconds)
    this.defaultTTL = {
      IPO_LIST: 300, // 5 minutes
      IPO_DETAIL: 180, // 3 minutes
      GMP_DATA: 60, // 1 minute
      SUBSCRIPTION: 30, // 30 seconds
      DEMAND: 30, // 30 seconds
      ALLOTMENT: 3600, // 1 hour
      USER_SESSION: 3600, // 1 hour
      API_RESPONSE: 60, // 1 minute
      ANALYTICS: 1800, // 30 minutes
      SEARCH: 600, // 10 minutes
      REALTIME: 15, // 15 seconds
      SYSTEM: 300, // 5 minutes
    };

    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      operations: 0,
    };
  }

  // Generate cache key with prefix
  key(prefix, identifier) {
    return `${this.prefixes[prefix] || ""}${identifier}`;
  }

  // Enhanced get with fallback to memory cache
  async get(key) {
    this.metrics.operations++;

    try {
      // Try Redis first
      const data = await this.redis.get(key);
      if (data !== null) {
        this.metrics.hits++;
        return typeof data === "string" ? JSON.parse(data) : data;
      }

      // Fallback to memory cache
      const memoryData = this.memoryCache.get(key);
      if (memoryData && memoryData.expiresAt > Date.now()) {
        this.metrics.hits++;
        return memoryData.value;
      }

      this.metrics.misses++;
      return null;
    } catch (error) {
      this.metrics.errors++;
      console.error("Cache get error:", error);

      // Try memory cache as fallback
      const memoryData = this.memoryCache.get(key);
      if (memoryData && memoryData.expiresAt > Date.now()) {
        return memoryData.value;
      }

      return null;
    }
  }

  // Enhanced set with memory cache backup
  async set(key, value, ttl = null) {
    this.metrics.operations++;

    try {
      const serialized =
        typeof value === "string" ? value : JSON.stringify(value);

      let result;
      if (ttl) {
        result = await this.redis.setex(key, ttl, serialized);
      } else {
        result = await this.redis.set(key, serialized);
      }

      // Also store in memory cache as backup
      this.setMemoryCache(key, value, ttl);

      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error("Cache set error:", error);

      // Fallback to memory cache only
      this.setMemoryCache(key, value, ttl);
      return false;
    }
  }

  // Memory cache management
  setMemoryCache(key, value, ttl = null) {
    const expiresAt = ttl
      ? Date.now() + ttl * 1000
      : Date.now() + 5 * 60 * 1000; // Default 5 min

    // Remove old entry if exists
    if (this.memoryCache.has(key)) {
      this.memoryCacheSize--;
    }

    // Check if we need to evict items
    if (this.memoryCacheSize >= this.maxMemoryCache) {
      this.evictOldestMemoryCache();
    }

    this.memoryCache.set(key, { value, expiresAt });
    this.memoryCacheSize++;
  }

  // Evict oldest items from memory cache
  evictOldestMemoryCache() {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    // Remove oldest 10% of items
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
      this.memoryCacheSize--;
    }
  }

  // Enhanced delete with memory cache cleanup
  async del(key) {
    this.metrics.operations++;

    try {
      const result = await this.redis.del(key);

      // Also remove from memory cache
      if (this.memoryCache.has(key)) {
        this.memoryCache.delete(key);
        this.memoryCacheSize--;
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error("Cache delete error:", error);

      // Still try to remove from memory cache
      if (this.memoryCache.has(key)) {
        this.memoryCache.delete(key);
        this.memoryCacheSize--;
      }

      return false;
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      const redisExists = await this.redis.exists(key);
      if (redisExists) return true;

      // Check memory cache
      const memoryData = this.memoryCache.get(key);
      return memoryData && memoryData.expiresAt > Date.now();
    } catch (error) {
      console.error("Cache exists error:", error);

      // Check memory cache only
      const memoryData = this.memoryCache.get(key);
      return memoryData && memoryData.expiresAt > Date.now();
    }
  }

  // IPO-specific cache operations
  async cacheIPOList(ipos, filters = {}) {
    const filterKey = Object.keys(filters)
      .sort()
      .map((k) => `${k}:${filters[k]}`)
      .join("|");
    const cacheKey = this.key("IPO", `list:${filterKey || "all"}`);
    return this.set(cacheKey, ipos, this.defaultTTL.IPO_LIST);
  }

  async getCachedIPOList(filters = {}) {
    const filterKey = Object.keys(filters)
      .sort()
      .map((k) => `${k}:${filters[k]}`)
      .join("|");
    const cacheKey = this.key("IPO", `list:${filterKey || "all"}`);
    return this.get(cacheKey);
  }

  async cacheIPODetail(ipoId, data) {
    const cacheKey = this.key("IPO", `detail:${ipoId}`);
    return this.set(cacheKey, data, this.defaultTTL.IPO_DETAIL);
  }

  async getCachedIPODetail(ipoId) {
    const cacheKey = this.key("IPO", `detail:${ipoId}`);
    return this.get(cacheKey);
  }

  // Real-time data cache with pub/sub support
  async cacheRealTimeData(type, identifier, data) {
    const cacheKey = this.key("REALTIME", `${type}:${identifier}`);
    const enrichedData = {
      ...data,
      timestamp: Date.now(),
      cached_at: new Date().toISOString(),
    };

    // Cache with short TTL for real-time data
    await this.set(cacheKey, enrichedData, this.defaultTTL.REALTIME);

    // Also publish to Redis pub/sub for WebSocket distribution (if available)
    try {
      await this.redis.publish(
        `realtime:${type}:${identifier}`,
        JSON.stringify(enrichedData)
      );
    } catch (error) {
      console.warn(
        "Redis publish failed, continuing without pub/sub:",
        error.message
      );
    }

    return enrichedData;
  }

  async getRealTimeData(type, identifier) {
    const cacheKey = this.key("REALTIME", `${type}:${identifier}`);
    const data = await this.get(cacheKey);

    // Check if data is fresh (less than TTL)
    if (data && Date.now() - data.timestamp < this.defaultTTL.REALTIME * 1000) {
      return data;
    }

    return null;
  }

  // GMP cache operations
  async cacheGMPData(ipoId, gmpData) {
    const cacheKey = this.key("GMP", `data:${ipoId}`);
    return this.set(cacheKey, gmpData, this.defaultTTL.GMP_DATA);
  }

  async getCachedGMPData(ipoId) {
    const cacheKey = this.key("GMP", `data:${ipoId}`);
    return this.get(cacheKey);
  }

  async cacheLiveGMP(ipoId, gmpValue) {
    const cacheKey = this.key("GMP", `live:${ipoId}`);
    const gmpData = {
      value: gmpValue,
      timestamp: Date.now(),
      cached_at: new Date().toISOString(),
    };

    // Store with short TTL for real-time updates
    return this.set(cacheKey, gmpData, 30);
  }

  async getCachedLiveGMP(ipoId) {
    const cacheKey = this.key("GMP", `live:${ipoId}`);
    return this.get(cacheKey);
  }

  // Subscription data cache
  async cacheSubscriptionData(symbol, data) {
    const cacheKey = this.key("SUBSCRIPTION", `data:${symbol}`);
    return this.set(cacheKey, data, this.defaultTTL.SUBSCRIPTION);
  }

  async getCachedSubscriptionData(symbol) {
    const cacheKey = this.key("SUBSCRIPTION", `data:${symbol}`);
    return this.get(cacheKey);
  }

  // Market demand cache
  async cacheDemandData(symbol, data) {
    const cacheKey = this.key("DEMAND", `data:${symbol}`);
    return this.set(cacheKey, data, this.defaultTTL.DEMAND);
  }

  async getCachedDemandData(symbol) {
    const cacheKey = this.key("DEMAND", `data:${symbol}`);
    return this.get(cacheKey);
  }

  // Allotment cache
  async cacheAllotmentStatus(panNumber, applicationNumber, data) {
    const cacheKey = this.key(
      "ALLOTMENT",
      `status:${panNumber}:${applicationNumber}`
    );
    return this.set(cacheKey, data, this.defaultTTL.ALLOTMENT);
  }

  async getCachedAllotmentStatus(panNumber, applicationNumber) {
    const cacheKey = this.key(
      "ALLOTMENT",
      `status:${panNumber}:${applicationNumber}`
    );
    return this.get(cacheKey);
  }

  // User session cache
  async cacheUserSession(userId, sessionData) {
    const cacheKey = this.key("USER", `session:${userId}`);
    return this.set(cacheKey, sessionData, this.defaultTTL.USER_SESSION);
  }

  async getCachedUserSession(userId) {
    const cacheKey = this.key("USER", `session:${userId}`);
    return this.get(cacheKey);
  }

  // API response cache
  async cacheAPIResponse(endpoint, params, data) {
    const paramKey = Object.keys(params)
      .sort()
      .map((k) => `${k}:${params[k]}`)
      .join("|");
    const cacheKey = this.key("API", `${endpoint}:${paramKey}`);
    return this.set(cacheKey, data, this.defaultTTL.API_RESPONSE);
  }

  async getCachedAPIResponse(endpoint, params) {
    const paramKey = Object.keys(params)
      .sort()
      .map((k) => `${k}:${params[k]}`)
      .join("|");
    const cacheKey = this.key("API", `${endpoint}:${paramKey}`);
    return this.get(cacheKey);
  }

  // Search results cache
  async cacheSearchResults(query, results) {
    const cacheKey = this.key("SEARCH", `query:${query.toLowerCase()}`);
    return this.set(cacheKey, results, this.defaultTTL.SEARCH);
  }

  async getCachedSearchResults(query) {
    const cacheKey = this.key("SEARCH", `query:${query.toLowerCase()}`);
    return this.get(cacheKey);
  }

  // Analytics cache
  async cacheAnalytics(type, identifier, data) {
    const cacheKey = this.key("ANALYTICS", `${type}:${identifier}`);
    return this.set(cacheKey, data, this.defaultTTL.ANALYTICS);
  }

  async getCachedAnalytics(type, identifier) {
    const cacheKey = this.key("ANALYTICS", `${type}:${identifier}`);
    return this.get(cacheKey);
  }

  // Batch operations
  async mget(keys) {
    try {
      return await this.redis.mget(...keys);
    } catch (error) {
      console.error("Cache mget error:", error);

      // Fallback to individual gets from memory cache
      const results = [];
      for (const key of keys) {
        const memoryData = this.memoryCache.get(key);
        if (memoryData && memoryData.expiresAt > Date.now()) {
          results.push(memoryData.value);
        } else {
          results.push(null);
        }
      }
      return results;
    }
  }

  async mset(keyValuePairs) {
    try {
      const pairs = [];
      for (const [key, value] of keyValuePairs) {
        pairs.push(
          key,
          typeof value === "string" ? value : JSON.stringify(value)
        );
        // Also set in memory cache
        this.setMemoryCache(key, value);
      }
      return await this.redis.mset(...pairs);
    } catch (error) {
      console.error("Cache mset error:", error);

      // Fallback to memory cache only
      for (const [key, value] of keyValuePairs) {
        this.setMemoryCache(key, value);
      }
      return false;
    }
  }

  // Cache invalidation
  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        // Delete from Redis
        const redisResult = await this.redis.del(...keys);

        // Delete from memory cache
        for (const key of keys) {
          if (this.memoryCache.has(key)) {
            this.memoryCache.delete(key);
            this.memoryCacheSize--;
          }
        }

        return redisResult;
      }
      return 0;
    } catch (error) {
      console.error("Cache invalidation error:", error);

      // Try to clear memory cache patterns (simple string matching)
      let cleared = 0;
      for (const [key] of this.memoryCache) {
        if (key.includes(pattern.replace("*", ""))) {
          this.memoryCache.delete(key);
          this.memoryCacheSize--;
          cleared++;
        }
      }
      return cleared;
    }
  }

  async invalidateIPOCache(ipoId) {
    const patterns = [
      this.key("IPO", `detail:${ipoId}`),
      this.key("IPO", "list:*"),
      this.key("GMP", `*:${ipoId}`),
      this.key("SUBSCRIPTION", `*:${ipoId}`),
      this.key("DEMAND", `*:${ipoId}`),
      this.key("REALTIME", `*:${ipoId}`),
    ];

    const results = await Promise.allSettled(
      patterns.map((pattern) => this.invalidatePattern(pattern))
    );
    return results.every((result) => result.status === "fulfilled");
  }

  // Performance monitoring
  async getCacheStats() {
    try {
      const redisInfo = await this.redis.info();
      const hitRate =
        this.metrics.operations > 0
          ? ((this.metrics.hits / this.metrics.operations) * 100).toFixed(2)
          : "0.00";

      return {
        connected: true,
        redis: {
          memory: redisInfo.match(/used_memory_human:(.+)/)?.[1]?.trim(),
          keys: redisInfo.match(/db0:keys=(\d+)/)?.[1],
          hits: redisInfo.match(/keyspace_hits:(\d+)/)?.[1],
          misses: redisInfo.match(/keyspace_misses:(\d+)/)?.[1],
        },
        local: {
          hitRate: `${hitRate}%`,
          totalOperations: this.metrics.operations,
          hits: this.metrics.hits,
          misses: this.metrics.misses,
          errors: this.metrics.errors,
          memoryCacheSize: this.memoryCacheSize,
          memoryCacheLimit: this.maxMemoryCache,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const hitRate =
        this.metrics.operations > 0
          ? ((this.metrics.hits / this.metrics.operations) * 100).toFixed(2)
          : "0.00";

      return {
        connected: false,
        error: error.message,
        local: {
          hitRate: `${hitRate}%`,
          totalOperations: this.metrics.operations,
          hits: this.metrics.hits,
          misses: this.metrics.misses,
          errors: this.metrics.errors,
          memoryCacheSize: this.memoryCacheSize,
          memoryCacheLimit: this.maxMemoryCache,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Cache warming for frequently accessed data
  async warmCache() {
    try {
      console.log("🔥 Starting cache warm-up...");

      // Cache active IPOs
      const activeIPOs = await prisma.iPO.findMany({
        where: {
          status: { in: ["open", "upcoming"] },
          isActive: true,
        },
        include: {
          gmp: { take: 10, orderBy: { timestamp: "desc" } },
          subscription: { take: 5, orderBy: { timestamp: "desc" } },
          analytics: true,
        },
      });

      const cachePromises = activeIPOs.map((ipo) =>
        this.cacheIPODetail(ipo.id, ipo)
      );

      await Promise.all(cachePromises);

      // Cache IPO list with common filters
      await this.cacheIPOList(
        activeIPOs.filter((ipo) => ipo.status === "open"),
        { status: "open" }
      );
      await this.cacheIPOList(
        activeIPOs.filter((ipo) => ipo.status === "upcoming"),
        { status: "upcoming" }
      );

      console.log(`🔥 Cache warmed with ${activeIPOs.length} active IPOs`);
      return true;
    } catch (error) {
      console.error("Cache warm-up failed:", error);
      return false;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const testKey = "health_check";
      const testValue = Date.now().toString();
      await this.set(testKey, testValue, 10);
      const retrieved = await this.get(testKey);
      await this.del(testKey);

      const isHealthy = retrieved === testValue;
      return {
        status: isHealthy ? "healthy" : "degraded",
        redis: isHealthy,
        memoryCache: this.memoryCacheSize < this.maxMemoryCache,
        metrics: this.metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Cache health check failed:", error);
      return {
        status: "unhealthy",
        redis: false,
        memoryCache: this.memoryCacheSize < this.maxMemoryCache,
        error: error.message,
        metrics: this.metrics,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Clean expired entries from memory cache
  cleanExpiredMemoryCache() {
    const now = Date.now();
    const toDelete = [];

    for (const [key, data] of this.memoryCache) {
      if (data.expiresAt <= now) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.memoryCache.delete(key);
      this.memoryCacheSize--;
    }

    return toDelete.length;
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      operations: 0,
    };
  }

  // Get cache size info
  getCacheSize() {
    return {
      memoryCache: this.memoryCacheSize,
      maxMemoryCache: this.maxMemoryCache,
      utilizationPercent: (
        (this.memoryCacheSize / this.maxMemoryCache) *
        100
      ).toFixed(2),
    };
  }
}

// Export singleton instance
export const cache = new CacheService();

// Utility middleware for cache management
export const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    const cacheKey = cache.key(
      "API",
      `${req.path}:${JSON.stringify(req.query)}`
    );

    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          cacheTimestamp: new Date().toISOString(),
        });
      }

      // Store original res.json
      const originalJson = res.json;
      // Override res.json to cache the response
      res.json = function (data) {
        cache.set(cacheKey, data, ttl);
        return originalJson.call(this, data);
      };
      next();
    } catch (error) {
      console.error("Cache middleware error:", error);
      next();
    }
  };
};

// Middleware to invalidate cache on updates
export const invalidateCacheOnUpdate = (patterns) => {
  return async (req, res, next) => {
    // Store original response methods
    const originalJson = res.json;
    const originalSend = res.send;

    const cleanup = async (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Success response, invalidate cache
        await Promise.all(
          patterns.map((pattern) => cache.invalidatePattern(pattern))
        );
      }
      return data;
    };

    res.json = function (data) {
      cleanup(data);
      return originalJson.call(this, data);
    };

    res.send = function (data) {
      cleanup(data);
      return originalSend.call(this, data);
    };

    next();
  };
};

// Auto-cleanup expired memory cache entries every 5 minutes
setInterval(
  () => {
    const cleaned = cache.cleanExpiredMemoryCache();
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired memory cache entries`);
    }
  },
  5 * 60 * 1000
);

// Periodic cache warming (every hour)
setInterval(
  async () => {
    try {
      await cache.warmCache();
    } catch (error) {
      console.error("Scheduled cache warming failed:", error);
    }
  },
  60 * 60 * 1000
);

export default cache;
