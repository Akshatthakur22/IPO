import { prisma } from "./db.js";
import { cache } from "./cache.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

class AuthService {
  constructor() {
    this.jwtSecret =
      process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
    this.jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString("hex");
    this.tokenExpiry = process.env.JWT_EXPIRY || "15m"; // 15 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || "7d"; // 7 days
    this.maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    this.lockoutDuration =
      parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000; // 15 minutes

    // Session management
    this.activeSessions = new Map();
    this.maxSessionsPerUser = parseInt(process.env.MAX_SESSIONS_PER_USER) || 5;

    // Rate limiting for auth operations
    this.rateLimitMap = new Map();
    this.authAttempts = new Map();

    // Password policy
    this.passwordPolicy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    };

    // Security metrics
    this.metrics = {
      totalLogins: 0,
      failedLogins: 0,
      successfulLogins: 0,
      blockedAttempts: 0,
      activeUsers: 0,
      suspiciousActivities: 0,
    };

    console.log("🔐 Auth service initialized");
  }

  // User registration with enhanced validation
  async register(userData) {
    try {
      const { email, password, name, role = "user" } = userData;

      // Validate input
      this.validateRegistrationInput({ email, password, name });

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        throw new Error("User already exists with this email");
      }

      // Validate password strength
      this.validatePasswordStrength(password);

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Create user with secure defaults
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name: name.trim(),
          role,
          isActive: true,
          emailVerified: false,
          twoFactorEnabled: false,
          lastPasswordChange: new Date(),
          createdAt: new Date(),
        },
      });

      // Generate email verification token
      const verificationToken = await this.generateVerificationToken(user.id);

      // Remove sensitive data from response
      const safeUser = this.sanitizeUser(user);

      console.log(`✅ User registered: ${email}`);

      return {
        success: true,
        user: safeUser,
        verificationToken,
        message: "Registration successful. Please verify your email.",
      };
    } catch (error) {
      console.error("Registration error:", error);
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  // Enhanced login with security features
  async login(credentials) {
    const {
      email,
      password,
      rememberMe = false,
      userAgent,
      ipAddress,
    } = credentials;
    const loginAttemptKey = `login:${email.toLowerCase()}:${ipAddress}`;

    try {
      // Rate limiting check
      if (this.isRateLimited(loginAttemptKey)) {
        this.metrics.blockedAttempts++;
        throw new Error("Too many login attempts. Please try again later.");
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          sessions: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!user) {
        await this.recordFailedAttempt(loginAttemptKey);
        this.metrics.failedLogins++;
        throw new Error("Invalid email or password");
      }

      // Check if account is active
      if (!user.isActive) {
        throw new Error("Account is deactivated. Please contact support.");
      }

      // Check if account is locked
      if (await this.isAccountLocked(user.id)) {
        throw new Error(
          "Account is temporarily locked due to multiple failed login attempts."
        );
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(
        password,
        user.password
      );
      if (!isPasswordValid) {
        await this.recordFailedAttempt(loginAttemptKey);
        await this.incrementFailedLoginAttempts(user.id);
        this.metrics.failedLogins++;
        throw new Error("Invalid email or password");
      }

      // Check if email is verified (optional)
      if (
        !user.emailVerified &&
        process.env.REQUIRE_EMAIL_VERIFICATION === "true"
      ) {
        throw new Error("Please verify your email before logging in.");
      }

      // Check password age
      if (this.isPasswordExpired(user.lastPasswordChange)) {
        return {
          success: false,
          requirePasswordReset: true,
          message: "Password has expired. Please reset your password.",
        };
      }

      // Clear failed attempts on successful login
      await this.clearFailedLoginAttempts(user.id);
      this.clearRateLimit(loginAttemptKey);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(
        user,
        rememberMe
      );

      // Create or update session
      const session = await this.createSession(user.id, {
        accessToken,
        refreshToken,
        userAgent,
        ipAddress,
        rememberMe,
      });

      // Update user login info
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          loginCount: { increment: 1 },
        },
      });

      // Cache user session
      await cache.cacheUserSession(user.id, {
        userId: user.id,
        sessionId: session.id,
        role: user.role,
        permissions: await this.getUserPermissions(user.role),
        loginTime: Date.now(),
      });

      // Track active session
      this.trackActiveSession(user.id, session.id);

      // Update metrics
      this.metrics.successfulLogins++;
      this.metrics.totalLogins++;
      this.updateActiveUsersCount();

      const safeUser = this.sanitizeUser(user);

      console.log(`✅ User logged in: ${email} from ${ipAddress}`);

      return {
        success: true,
        user: safeUser,
        accessToken,
        refreshToken,
        expiresIn: this.getTokenExpiry(),
        sessionId: session.id,
        message: "Login successful",
      };
    } catch (error) {
      console.error("Login error:", error);
      this.recordSuspiciousActivity(
        email,
        ipAddress,
        "failed_login",
        error.message
      );
      throw error;
    }
  }

  // Token refresh with security validation
  async refreshAccessToken(refreshToken) {
    try {
      if (!refreshToken) {
        throw new Error("Refresh token is required");
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret);

      // Find active session
      const session = await prisma.userSession.findFirst({
        where: {
          refreshToken,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });

      if (!session) {
        throw new Error("Invalid or expired refresh token");
      }

      // Check if user is still active
      if (!session.user.isActive) {
        await this.invalidateSession(session.id);
        throw new Error("User account is no longer active");
      }

      // Check session validity
      if (session.userId !== decoded.userId) {
        await this.invalidateSession(session.id);
        throw new Error("Token mismatch. Please login again.");
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken(session.user);

      // Update session
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastActivityAt: new Date(),
          accessToken: newAccessToken,
        },
      });

      // Update cached session
      await cache.cacheUserSession(session.user.id, {
        userId: session.user.id,
        sessionId: session.id,
        role: session.user.role,
        permissions: await this.getUserPermissions(session.user.role),
        refreshTime: Date.now(),
      });

      console.log(`🔄 Token refreshed for user: ${session.user.email}`);

      return {
        success: true,
        accessToken: newAccessToken,
        expiresIn: this.getTokenExpiry(),
        message: "Token refreshed successfully",
      };
    } catch (error) {
      console.error("Token refresh error:", error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  // Enhanced logout with session cleanup
  async logout(userId, sessionId, logoutAll = false) {
    try {
      if (logoutAll) {
        // Logout from all sessions
        await prisma.userSession.updateMany({
          where: {
            userId,
            isActive: true,
          },
          data: {
            isActive: false,
            loggedOutAt: new Date(),
          },
        });

        // Clear all cached sessions
        const sessions = await prisma.userSession.findMany({
          where: { userId },
          select: { id: true },
        });

        for (const session of sessions) {
          await cache.del(cache.key("USER", `session:${userId}:${session.id}`));
          this.removeActiveSession(userId, session.id);
        }

        console.log(`🚪 User logged out from all sessions: ${userId}`);
      } else {
        // Logout from specific session
        await prisma.userSession.update({
          where: { id: sessionId },
          data: {
            isActive: false,
            loggedOutAt: new Date(),
          },
        });

        // Clear cached session
        await cache.del(cache.key("USER", `session:${userId}:${sessionId}`));
        this.removeActiveSession(userId, sessionId);

        console.log(`🚪 User logged out: ${userId} (session: ${sessionId})`);
      }

      this.updateActiveUsersCount();

      return {
        success: true,
        message: logoutAll
          ? "Logged out from all sessions"
          : "Logout successful",
      };
    } catch (error) {
      console.error("Logout error:", error);
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  // Password reset with secure token generation
  async initiatePasswordReset(email) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        // Don't reveal if user exists or not for security
        return {
          success: true,
          message:
            "If an account with this email exists, a password reset link has been sent.",
        };
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: resetTokenHash,
          expiresAt,
        },
      });

      // Cache reset token for faster validation
      await cache.set(
        cache.key("AUTH", `reset:${resetTokenHash}`),
        { userId: user.id, email: user.email },
        3600 // 1 hour
      );

      console.log(`🔑 Password reset initiated for: ${email}`);

      return {
        success: true,
        resetToken, // In production, this would be sent via email
        message: "Password reset link has been sent to your email.",
      };
    } catch (error) {
      console.error("Password reset initiation error:", error);
      throw new Error("Failed to initiate password reset");
    }
  }

  // Complete password reset with validation
  async completePasswordReset(resetToken, newPassword) {
    try {
      if (!resetToken || !newPassword) {
        throw new Error("Reset token and new password are required");
      }

      // Hash the token to match stored hash
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // Check cached token first
      let cachedTokenData = await cache.get(
        cache.key("AUTH", `reset:${resetTokenHash}`)
      );

      if (!cachedTokenData) {
        // Fallback to database
        const tokenRecord = await prisma.passwordResetToken.findFirst({
          where: {
            tokenHash: resetTokenHash,
            expiresAt: { gt: new Date() },
            used: false,
          },
          include: { user: true },
        });

        if (!tokenRecord) {
          throw new Error("Invalid or expired reset token");
        }

        cachedTokenData = {
          userId: tokenRecord.user.id,
          email: tokenRecord.user.email,
        };
      }

      // Validate new password
      this.validatePasswordStrength(newPassword);

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update user password
      await prisma.user.update({
        where: { id: cachedTokenData.userId },
        data: {
          password: hashedPassword,
          lastPasswordChange: new Date(),
          failedLoginAttempts: 0, // Reset failed attempts
        },
      });

      // Mark token as used
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: cachedTokenData.userId,
          used: false,
        },
        data: { used: true },
      });

      // Clear cached token
      await cache.del(cache.key("AUTH", `reset:${resetTokenHash}`));

      // Invalidate all user sessions for security
      await this.logout(cachedTokenData.userId, null, true);

      console.log(`🔒 Password reset completed for: ${cachedTokenData.email}`);

      return {
        success: true,
        message:
          "Password reset successful. Please login with your new password.",
      };
    } catch (error) {
      console.error("Password reset completion error:", error);
      throw error;
    }
  }

  // Token verification and user extraction
  async verifyToken(token) {
    try {
      if (!token) {
        throw new Error("Token is required");
      }

      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, "");

      // Verify JWT token
      const decoded = jwt.verify(cleanToken, this.jwtSecret);

      // Check if token is blacklisted
      const isBlacklisted = await cache.get(
        cache.key("AUTH", `blacklist:${cleanToken}`)
      );
      if (isBlacklisted) {
        throw new Error("Token has been revoked");
      }

      // Get cached session
      let sessionData = await cache.getCachedUserSession(decoded.userId);

      if (!sessionData) {
        // Fallback to database
        const session = await prisma.userSession.findFirst({
          where: {
            userId: decoded.userId,
            accessToken: cleanToken,
            isActive: true,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
        });

        if (!session) {
          throw new Error("Session not found or expired");
        }

        sessionData = {
          userId: session.user.id,
          sessionId: session.id,
          role: session.user.role,
          permissions: await this.getUserPermissions(session.user.role),
        };
      }

      // Update last activity
      await this.updateSessionActivity(sessionData.sessionId);

      return {
        valid: true,
        user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          permissions: sessionData.permissions,
        },
        sessionId: sessionData.sessionId,
        decoded,
      };
    } catch (error) {
      console.error("Token verification error:", error);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  // Enhanced middleware for route protection
  requireAuth(options = {}) {
    const { roles = [], permissions = [], optional = false } = options;

    return async (req, res, next) => {
      try {
        const token = this.extractTokenFromRequest(req);

        if (!token) {
          if (optional) {
            req.user = null;
            return next();
          }
          return res.status(401).json({
            error: "Access token required",
            code: "TOKEN_MISSING",
          });
        }

        const verification = await this.verifyToken(token);

        if (!verification.valid) {
          return res.status(401).json({
            error: verification.error,
            code: "TOKEN_INVALID",
          });
        }

        // Check role authorization
        if (roles.length > 0 && !roles.includes(verification.user.role)) {
          return res.status(403).json({
            error: "Insufficient role permissions",
            code: "ROLE_INSUFFICIENT",
            required: roles,
            current: verification.user.role,
          });
        }

        // Check permission authorization
        if (permissions.length > 0) {
          const userPermissions = verification.user.permissions || [];
          const hasPermission = permissions.some((perm) =>
            userPermissions.includes(perm)
          );

          if (!hasPermission) {
            return res.status(403).json({
              error: "Insufficient permissions",
              code: "PERMISSION_INSUFFICIENT",
              required: permissions,
              current: userPermissions,
            });
          }
        }

        // Attach user to request
        req.user = verification.user;
        req.sessionId = verification.sessionId;

        // Rate limiting per user
        if (!this.checkUserRateLimit(verification.user.id)) {
          return res.status(429).json({
            error: "Rate limit exceeded",
            code: "RATE_LIMIT_EXCEEDED",
          });
        }

        next();
      } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(500).json({
          error: "Internal authentication error",
          code: "AUTH_INTERNAL_ERROR",
        });
      }
    };
  }

  // Admin middleware for administrative routes
  requireAdmin() {
    return this.requireAuth({ roles: ["admin", "super_admin"] });
  }

  // Optional authentication middleware
  optionalAuth() {
    return this.requireAuth({ optional: true });
  }

  // Two-factor authentication setup
  async setupTwoFactor(userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error("User not found");
      }

      // Generate secret key
      const secret = crypto.randomBytes(20).toString("base32");

      // Store secret temporarily (will be confirmed later)
      await cache.set(
        cache.key("AUTH", `2fa:setup:${userId}`),
        { secret, confirmed: false },
        600 // 10 minutes
      );

      return {
        success: true,
        secret,
        qrCode: this.generateQRCodeUrl(user.email, secret),
        message: "Scan QR code with your authenticator app",
      };
    } catch (error) {
      console.error("2FA setup error:", error);
      throw error;
    }
  }

  // Verify two-factor authentication token
  async verifyTwoFactor(userId, token, confirm = false) {
    try {
      if (confirm) {
        // Confirming 2FA setup
        const setupData = await cache.get(
          cache.key("AUTH", `2fa:setup:${userId}`)
        );
        if (!setupData) {
          throw new Error("2FA setup not found or expired");
        }

        const isValid = this.verifyTOTP(token, setupData.secret);
        if (!isValid) {
          throw new Error("Invalid 2FA token");
        }

        // Enable 2FA for user
        await prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorEnabled: true,
            twoFactorSecret: setupData.secret,
          },
        });

        // Clear setup data
        await cache.del(cache.key("AUTH", `2fa:setup:${userId}`));

        return { success: true, message: "2FA enabled successfully" };
      } else {
        // Verifying 2FA during login
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorEnabled) {
          throw new Error("2FA not enabled for this user");
        }

        const isValid = this.verifyTOTP(token, user.twoFactorSecret);
        return {
          success: isValid,
          message: isValid ? "2FA verified" : "Invalid 2FA token",
        };
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      throw error;
    }
  }

  // Session management utilities
  async createSession(userId, sessionData) {
    const { accessToken, refreshToken, userAgent, ipAddress, rememberMe } =
      sessionData;

    // Check session limit
    await this.enforceSessionLimit(userId);

    const expiresAt = new Date();
    expiresAt.setTime(
      expiresAt.getTime() +
        (rememberMe
          ? 7 * 24 * 60 * 60 * 1000 // 7 days
          : 24 * 60 * 60 * 1000)
    ); // 1 day

    return await prisma.userSession.create({
      data: {
        userId,
        accessToken,
        refreshToken,
        userAgent: userAgent || "Unknown",
        ipAddress: ipAddress || "Unknown",
        expiresAt,
        lastActivityAt: new Date(),
        isActive: true,
      },
    });
  }

  async enforceSessionLimit(userId) {
    const activeSessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (activeSessions.length >= this.maxSessionsPerUser) {
      // Deactivate oldest sessions
      const sessionsToDeactivate = activeSessions.slice(
        0,
        activeSessions.length - this.maxSessionsPerUser + 1
      );

      for (const session of sessionsToDeactivate) {
        await this.invalidateSession(session.id);
      }
    }
  }

  async invalidateSession(sessionId) {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        loggedOutAt: new Date(),
      },
    });
  }

  async updateSessionActivity(sessionId) {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  // Security utilities
  async hashPassword(password) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  validatePasswordStrength(password) {
    const policy = this.passwordPolicy;
    const errors = [];

    if (password.length < policy.minLength) {
      errors.push(
        `Password must be at least ${policy.minLength} characters long`
      );
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }

    if (
      policy.requireSpecialChars &&
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      errors.push("Password must contain at least one special character");
    }

    // Check for common passwords
    if (this.isCommonPassword(password)) {
      errors.push("Password is too common. Please choose a stronger password");
    }

    if (errors.length > 0) {
      throw new Error(`Password validation failed: ${errors.join(", ")}`);
    }
  }

  isCommonPassword(password) {
    const commonPasswords = [
      "password",
      "123456",
      "12345678",
      "qwerty",
      "abc123",
      "password123",
      "admin",
      "letmein",
      "welcome",
      "monkey",
    ];
    return commonPasswords.includes(password.toLowerCase());
  }

  isPasswordExpired(lastPasswordChange) {
    if (!lastPasswordChange) return true;
    const now = Date.now();
    const passwordAge = now - new Date(lastPasswordChange).getTime();
    return passwordAge > this.passwordPolicy.maxAge;
  }

  // Token generation utilities
  generateAccessToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: "access",
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiry,
      issuer: process.env.JWT_ISSUER || "ipo-tracker",
      audience: process.env.JWT_AUDIENCE || "ipo-platform",
    });
  }

  generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      type: "refresh",
    };

    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: process.env.JWT_ISSUER || "ipo-tracker",
      audience: process.env.JWT_AUDIENCE || "ipo-platform",
    });
  }

  async generateTokens(user, rememberMe = false) {
    const accessToken = this.generateAccessToken(user);
    const refreshTokenExpiry = rememberMe ? "30d" : this.refreshTokenExpiry;

    const refreshPayload = {
      userId: user.id,
      email: user.email,
      type: "refresh",
    };

    const refreshToken = jwt.sign(refreshPayload, this.jwtRefreshSecret, {
      expiresIn: refreshTokenExpiry,
      issuer: process.env.JWT_ISSUER || "ipo-tracker",
      audience: process.env.JWT_AUDIENCE || "ipo-platform",
    });

    return { accessToken, refreshToken };
  }

  async generateVerificationToken(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  getTokenExpiry() {
    // Convert JWT expiry to seconds
    const expiry = this.tokenExpiry;
    if (expiry.endsWith("m")) {
      return parseInt(expiry) * 60;
    } else if (expiry.endsWith("h")) {
      return parseInt(expiry) * 60 * 60;
    } else if (expiry.endsWith("d")) {
      return parseInt(expiry) * 24 * 60 * 60;
    }
    return 900; // 15 minutes default
  }

  // Rate limiting utilities
  isRateLimited(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const rateLimitKey = `${key}:${windowStart}`;

    if (!this.rateLimitMap.has(rateLimitKey)) {
      this.rateLimitMap.set(rateLimitKey, { count: 0, windowStart });
    }

    const rateLimitData = this.rateLimitMap.get(rateLimitKey);

    if (rateLimitData.windowStart !== windowStart) {
      rateLimitData.count = 0;
      rateLimitData.windowStart = windowStart;
    }

    return rateLimitData.count >= maxAttempts;
  }

  async recordFailedAttempt(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000);
    const rateLimitKey = `${key}:${windowStart}`;

    if (!this.rateLimitMap.has(rateLimitKey)) {
      this.rateLimitMap.set(rateLimitKey, { count: 0, windowStart });
    }

    const rateLimitData = this.rateLimitMap.get(rateLimitKey);
    rateLimitData.count++;

    // Cleanup old entries
    setTimeout(
      () => {
        this.rateLimitMap.delete(rateLimitKey);
      },
      15 * 60 * 1000
    );
  }

  clearRateLimit(key) {
    const keysToDelete = [];
    for (const [mapKey] of this.rateLimitMap) {
      if (mapKey.startsWith(key)) {
        keysToDelete.push(mapKey);
      }
    }
    keysToDelete.forEach((k) => this.rateLimitMap.delete(k));
  }

  checkUserRateLimit(userId, maxRequests = 100, windowMs = 60 * 1000) {
    return !this.isRateLimited(`user:${userId}`, maxRequests, windowMs);
  }

  // Account security utilities
  async isAccountLocked(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockedAt: true },
    });

    if (!user) return false;

    if (user.failedLoginAttempts >= this.maxLoginAttempts) {
      if (
        user.lockedAt &&
        Date.now() - new Date(user.lockedAt).getTime() < this.lockoutDuration
      ) {
        return true;
      } else {
        // Reset lock if lockout duration has passed
        await this.clearFailedLoginAttempts(userId);
      }
    }

    return false;
  }

  async incrementFailedLoginAttempts(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true },
    });

    const newAttempts = (user?.failedLoginAttempts || 0) + 1;
    const updateData = { failedLoginAttempts: newAttempts };

    if (newAttempts >= this.maxLoginAttempts) {
      updateData.lockedAt = new Date();
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  async clearFailedLoginAttempts(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedAt: null,
      },
    });
  }

  // Utility functions
  validateRegistrationInput({ email, password, name }) {
    if (!email || !password || !name) {
      throw new Error("Email, password, and name are required");
    }

    if (!this.isValidEmail(email)) {
      throw new Error("Invalid email format");
    }

    if (name.trim().length < 2) {
      throw new Error("Name must be at least 2 characters long");
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  sanitizeUser(user) {
    const { password, twoFactorSecret, ...safeUser } = user;
    return safeUser;
  }

  extractTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    // Check cookies as fallback
    if (req.cookies && req.cookies.access_token) {
      return req.cookies.access_token;
    }

    return null;
  }

  async getUserPermissions(role) {
    const rolePermissions = {
      user: [
        "read:own_profile",
        "update:own_profile",
        "read:ipos",
        "create:watchlist",
      ],
      admin: ["read:all", "update:all", "delete:all", "manage:users"],
      super_admin: ["*"], // All permissions
    };

    return rolePermissions[role] || rolePermissions.user;
  }

  // 2FA utilities
  verifyTOTP(token, secret) {
    // Simplified TOTP verification - use a proper library like 'speakeasy' in production
    const timeWindow = Math.floor(Date.now() / 1000 / 30);
    const expectedToken = this.generateTOTP(secret, timeWindow);

    // Allow for time drift (check current and previous/next windows)
    return (
      token === expectedToken ||
      token === this.generateTOTP(secret, timeWindow - 1) ||
      token === this.generateTOTP(secret, timeWindow + 1)
    );
  }

  generateTOTP(secret, timeWindow) {
    // Simplified TOTP generation - replace with proper implementation
    const crypto = require("crypto");
    const hash = crypto
      .createHmac("sha1", secret)
      .update(timeWindow.toString())
      .digest("hex");
    const offset = parseInt(hash.slice(-1), 16);
    const code = parseInt(hash.slice(offset * 2, offset * 2 + 8), 16) % 1000000;
    return code.toString().padStart(6, "0");
  }

  generateQRCodeUrl(email, secret) {
    const issuer = encodeURIComponent(process.env.APP_NAME || "IPO Tracker");
    const account = encodeURIComponent(email);
    return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
  }

  // Activity tracking
  trackActiveSession(userId, sessionId) {
    if (!this.activeSessions.has(userId)) {
      this.activeSessions.set(userId, new Set());
    }
    this.activeSessions.get(userId).add(sessionId);
  }

  removeActiveSession(userId, sessionId) {
    if (this.activeSessions.has(userId)) {
      this.activeSessions.get(userId).delete(sessionId);
      if (this.activeSessions.get(userId).size === 0) {
        this.activeSessions.delete(userId);
      }
    }
  }

  updateActiveUsersCount() {
    this.metrics.activeUsers = this.activeSessions.size;
  }

  recordSuspiciousActivity(email, ipAddress, type, details) {
    this.metrics.suspiciousActivities++;
    console.warn(
      `🚨 Suspicious activity: ${type} for ${email} from ${ipAddress}: ${details}`
    );

    // In production, you might want to store this in the database
    // or send alerts to security monitoring systems
  }

  // Get authentication metrics
  getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.activeSessions.size,
      totalSessions: Array.from(this.activeSessions.values()).reduce(
        (total, sessions) => total + sessions.size,
        0
      ),
      loginSuccessRate:
        this.metrics.totalLogins > 0
          ? (
              (this.metrics.successfulLogins / this.metrics.totalLogins) *
              100
            ).toFixed(2) + "%"
          : "0%",
      timestamp: new Date().toISOString(),
    };
  }

  // Health check
  async healthCheck() {
    try {
      // Test JWT functionality
      const testToken = jwt.sign({ test: true }, this.jwtSecret, {
        expiresIn: "1s",
      });
      jwt.verify(testToken, this.jwtSecret);

      // Test database connection
      await prisma.$queryRaw`SELECT 1`;

      // Test cache connection
      const cacheHealthy = await cache.healthCheck();

      return {
        status: "healthy",
        jwt: "functional",
        database: "connected",
        cache: cacheHealthy.status,
        metrics: this.getMetrics(),
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

  // Cleanup expired sessions periodically
  async cleanupExpiredSessions() {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            {
              isActive: false,
              loggedOutAt: {
                lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              }, // 7 days ago
            },
          ],
        },
      });

      console.log(`🧹 Cleaned up ${result.count} expired sessions`);
      return result.count;
    } catch (error) {
      console.error("Session cleanup error:", error);
      return 0;
    }
  }

  // Blacklist token (for logout/security)
  async blacklistToken(token, expiryTime) {
    const cleanToken = token.replace(/^Bearer\s+/i, "");
    await cache.set(
      cache.key("AUTH", `blacklist:${cleanToken}`),
      { blacklisted: true, timestamp: Date.now() },
      expiryTime || this.getTokenExpiry()
    );
  }
}

// Export singleton instance
export const authService = new AuthService();

// Middleware exports
export const requireAuth = (options) => authService.requireAuth(options);
export const requireAdmin = () => authService.requireAdmin();
export const optionalAuth = () => authService.optionalAuth();

// Periodic cleanup (every 6 hours)
setInterval(
  async () => {
    try {
      await authService.cleanupExpiredSessions();

      // Clean up rate limit map
      const now = Date.now();
      for (const [key, data] of authService.rateLimitMap) {
        if (now - data.windowStart > 15 * 60 * 1000) {
          authService.rateLimitMap.delete(key);
        }
      }
    } catch (error) {
      console.error("Auth service cleanup failed:", error);
    }
  },
  6 * 60 * 60 * 1000
);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔐 Auth service shutting down...");
  // Cleanup resources if needed
});

export default authService;
