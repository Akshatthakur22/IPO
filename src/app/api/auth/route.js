import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/db.js";
import { cache } from "../../../lib/cache.js";

// User authentication endpoint
export async function POST(request) {
  try {
    const body = await request.json();
    const { action, email, password, name, role = "user" } = body;

    switch (action) {
      case "login":
        return await handleLogin(email, password);

      case "register":
        return await handleRegister(email, password, name, role);

      case "refresh":
        return await handleTokenRefresh(request);

      case "logout":
        return await handleLogout(request);

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
            availableActions: ["login", "register", "refresh", "logout"],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("POST /api/auth error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Authentication failed",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Get current user info
export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "No token provided",
        },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found or inactive",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid token",
      },
      { status: 401 }
    );
  }
}

// Handle user login
async function handleLogin(email, password) {
  if (!email || !password) {
    return NextResponse.json(
      {
        success: false,
        error: "Email and password are required",
      },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid credentials",
      },
      { status: 401 }
    );
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid credentials",
      },
      { status: 401 }
    );
  }

  // Generate tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Cache user session
  await cache.set(
    cache.key("SESSION", user.id),
    { userId: user.id, email: user.email, role: user.role },
    60 * 60 // 1 hour
  );

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    },
    timestamp: new Date().toISOString(),
  });
}

// Handle user registration
async function handleRegister(email, password, name, role) {
  if (!email || !password || !name) {
    return NextResponse.json(
      {
        success: false,
        error: "Email, password, and name are required",
      },
      { status: 400 }
    );
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        success: false,
        error: "User already exists",
      },
      { status: 409 }
    );
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name.trim(),
      role: role === "admin" ? "admin" : "user",
      isActive: true,
    },
  });

  // Generate tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    },
    message: "User registered successfully",
    timestamp: new Date().toISOString(),
  });
}

// Handle token refresh
async function handleTokenRefresh(request) {
  const body = await request.json();
  const { refreshToken } = body;

  if (!refreshToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Refresh token is required",
      },
      { status: 400 }
    );
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found or inactive",
        },
        { status: 404 }
      );
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return NextResponse.json({
      success: true,
      tokens: {
        accessToken: newAccessToken,
        expiresIn: 3600,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid refresh token",
      },
      { status: 401 }
    );
  }
}

// Handle logout
async function handleLogout(request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Remove from cache
      await cache.del(cache.key("SESSION", decoded.userId));
    }

    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Even if token is invalid, consider logout successful
    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
      timestamp: new Date().toISOString(),
    });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
