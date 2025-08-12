import { Server } from "socket.io";
import { createServer } from "http";
import { cache } from "./cache.js";
import { prisma } from "./db.js";

class WebSocketService {
  constructor() {
    this.io = null;
    this.server = null;
    this.connectedClients = new Map();
    this.roomSubscriptions = new Map();
    this.port = process.env.WEBSOCKET_PORT || 3001;

    // Event types for real-time updates
    this.events = {
      IPO_UPDATE: "ipo:update",
      GMP_UPDATE: "gmp:update",
      SUBSCRIPTION_UPDATE: "subscription:update",
      DEMAND_UPDATE: "demand:update",
      ALLOTMENT_UPDATE: "allotment:update",
      SYSTEM_STATUS: "system:status",
      ANALYTICS_UPDATE: "analytics:update",
      NEWS_UPDATE: "news:update",
      ALERT_TRIGGERED: "alert:triggered",
    };

    // Rate limiting configuration
    this.rateLimits = new Map();
    this.maxEventsPerSecond = 20;
    this.maxSubscriptionsPerClient = 100;

    // Performance monitoring
    this.metrics = {
      totalConnections: 0,
      currentConnections: 0,
      totalMessages: 0,
      totalSubscriptions: 0,
      errors: 0,
      startTime: Date.now(),
      averageResponseTime: 0,
      peakConnections: 0,
    };

    // Connection health tracking
    this.connectionHealth = new Map();

    // Message queue for offline clients
    this.messageQueue = new Map();
    this.maxQueueSize = 50;
  }

  // Initialize WebSocket server with enhanced configuration
  initialize() {
    try {
      this.server = createServer();
      this.io = new Server(this.server, {
        cors: {
          origin: process.env.FRONTEND_URL || "http://localhost:3000",
          methods: ["GET", "POST"],
          credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 2e6, // 2MB
        transports: ["websocket", "polling"],
        allowEIO3: true,
        // Connection rate limiting
        connectTimeout: 45000,
        upgradeTimeout: 10000,
      });

      this.setupEventHandlers();
      this.startHeartbeat();
      this.startMetricsCollection();
      this.startHealthMonitoring();

      console.log("🔌 WebSocket service initialized successfully");
      return this;
    } catch (error) {
      console.error("❌ Failed to initialize WebSocket service:", error);
      throw error;
    }
  }

  // Start the WebSocket server
  async start() {
    try {
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🚀 WebSocket server running on port ${this.port}`);
            console.log(
              `🌐 Accepting connections from: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
            );
            resolve();
          }
        });
      });

      // Start periodic cleanup
      this.startPeriodicCleanup();
    } catch (error) {
      console.error("❌ Failed to start WebSocket server:", error);
      throw error;
    }
  }

  // Enhanced event handlers
  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      this.handleClientConnection(socket);
      this.setupClientEventListeners(socket);

      // Track metrics
      this.metrics.totalConnections++;
      this.metrics.currentConnections++;
      this.metrics.peakConnections = Math.max(
        this.metrics.peakConnections,
        this.metrics.currentConnections
      );
    });

    // Handle server errors
    this.io.on("error", (error) => {
      console.error("🔌 WebSocket server error:", error);
      this.metrics.errors++;
    });
  }

  handleClientConnection(socket) {
    const clientIP = socket.handshake.address;
    const userAgent = socket.handshake.headers["user-agent"] || "Unknown";

    console.log(`🔌 Client connected: ${socket.id} from ${clientIP}`);

    const clientInfo = {
      socket,
      connectedAt: new Date(),
      subscriptions: new Set(),
      lastActivity: new Date(),
      subscriptionCount: 0,
      messageCount: 0,
      userAgent,
      ipAddress: clientIP,
      isHealthy: true,
      lastPing: Date.now(),
      reconnectCount: 0,
    };

    this.connectedClients.set(socket.id, clientInfo);
    this.connectionHealth.set(socket.id, {
      status: "connected",
      latency: 0,
      lastSeen: Date.now(),
    });

    // Send connection confirmation with server info
    socket.emit("connected", {
      socketId: socket.id,
      timestamp: Date.now(),
      serverVersion: "1.0.0",
      availableEvents: Object.values(this.events),
      maxSubscriptions: this.maxSubscriptionsPerClient,
      rateLimits: {
        maxEventsPerSecond: this.maxEventsPerSecond,
      },
      features: {
        realTimeUpdates: true,
        batchSubscriptions: true,
        messageQueue: true,
        analytics: true,
      },
    });

    // Send queued messages if any
    this.sendQueuedMessages(socket.id);
  }

  setupClientEventListeners(socket) {
    // IPO subscription with enhanced features
    socket.on("subscribe:ipo", async (data) => {
      await this.handleSubscription(socket, "ipo", data, async () => {
        const { ipoId, symbol, includeAnalytics = false } = data;

        if (ipoId) {
          socket.join(`ipo:${ipoId}`);
          this.addSubscription(socket.id, "ipo", ipoId);

          // Send current data immediately
          const ipoData = await this.getCurrentIPOData(ipoId);
          if (ipoData) {
            socket.emit(this.events.IPO_UPDATE, {
              ipoId,
              data: ipoData,
              type: "initial_data",
              timestamp: Date.now(),
            });

            // Send analytics if requested
            if (includeAnalytics && ipoData.analytics) {
              socket.emit(this.events.ANALYTICS_UPDATE, {
                ipoId,
                data: ipoData.analytics,
                type: "initial_analytics",
                timestamp: Date.now(),
              });
            }
          }
        }
      });
    });

    // Enhanced GMP subscription
    socket.on("subscribe:gmp", async (data) => {
      await this.handleSubscription(socket, "gmp", data, async () => {
        const {
          ipoId,
          symbol,
          historical = false,
          alertThreshold = null,
        } = data;

        if (ipoId) {
          socket.join(`gmp:${ipoId}`);
          this.addSubscription(socket.id, "gmp", ipoId);

          // Send current GMP data
          const gmpData = await cache.getRealTimeData("GMP", ipoId);
          if (gmpData) {
            socket.emit(this.events.GMP_UPDATE, {
              ipoId,
              data: gmpData,
              type: "current",
              timestamp: Date.now(),
            });
          }

          // Send historical data if requested
          if (historical) {
            const historicalGMP = await this.getHistoricalGMPData(ipoId, 30);
            socket.emit("gmp:historical", {
              ipoId,
              data: historicalGMP,
              type: "historical",
              days: 30,
            });
          }

          // Set up alert threshold if provided
          if (alertThreshold !== null) {
            this.setupGMPAlert(socket.id, ipoId, alertThreshold);
          }
        }
      });
    });

    // Real-time subscription data updates
    socket.on("subscribe:subscription", async (data) => {
      await this.handleSubscription(socket, "subscription", data, async () => {
        const { symbol, categories = [], realTime = true } = data;

        socket.join(`subscription:${symbol}`);
        this.addSubscription(socket.id, "subscription", symbol);

        // Send current subscription data
        const subData = await cache.getRealTimeData("SUBSCRIPTION", symbol);
        if (subData) {
          const filteredData =
            categories.length > 0
              ? subData.data?.filter((item) =>
                  categories.includes(item.category)
                )
              : subData;

          socket.emit(this.events.SUBSCRIPTION_UPDATE, {
            symbol,
            data: filteredData,
            categories: categories.length > 0 ? categories : "all",
            timestamp: Date.now(),
          });
        }
      });
    });

    // Market demand updates with price filtering
    socket.on("subscribe:demand", async (data) => {
      await this.handleSubscription(socket, "demand", data, async () => {
        const { symbol, priceRange = null, cutOffOnly = false } = data;

        socket.join(`demand:${symbol}`);
        this.addSubscription(socket.id, "demand", symbol);

        // Send current demand data
        const demandData = await cache.getRealTimeData("DEMAND", symbol);
        if (demandData) {
          let filteredData = demandData.data || [];

          // Apply filters
          if (cutOffOnly) {
            filteredData = filteredData.filter((item) => item.cutOffIndicator);
          }

          if (
            priceRange &&
            priceRange.min !== undefined &&
            priceRange.max !== undefined
          ) {
            filteredData = filteredData.filter(
              (item) =>
                item.price >= priceRange.min && item.price <= priceRange.max
            );
          }

          socket.emit(this.events.DEMAND_UPDATE, {
            symbol,
            data: filteredData,
            filters: { priceRange, cutOffOnly },
            timestamp: Date.now(),
          });
        }
      });
    });

    // Analytics subscription with customizable metrics
    socket.on("subscribe:analytics", async (data) => {
      await this.handleSubscription(socket, "analytics", data, async () => {
        const {
          ipoId,
          type = "all",
          metrics = [],
          updateInterval = 30000,
        } = data;

        socket.join(`analytics:${ipoId}`);
        this.addSubscription(socket.id, "analytics", ipoId);

        // Send current analytics
        const analytics = await this.getCurrentAnalytics(ipoId, type);
        if (analytics) {
          const filteredAnalytics =
            metrics.length > 0
              ? this.filterAnalyticsByMetrics(analytics, metrics)
              : analytics;

          socket.emit(this.events.ANALYTICS_UPDATE, {
            ipoId,
            type,
            data: filteredAnalytics,
            metrics: metrics.length > 0 ? metrics : "all",
            timestamp: Date.now(),
          });
        }
      });
    });

    // System status subscription
    socket.on("subscribe:system", async () => {
      socket.join("system:status");
      this.addSubscription(socket.id, "system", "status");

      // Send current system status
      const systemStatus = await this.getSystemStatus();
      socket.emit(this.events.SYSTEM_STATUS, {
        ...systemStatus,
        type: "current_status",
        timestamp: Date.now(),
      });
    });

    // Batch subscription for multiple IPOs with advanced options
    socket.on("subscribe:batch", async (data) => {
      const { subscriptions = [], options = {} } = data;
      const { maxSubscriptions = 20, skipErrors = true } = options;
      const results = [];

      // Limit batch size
      const limitedSubscriptions = subscriptions.slice(0, maxSubscriptions);

      for (const sub of limitedSubscriptions) {
        try {
          await this.handleSingleSubscription(socket, sub);
          results.push({ ...sub, status: "success" });
        } catch (error) {
          results.push({ ...sub, status: "error", error: error.message });
          if (!skipErrors) {
            break;
          }
        }
      }

      socket.emit("subscribe:batch:result", {
        results,
        processed: results.length,
        successful: results.filter((r) => r.status === "success").length,
        errors: results.filter((r) => r.status === "error").length,
        timestamp: Date.now(),
      });
    });

    // Enhanced unsubscribe with patterns
    socket.on("unsubscribe", (data) => {
      const { type, identifier, pattern } = data;

      if (pattern === "all") {
        this.unsubscribeAll(socket.id);
        socket.emit("unsubscribe:result", {
          pattern: "all",
          status: "success",
          message: "Unsubscribed from all events",
        });
      } else if (type && identifier) {
        const roomKey = `${type}:${identifier}`;
        socket.leave(roomKey);
        this.removeSubscription(socket.id, type, identifier);
        socket.emit("unsubscribe:result", {
          type,
          identifier,
          status: "success",
        });
      } else if (type) {
        // Unsubscribe from all subscriptions of a specific type
        this.unsubscribeByType(socket.id, type);
        socket.emit("unsubscribe:result", {
          type,
          status: "success",
          message: `Unsubscribed from all ${type} events`,
        });
      }
    });

    // Enhanced heartbeat with performance metrics
    socket.on("ping", (data) => {
      const client = this.connectedClients.get(socket.id);
      const now = Date.now();

      if (client) {
        client.lastActivity = new Date();
        client.messageCount++;
        client.lastPing = now;
      }

      // Calculate latency
      const latency = data?.timestamp ? now - data.timestamp : 0;
      this.connectionHealth.set(socket.id, {
        status: "healthy",
        latency,
        lastSeen: now,
      });

      socket.emit("pong", {
        timestamp: now,
        serverUptime: now - this.metrics.startTime,
        latency,
        clientInfo: client
          ? {
              subscriptions: client.subscriptionCount,
              messages: client.messageCount,
              connectedFor: now - client.connectedAt.getTime(),
            }
          : null,
      });
    });

    // Client info and statistics request
    socket.on("client:info", () => {
      const client = this.connectedClients.get(socket.id);
      const health = this.connectionHealth.get(socket.id);

      if (client) {
        socket.emit("client:info", {
          socketId: socket.id,
          connectedAt: client.connectedAt,
          subscriptions: Array.from(client.subscriptions),
          subscriptionCount: client.subscriptionCount,
          messageCount: client.messageCount,
          userAgent: client.userAgent,
          ipAddress: client.ipAddress,
          health: health || { status: "unknown" },
          serverMetrics: {
            totalConnections: this.metrics.currentConnections,
            serverUptime: Date.now() - this.metrics.startTime,
          },
        });
      }
    });

    // Request server statistics
    socket.on("server:stats", () => {
      if (this.isAuthorized(socket)) {
        // Only for authorized clients
        const stats = this.getDetailedStats();
        socket.emit("server:stats", stats);
      } else {
        socket.emit("error", {
          type: "unauthorized",
          message: "Not authorized to view server statistics",
        });
      }
    });

    // Error handling
    socket.on("error", (error) => {
      console.error(`🔌 Socket error for ${socket.id}:`, error);
      this.metrics.errors++;

      const client = this.connectedClients.get(socket.id);
      if (client) {
        client.isHealthy = false;
      }

      this.connectionHealth.set(socket.id, {
        status: "error",
        error: error.message,
        lastSeen: Date.now(),
      });
    });

    // Disconnect handling with cleanup
    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);

      const client = this.connectedClients.get(socket.id);
      if (client) {
        // Store disconnection info for potential reconnection
        this.handleClientDisconnection(socket.id, reason);
      }

      this.cleanupClient(socket.id);
      this.metrics.currentConnections--;
    });

    // Reconnection handling
    socket.on("reconnect", (data) => {
      console.log(`🔄 Client reconnected: ${socket.id}`);
      const client = this.connectedClients.get(socket.id);
      if (client) {
        client.reconnectCount++;
        client.lastActivity = new Date();

        // Send queued messages
        this.sendQueuedMessages(socket.id);
      }
    });
  }

  // Enhanced subscription handling with validation
  async handleSubscription(socket, type, data, subscriptionLogic) {
    try {
      const client = this.connectedClients.get(socket.id);

      if (!client) {
        throw new Error("Client not found");
      }

      // Check subscription limits
      if (client.subscriptionCount >= this.maxSubscriptionsPerClient) {
        throw new Error(
          `Maximum subscriptions limit reached (${this.maxSubscriptionsPerClient})`
        );
      }

      // Check rate limits
      if (!this.checkRateLimit(socket.id, type)) {
        throw new Error("Rate limit exceeded. Please slow down.");
      }

      // Validate subscription data
      this.validateSubscriptionData(type, data);

      // Execute subscription logic
      await subscriptionLogic();

      // Update client info
      client.lastActivity = new Date();
      client.messageCount++;

      // Send success confirmation
      socket.emit("subscribe:success", {
        type,
        data,
        timestamp: Date.now(),
        subscriptionCount: client.subscriptionCount,
      });
    } catch (error) {
      console.error(`Subscription failed for ${socket.id}:`, error.message);
      socket.emit("subscribe:error", {
        type: "subscription_failed",
        message: error.message,
        subscriptionType: type,
        data,
        timestamp: Date.now(),
      });
    }
  }

  // Validate subscription data
  validateSubscriptionData(type, data) {
    switch (type) {
      case "ipo":
        if (!data.ipoId && !data.symbol) {
          throw new Error(
            "Either ipoId or symbol is required for IPO subscription"
          );
        }
        break;
      case "gmp":
        if (!data.ipoId && !data.symbol) {
          throw new Error(
            "Either ipoId or symbol is required for GMP subscription"
          );
        }
        break;
      case "subscription":
      case "demand":
        if (!data.symbol) {
          throw new Error("Symbol is required for subscription/demand data");
        }
        break;
      case "analytics":
        if (!data.ipoId) {
          throw new Error("IPO ID is required for analytics subscription");
        }
        break;
    }
  }

  // Handle single subscription (for batch operations)
  async handleSingleSubscription(
    socket,
    { type, ipoId, symbol, options = {} }
  ) {
    switch (type) {
      case "ipo":
        if (ipoId) {
          socket.join(`ipo:${ipoId}`);
          this.addSubscription(socket.id, "ipo", ipoId);
        }
        break;
      case "gmp":
        if (ipoId) {
          socket.join(`gmp:${ipoId}`);
          this.addSubscription(socket.id, "gmp", ipoId);
        }
        break;
      case "subscription":
        if (symbol) {
          socket.join(`subscription:${symbol}`);
          this.addSubscription(socket.id, "subscription", symbol);
        }
        break;
      case "demand":
        if (symbol) {
          socket.join(`demand:${symbol}`);
          this.addSubscription(socket.id, "demand", symbol);
        }
        break;
      case "analytics":
        if (ipoId) {
          socket.join(`analytics:${ipoId}`);
          this.addSubscription(socket.id, "analytics", ipoId);
        }
        break;
      default:
        throw new Error(`Unknown subscription type: ${type}`);
    }
  }

  // Enhanced rate limiting
  checkRateLimit(socketId, eventType) {
    const key = `${socketId}:${eventType}`;
    const now = Date.now();
    const windowStart = Math.floor(now / 1000) * 1000;

    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, { count: 0, windowStart });
    }

    const limit = this.rateLimits.get(key);

    if (limit.windowStart !== windowStart) {
      limit.count = 0;
      limit.windowStart = windowStart;
    }

    if (limit.count >= this.maxEventsPerSecond) {
      return false;
    }

    limit.count++;
    return true;
  }

  // Subscription management
  addSubscription(socketId, type, identifier) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      const subscriptionKey = `${type}:${identifier}`;
      client.subscriptions.add(subscriptionKey);
      client.subscriptionCount = client.subscriptions.size;

      // Track room subscriptions
      if (!this.roomSubscriptions.has(subscriptionKey)) {
        this.roomSubscriptions.set(subscriptionKey, new Set());
      }
      this.roomSubscriptions.get(subscriptionKey).add(socketId);

      this.metrics.totalSubscriptions++;
    }
  }

  removeSubscription(socketId, type, identifier) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      const subscriptionKey = `${type}:${identifier}`;
      client.subscriptions.delete(subscriptionKey);
      client.subscriptionCount = client.subscriptions.size;

      // Remove from room subscriptions
      const roomSubs = this.roomSubscriptions.get(subscriptionKey);
      if (roomSubs) {
        roomSubs.delete(socketId);
        if (roomSubs.size === 0) {
          this.roomSubscriptions.delete(subscriptionKey);
        }
      }
    }
  }

  unsubscribeAll(socketId) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      for (const subscription of client.subscriptions) {
        const [type, identifier] = subscription.split(":");
        client.socket.leave(subscription);
        this.removeSubscription(socketId, type, identifier);
      }
    }
  }

  unsubscribeByType(socketId, type) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      const subscriptionsToRemove = Array.from(client.subscriptions).filter(
        (sub) => sub.startsWith(`${type}:`)
      );

      for (const subscription of subscriptionsToRemove) {
        const [, identifier] = subscription.split(":");
        client.socket.leave(subscription);
        this.removeSubscription(socketId, type, identifier);
      }
    }
  }

  // Enhanced broadcasting methods
  async broadcastIPOUpdate(ipoId, updateData, options = {}) {
    try {
      const {
        priority = "normal",
        excludeSocket = null,
        includeAnalytics = false,
      } = options;

      if (!this.checkBroadcastRateLimit("ipo", ipoId)) {
        return;
      }

      const room = `ipo:${ipoId}`;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const enrichedData = {
          ipoId,
          data: updateData,
          timestamp: Date.now(),
          priority,
          server: process.env.SERVER_ID || "ws-1",
          type: "update",
        };

        if (includeAnalytics && updateData.analytics) {
          enrichedData.analytics = updateData.analytics;
        }

        if (excludeSocket) {
          this.io
            .to(room)
            .except(excludeSocket)
            .emit(this.events.IPO_UPDATE, enrichedData);
        } else {
          this.io.to(room).emit(this.events.IPO_UPDATE, enrichedData);
        }

        console.log(
          `📡 IPO update broadcast to ${subscriberCount} clients for IPO ${ipoId}`
        );
        this.metrics.totalMessages++;

        // Queue message for offline clients if critical
        if (priority === "high") {
          this.queueMessageForOfflineClients(room, enrichedData);
        }
      }
    } catch (error) {
      console.error("Error broadcasting IPO update:", error);
      this.metrics.errors++;
    }
  }

  async broadcastGMPUpdate(ipoId, gmpData, options = {}) {
    try {
      const { historical = false, alertCheck = true } = options;

      if (!this.checkBroadcastRateLimit("gmp", ipoId)) {
        return;
      }

      const room = `gmp:${ipoId}`;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const change = await this.calculateGMPChange(ipoId, gmpData.value);
        const enrichedData = {
          ipoId,
          data: gmpData,
          timestamp: Date.now(),
          historical,
          change,
          trend: this.calculateGMPTrend(change),
          volatility: await this.calculateGMPVolatility(ipoId),
        };

        this.io.to(room).emit(this.events.GMP_UPDATE, enrichedData);
        console.log(
          `💰 GMP update broadcast to ${subscriberCount} clients for IPO ${ipoId} (Value: ${gmpData.value})`
        );
        this.metrics.totalMessages++;

        // Check for GMP alerts
        if (alertCheck) {
          this.checkGMPAlerts(ipoId, gmpData.value);
        }
      }
    } catch (error) {
      console.error("Error broadcasting GMP update:", error);
      this.metrics.errors++;
    }
  }

  async broadcastSubscriptionUpdate(symbol, subscriptionData, options = {}) {
    try {
      const { category = null, alertOnOversubscription = true } = options;

      if (!this.checkBroadcastRateLimit("subscription", symbol)) {
        return;
      }

      const room = `subscription:${symbol}`;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const enrichedData = {
          symbol,
          data: subscriptionData,
          timestamp: Date.now(),
          category,
          overallSubscription:
            this.calculateOverallSubscription(subscriptionData),
          isOversubscribed: this.isOversubscribed(subscriptionData),
        };

        this.io.to(room).emit(this.events.SUBSCRIPTION_UPDATE, enrichedData);
        console.log(
          `📊 Subscription update broadcast to ${subscriberCount} clients for ${symbol}`
        );
        this.metrics.totalMessages++;

        // Alert on oversubscription
        if (alertOnOversubscription && enrichedData.isOversubscribed) {
          this.broadcastAlert("oversubscription", {
            symbol,
            subscription: enrichedData.overallSubscription,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error("Error broadcasting subscription update:", error);
      this.metrics.errors++;
    }
  }

  async broadcastDemandUpdate(symbol, demandData, options = {}) {
    try {
      const { priceLevel = null } = options;

      if (!this.checkBroadcastRateLimit("demand", symbol)) {
        return;
      }

      const room = `demand:${symbol}`;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const enrichedData = {
          symbol,
          data: demandData,
          timestamp: Date.now(),
          priceLevel,
          totalDemand: this.calculateTotalDemand(demandData),
          cutOffDemand: this.calculateCutOffDemand(demandData),
        };

        this.io.to(room).emit(this.events.DEMAND_UPDATE, enrichedData);
        console.log(
          `📈 Demand update broadcast to ${subscriberCount} clients for ${symbol}`
        );
        this.metrics.totalMessages++;
      }
    } catch (error) {
      console.error("Error broadcasting demand update:", error);
      this.metrics.errors++;
    }
  }

  async broadcastAnalyticsUpdate(ipoId, analyticsData, options = {}) {
    try {
      const { type = "general", metrics = null } = options;

      if (!this.checkBroadcastRateLimit("analytics", ipoId)) {
        return;
      }

      const room = `analytics:${ipoId}`;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const enrichedData = {
          ipoId,
          type,
          data: analyticsData,
          metrics,
          timestamp: Date.now(),
          insights: await this.generateAnalyticsInsights(analyticsData),
        };

        this.io.to(room).emit(this.events.ANALYTICS_UPDATE, enrichedData);
        console.log(
          `📊 Analytics update broadcast to ${subscriberCount} clients for IPO ${ipoId}`
        );
        this.metrics.totalMessages++;
      }
    } catch (error) {
      console.error("Error broadcasting analytics update:", error);
      this.metrics.errors++;
    }
  }

  // Broadcast system status
  async broadcastSystemStatus(status, options = {}) {
    try {
      const { priority = "normal", room = "system:status" } = options;
      const subscriberCount = this.roomSubscriptions.get(room)?.size || 0;

      if (subscriberCount > 0) {
        const enrichedStatus = {
          ...status,
          timestamp: Date.now(),
          server: process.env.SERVER_ID || "ws-1",
          priority,
          connections: this.metrics.currentConnections,
        };

        this.io.to(room).emit(this.events.SYSTEM_STATUS, enrichedStatus);
        console.log(`🔔 System status broadcast to ${subscriberCount} clients`);
        this.metrics.totalMessages++;
      }
    } catch (error) {
      console.error("Error broadcasting system status:", error);
      this.metrics.errors++;
    }
  }

  // Broadcast alerts
  async broadcastAlert(alertType, alertData) {
    try {
      const enrichedAlert = {
        type: alertType,
        data: alertData,
        timestamp: Date.now(),
        server: process.env.SERVER_ID || "ws-1",
        severity: this.getAlertSeverity(alertType),
      };

      // Broadcast to all connected clients
      this.io.emit(this.events.ALERT_TRIGGERED, enrichedAlert);
      console.log(`🚨 Alert broadcast: ${alertType}`);
      this.metrics.totalMessages++;

      // Store alert for queuing
      this.queueMessageForOfflineClients("global", enrichedAlert);
    } catch (error) {
      console.error("Error broadcasting alert:", error);
      this.metrics.errors++;
    }
  }

  // Broadcast rate limiting
  checkBroadcastRateLimit(eventType, identifier) {
    const key = `broadcast:${eventType}:${identifier}`;
    const now = Date.now();
    const windowStart = Math.floor(now / 5000) * 5000; // 5-second window

    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, { count: 0, windowStart });
    }

    const limit = this.rateLimits.get(key);

    if (limit.windowStart !== windowStart) {
      limit.count = 0;
      limit.windowStart = windowStart;
    }

    // Max 10 broadcasts per 5 seconds per event type
    if (limit.count >= 10) {
      return false;
    }

    limit.count++;
    return true;
  }

  // Calculate GMP change and trend
  async calculateGMPChange(ipoId, currentValue) {
    try {
      if (!this.previousGMPValues) {
        this.previousGMPValues = new Map();
      }

      const previousValue = this.previousGMPValues.get(ipoId) || currentValue;
      this.previousGMPValues.set(ipoId, currentValue);

      return {
        absolute: currentValue - previousValue,
        percentage:
          previousValue > 0
            ? parseFloat(
                (
                  ((currentValue - previousValue) / previousValue) *
                  100
                ).toFixed(2)
              )
            : 0,
        direction:
          currentValue > previousValue
            ? "up"
            : currentValue < previousValue
              ? "down"
              : "stable",
      };
    } catch (error) {
      return { absolute: 0, percentage: 0, direction: "stable" };
    }
  }

  calculateGMPTrend(change) {
    if (Math.abs(change.percentage) < 1) return "stable";
    if (change.percentage > 5) return "bullish";
    if (change.percentage < -5) return "bearish";
    return change.direction;
  }

  async calculateGMPVolatility(ipoId) {
    try {
      const recentGMP = await prisma.gMP.findMany({
        where: { ipoId },
        orderBy: { timestamp: "desc" },
        take: 10,
      });

      if (recentGMP.length < 2) return 0;

      const values = recentGMP.map((g) => g.value);
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance =
        values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
        values.length;

      return Math.round(Math.sqrt(variance) * 100) / 100;
    } catch (error) {
      return 0;
    }
  }

  // Subscription calculation utilities
  calculateOverallSubscription(subscriptionData) {
    if (!Array.isArray(subscriptionData)) return 0;

    const ratios = subscriptionData.map((item) =>
      parseFloat(item.subscriptionRatio || 0)
    );
    return ratios.length > 0 ? Math.max(...ratios) : 0;
  }

  isOversubscribed(subscriptionData) {
    return this.calculateOverallSubscription(subscriptionData) > 1;
  }

  calculateTotalDemand(demandData) {
    if (!Array.isArray(demandData)) return 0;

    return demandData.reduce(
      (total, item) => total + parseInt(item.absoluteQuantity || 0),
      0
    );
  }

  calculateCutOffDemand(demandData) {
    if (!Array.isArray(demandData)) return 0;

    return demandData
      .filter((item) => item.cutOffIndicator)
      .reduce((total, item) => total + parseInt(item.absoluteQuantity || 0), 0);
  }

  // Generate analytics insights
  async generateAnalyticsInsights(analyticsData) {
    const insights = [];

    try {
      if (analyticsData.gmpVolatility > 20) {
        insights.push({
          type: "warning",
          message: "High GMP volatility detected",
          value: analyticsData.gmpVolatility,
        });
      }

      if (analyticsData.finalSubscription > 5) {
        insights.push({
          type: "positive",
          message: "Strong subscription demand",
          value: analyticsData.finalSubscription,
        });
      }

      if (analyticsData.riskScore > 70) {
        insights.push({
          type: "caution",
          message: "High risk score",
          value: analyticsData.riskScore,
        });
      }
    } catch (error) {
      console.error("Error generating insights:", error);
    }

    return insights;
  }

  // Data fetching methods
  async getCurrentIPOData(ipoId) {
    try {
      const ipo = await prisma.iPO.findUnique({
        where: { id: ipoId },
        include: {
          gmp: {
            take: 5,
            orderBy: { timestamp: "desc" },
          },
          subscription: {
            orderBy: { timestamp: "desc" },
            take: 10,
          },
          analytics: true,
          categories: true,
        },
      });

      return ipo;
    } catch (error) {
      console.error("Error fetching current IPO data:", error);
      return null;
    }
  }

  async getHistoricalGMPData(ipoId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const gmpData = await prisma.gMP.findMany({
        where: {
          ipoId,
          timestamp: {
            gte: startDate,
          },
        },
        orderBy: { timestamp: "asc" },
        take: 1000, // Limit for performance
      });

      return gmpData;
    } catch (error) {
      console.error("Error fetching historical GMP data:", error);
      return [];
    }
  }

  async getCurrentAnalytics(ipoId, type = "all") {
    try {
      const analytics = await prisma.iPOAnalytics.findUnique({
        where: { ipoId },
      });

      if (type === "all") {
        return analytics;
      }

      // Return specific analytics based on type
      const typeMapping = {
        gmp: ["avgGMP", "maxGMP", "minGMP", "gmpVolatility"],
        subscription: [
          "finalSubscription",
          "retailSubscription",
          "qibSubscription",
        ],
        prediction: [
          "predictedListingGain",
          "allotmentProbability",
          "riskScore",
        ],
      };

      if (typeMapping[type] && analytics) {
        const filteredAnalytics = {};
        typeMapping[type].forEach((key) => {
          if (analytics[key] !== undefined) {
            filteredAnalytics[key] = analytics[key];
          }
        });
        return filteredAnalytics;
      }

      return analytics;
    } catch (error) {
      console.error("Error fetching analytics:", error);
      return null;
    }
  }

  // System status
  async getSystemStatus() {
    try {
      const [dbHealth, cacheHealth] = await Promise.allSettled([
        prisma.$queryRaw`SELECT 1`,
        cache.healthCheck(),
      ]);

      return {
        status: "operational",
        connections: this.metrics.currentConnections,
        uptime: Date.now() - this.metrics.startTime,
        database: dbHealth.status === "fulfilled" ? "healthy" : "degraded",
        cache:
          cacheHealth.status === "fulfilled" &&
          cacheHealth.value.status === "healthy"
            ? "healthy"
            : "degraded",
        websocket: "healthy",
        version: "1.0.0",
      };
    } catch (error) {
      return {
        status: "degraded",
        error: error.message,
        uptime: Date.now() - this.metrics.startTime,
      };
    }
  }

  // Filter analytics by specific metrics
  filterAnalyticsByMetrics(analytics, metrics) {
    if (!analytics || !Array.isArray(metrics)) return analytics;

    const filtered = {};
    metrics.forEach((metric) => {
      if (analytics[metric] !== undefined) {
        filtered[metric] = analytics[metric];
      }
    });

    return filtered;
  }

  // GMP Alert management
  setupGMPAlert(socketId, ipoId, threshold) {
    if (!this.gmpAlerts) {
      this.gmpAlerts = new Map();
    }

    const alertKey = `${socketId}:${ipoId}`;
    this.gmpAlerts.set(alertKey, {
      threshold,
      triggered: false,
      createdAt: Date.now(),
    });
  }

  checkGMPAlerts(ipoId, currentGMP) {
    if (!this.gmpAlerts) return;

    for (const [alertKey, alert] of this.gmpAlerts) {
      const [socketId, alertIpoId] = alertKey.split(":");

      if (alertIpoId === ipoId && !alert.triggered) {
        if (currentGMP >= alert.threshold) {
          const client = this.connectedClients.get(socketId);
          if (client) {
            client.socket.emit(this.events.ALERT_TRIGGERED, {
              type: "gmp_threshold",
              ipoId,
              threshold: alert.threshold,
              currentValue: currentGMP,
              timestamp: Date.now(),
            });

            alert.triggered = true;
            console.log(
              `🚨 GMP alert triggered for ${socketId}: ${ipoId} reached ${currentGMP}`
            );
          }
        }
      }
    }
  }

  // Get alert severity
  getAlertSeverity(alertType) {
    const severityMap = {
      gmp_threshold: "medium",
      oversubscription: "high",
      system_error: "critical",
      connection_issue: "low",
      rate_limit: "medium",
    };

    return severityMap[alertType] || "low";
  }

  // Message queuing for offline clients
  queueMessageForOfflineClients(room, message) {
    if (!this.messageQueue.has(room)) {
      this.messageQueue.set(room, []);
    }

    const queue = this.messageQueue.get(room);
    queue.push({
      message,
      timestamp: Date.now(),
    });

    // Keep only the latest messages
    if (queue.length > this.maxQueueSize) {
      queue.splice(0, queue.length - this.maxQueueSize);
    }
  }

  sendQueuedMessages(socketId) {
    const client = this.connectedClients.get(socketId);
    if (!client) return;

    // Send queued messages for subscribed rooms
    for (const subscription of client.subscriptions) {
      const queuedMessages = this.messageQueue.get(subscription);
      if (queuedMessages && queuedMessages.length > 0) {
        client.socket.emit("queued:messages", {
          room: subscription,
          messages: queuedMessages,
          count: queuedMessages.length,
        });

        // Clear the queue after sending
        this.messageQueue.delete(subscription);
      }
    }
  }

  // Client disconnection handling
  handleClientDisconnection(socketId, reason) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      // Store disconnection info
      this.disconnectionLog = this.disconnectionLog || new Map();
      this.disconnectionLog.set(socketId, {
        reason,
        disconnectedAt: Date.now(),
        subscriptions: Array.from(client.subscriptions),
        reconnectCount: client.reconnectCount,
      });

      // Keep only recent disconnections
      if (this.disconnectionLog.size > 1000) {
        const entries = Array.from(this.disconnectionLog.entries());
        entries.sort((a, b) => b[1].disconnectedAt - a[1].disconnectedAt);
        this.disconnectionLog = new Map(entries.slice(0, 500));
      }
    }
  }

  // Authorization check (implement based on your auth system)
  isAuthorized(socket) {
    // Implement your authorization logic here
    // For now, return true for basic functionality
    return true;
  }

  // Enhanced heartbeat with health monitoring
  startHeartbeat() {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      const staleClients = [];

      for (const [socketId, client] of this.connectedClients) {
        const timeSinceLastActivity = now - client.lastActivity.getTime();

        if (timeSinceLastActivity > staleThreshold) {
          console.log(
            `🧹 Disconnecting stale client: ${socketId} (inactive for ${Math.round(timeSinceLastActivity / 1000)}s)`
          );
          client.socket.disconnect(true);
          staleClients.push(socketId);
        }
      }

      if (staleClients.length > 0) {
        console.log(`🧹 Cleaned up ${staleClients.length} stale connections`);
      }

      // Broadcast system heartbeat every 5 minutes
      if (now % (5 * 60 * 1000) < 60000) {
        // Within 1 minute of 5-minute mark
        this.broadcastSystemStatus({
          type: "heartbeat",
          status: "healthy",
          uptime: now - this.metrics.startTime,
          connections: this.metrics.currentConnections,
          message: "System running normally",
        });
      }
    }, 60000); // Check every minute
  }

  // Health monitoring
  startHealthMonitoring() {
    setInterval(() => {
      const now = Date.now();

      // Monitor connection health
      for (const [socketId, health] of this.connectionHealth) {
        if (now - health.lastSeen > 2 * 60 * 1000) {
          // 2 minutes
          health.status = "stale";
        }

        if (health.latency > 1000) {
          // High latency
          health.status = "degraded";
        }
      }

      // Clean up old health records
      const healthEntries = Array.from(this.connectionHealth.entries());
      const activeClients = new Set(this.connectedClients.keys());

      for (const [socketId] of healthEntries) {
        if (!activeClients.has(socketId)) {
          this.connectionHealth.delete(socketId);
        }
      }
    }, 30000); // Every 30 seconds
  }

  // Metrics collection
  startMetricsCollection() {
    setInterval(() => {
      const stats = this.getDetailedStats();
      console.log(
        `📊 WebSocket Metrics: Connections: ${stats.connections}, Messages: ${stats.totalMessages}, Uptime: ${Math.round(stats.uptime / 1000)}s`
      );

      // Store metrics in cache for monitoring dashboards
      cache.set("websocket_metrics", stats, 300); // 5 minutes

      // Reset hourly counters
      const now = Date.now();
      if (now - this.metrics.startTime > 60 * 60 * 1000) {
        // Every hour
        this.resetHourlyMetrics();
      }
    }, 30000); // Every 30 seconds
  }

  // Periodic cleanup
  startPeriodicCleanup() {
    setInterval(
      () => {
        // Clean up rate limits
        const now = Date.now();
        for (const [key, limit] of this.rateLimits) {
          if (now - limit.windowStart > 60000) {
            // 1 minute old
            this.rateLimits.delete(key);
          }
        }

        // Clean up old GMP alerts
        if (this.gmpAlerts) {
          for (const [key, alert] of this.gmpAlerts) {
            if (now - alert.createdAt > 24 * 60 * 60 * 1000) {
              // 24 hours old
              this.gmpAlerts.delete(key);
            }
          }
        }

        // Clean up message queues
        for (const [room, messages] of this.messageQueue) {
          const validMessages = messages.filter(
            (msg) => now - msg.timestamp < 60 * 60 * 1000 // Keep messages for 1 hour
          );

          if (validMessages.length === 0) {
            this.messageQueue.delete(room);
          } else {
            this.messageQueue.set(room, validMessages);
          }
        }
      },
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  // Reset hourly metrics
  resetHourlyMetrics() {
    this.metrics.totalMessages = 0;
    this.metrics.errors = 0;
    console.log("📊 Hourly metrics reset");
  }

  // Enhanced statistics
  getDetailedStats() {
    const connections = this.connectedClients.size;
    const rooms = Array.from(this.roomSubscriptions.keys());
    const totalSubscriptions = Array.from(
      this.roomSubscriptions.values()
    ).reduce((sum, subs) => sum + subs.size, 0);

    // Calculate averages
    const avgSubscriptionsPerClient =
      connections > 0
        ? parseFloat((totalSubscriptions / connections).toFixed(2))
        : 0;

    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Calculate health stats
    const healthyConnections = Array.from(
      this.connectionHealth.values()
    ).filter((h) => h.status === "healthy").length;

    return {
      connections,
      rooms: rooms.length,
      subscriptions: totalSubscriptions,
      avgSubscriptionsPerClient,
      totalMessages: this.metrics.totalMessages,
      totalConnections: this.metrics.totalConnections,
      peakConnections: this.metrics.peakConnections,
      errors: this.metrics.errors,
      uptime: Date.now() - this.metrics.startTime,
      rateLimitEntries: this.rateLimits.size,
      queuedMessages: Array.from(this.messageQueue.values()).reduce(
        (sum, msgs) => sum + msgs.length,
        0
      ),
      health: {
        healthy: healthyConnections,
        degraded: this.connectionHealth.size - healthyConnections,
        healthRate:
          this.connectionHealth.size > 0
            ? parseFloat(
                (
                  (healthyConnections / this.connectionHealth.size) *
                  100
                ).toFixed(2)
              )
            : 100,
      },
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + "MB",
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
        external: Math.round(memoryUsage.external / 1024 / 1024) + "MB",
      },
      roomDetails: Object.fromEntries(
        Array.from(this.roomSubscriptions.entries()).map(([room, subs]) => [
          room,
          subs.size,
        ])
      ),
      timestamp: Date.now(),
    };
  }

  // Health check
  getHealthCheck() {
    const stats = this.getDetailedStats();
    const isHealthy = this.io && stats.connections >= 0 && !this.isOverloaded();

    return {
      status: isHealthy ? "healthy" : "unhealthy",
      uptime: stats.uptime,
      connections: stats.connections,
      rooms: stats.rooms,
      subscriptions: stats.subscriptions,
      averageLoad: this.calculateAverageLoad(),
      memoryUsage: stats.memory,
      health: stats.health,
      errors: stats.errors,
      lastErrors: this.getRecentErrors(),
      timestamp: Date.now(),
    };
  }

  isOverloaded() {
    const stats = this.getDetailedStats();
    const memoryUsage = process.memoryUsage();

    // Define overload thresholds
    const maxConnections = parseInt(process.env.WS_MAX_CONNECTIONS) || 10000;
    const maxMemoryMB = parseInt(process.env.WS_MAX_MEMORY_MB) || 1024;
    const maxSubscriptions =
      parseInt(process.env.WS_MAX_SUBSCRIPTIONS) || 50000;

    return (
      stats.connections > maxConnections ||
      memoryUsage.heapUsed / 1024 / 1024 > maxMemoryMB ||
      stats.subscriptions > maxSubscriptions ||
      stats.errors > 100 // High error rate
    );
  }

  calculateAverageLoad() {
    const timeDiff = (Date.now() - this.metrics.startTime) / 1000;
    const messagesPerSecond =
      timeDiff > 0 ? this.metrics.totalMessages / timeDiff : 0;
    const connectionsRatio = this.connectedClients.size / 1000; // Normalize to 1000 connections

    return parseFloat((messagesPerSecond * connectionsRatio).toFixed(2));
  }

  getRecentErrors() {
    // In a production environment, you'd implement proper error logging
    return {
      count: this.metrics.errors,
      lastErrorTime: this.lastErrorTime || null,
    };
  }

  // Client cleanup
  cleanupClient(socketId) {
    const client = this.connectedClients.get(socketId);
    if (client) {
      // Remove from all room subscriptions
      for (const subscription of client.subscriptions) {
        const roomSubs = this.roomSubscriptions.get(subscription);
        if (roomSubs) {
          roomSubs.delete(socketId);
          if (roomSubs.size === 0) {
            this.roomSubscriptions.delete(subscription);
          }
        }
      }
      this.connectedClients.delete(socketId);
    }

    // Clean up connection health
    this.connectionHealth.delete(socketId);

    // Clean up rate limits for this client
    const keysToDelete = [];
    for (const [key] of this.rateLimits) {
      if (key.startsWith(socketId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.rateLimits.delete(key));

    // Clean up GMP alerts
    if (this.gmpAlerts) {
      const alertKeysToDelete = [];
      for (const [key] of this.gmpAlerts) {
        if (key.startsWith(socketId)) {
          alertKeysToDelete.push(key);
        }
      }
      alertKeysToDelete.forEach((key) => this.gmpAlerts.delete(key));
    }
  }

  // Graceful shutdown
  async shutdown() {
    console.log("🔌 Shutting down WebSocket service...");

    if (this.io) {
      // Notify all clients about shutdown
      await this.broadcastSystemStatus(
        {
          type: "shutdown",
          message: "Server is shutting down for maintenance",
          estimatedDowntime: "5 minutes",
        },
        { priority: "high" }
      );

      // Give clients time to receive the message
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Gracefully disconnect all clients
      for (const [socketId, client] of this.connectedClients) {
        try {
          client.socket.emit("server:shutdown", {
            message: "Server shutting down",
            reconnectIn: 10000, // Suggest reconnect in 10 seconds
          });
          client.socket.disconnect(true);
        } catch (error) {
          console.warn(
            `Error disconnecting client ${socketId}:`,
            error.message
          );
        }
      }

      // Close the server
      this.io.close();
    }

    if (this.server) {
      this.server.close();
    }

    // Clear all data structures
    this.connectedClients.clear();
    this.roomSubscriptions.clear();
    this.rateLimits.clear();
    this.connectionHealth.clear();
    this.messageQueue.clear();

    if (this.gmpAlerts) {
      this.gmpAlerts.clear();
    }

    console.log("✅ WebSocket service shutdown complete");
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();

// Initialize and start if not in test environment
if (process.env.NODE_ENV !== "test") {
  webSocketService.initialize();

  if (process.env.AUTO_START_WEBSOCKET !== "false") {
    webSocketService.start().catch((error) => {
      console.error("Failed to start WebSocket service:", error);
      process.exit(1);
    });
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  console.log(
    "Received SIGTERM, shutting down WebSocket service gracefully..."
  );
  await webSocketService.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down WebSocket service gracefully...");
  await webSocketService.shutdown();
  process.exit(0);
});

// Unhandled error handling
process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception in WebSocket service:", error);
  webSocketService.lastErrorTime = Date.now();
  webSocketService.metrics.errors++;

  // Attempt graceful shutdown
  try {
    await webSocketService.shutdown();
  } catch (shutdownError) {
    console.error("Error during emergency shutdown:", shutdownError);
  }

  process.exit(1);
});

// Export the io instance for use in other modules
export const io = webSocketService.io;

// Export default
export default webSocketService;
