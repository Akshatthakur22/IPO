import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db.js';
import { cache } from '../../../lib/cache.js';
import { gmpTrackerService } from '../../../../services/gmp-tracker.js';
import { webSocketService } from '../../../lib/websocket.js';

// Get live GMP data with real-time updates
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const ipoId = searchParams.get('ipoId');
    const symbol = searchParams.get('symbol');
    const symbols = searchParams.get('symbols')?.split(',');
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const includeTrends = searchParams.get('includeTrends') === 'true';
    const clientId = searchParams.get('clientId');

    // Build target list
    let targetIds = [];

    if (ipoId) {
      targetIds = [ipoId];
    } else if (symbol) {
      const ipo = await prisma.iPO.findUnique({
        where: { symbol: symbol.toUpperCase() },
        select: { id: true },
      });
      if (ipo) targetIds = [ipo.id];
    } else if (symbols) {
      const ipos = await prisma.iPO.findMany({
        where: { symbol: { in: symbols.map((s) => s.toUpperCase()) } },
        select: { id: true, symbol: true },
      });
      targetIds = ipos.map((ipo) => ipo.id);
    } else {
      // Default to active open IPOs
      const activeIPOs = await prisma.iPO.findMany({
        where: { isActive: true, status: 'open' },
        select: { id: true, symbol: true },
        take: 10,
      });
      targetIds = activeIPOs.map((ipo) => ipo.id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No IPOs found for live tracking',
        },
        { status: 404 }
      );
    }

    // Get live GMP data
    const liveData = [];

    for (const targetId of targetIds) {
      try {
        // Try live service first
        let gmpData = null;
        if (gmpTrackerService.getStatus().isRunning) {
          gmpData = await gmpTrackerService.forceTrackIPO(targetId);
        }

        // Fallback to latest database record
        if (!gmpData) {
          const latestGMP = await prisma.gMP.findFirst({
            where: { ipoId: targetId },
            include: {
              ipo: {
                select: {
                  symbol: true,
                  name: true,
                  status: true,
                  maxPrice: true,
                },
              },
            },
            orderBy: { timestamp: 'desc' },
          });

          if (latestGMP) {
            gmpData = {
              ipoId: targetId,
              value: latestGMP.value,
              percentage: latestGMP.percentage,
              volume: latestGMP.volume,
              bidPrice: latestGMP.bidPrice,
              askPrice: latestGMP.askPrice,
              timestamp: latestGMP.timestamp,
              source: 'database',
              ipo: latestGMP.ipo,
            };
          }
        }

        if (gmpData) {
          // Add computed fields
          gmpData.spread =
            gmpData.askPrice && gmpData.bidPrice ? gmpData.askPrice - gmpData.bidPrice : null;
          gmpData.age = Date.now() - new Date(gmpData.timestamp).getTime();
          gmpData.isLive = gmpData.source !== 'database' && gmpData.age < 300000; // 5 minutes

          // Add history if requested
          if (includeHistory) {
            gmpData.history = await prisma.gMP.findMany({
              where: { ipoId: targetId },
              select: { value: true, volume: true, timestamp: true },
              orderBy: { timestamp: 'desc' },
              take: 20,
            });
          }

          // Add trends if requested
          if (includeTrends) {
            const recent = await prisma.gMP.findMany({
              where: { ipoId: targetId },
              select: { value: true },
              orderBy: { timestamp: 'desc' },
              take: 10,
            });

            gmpData.trend = calculateTrend(recent.map((g) => g.value));
          }

          liveData.push(gmpData);
        }
      } catch (error) {
        console.warn(`Failed to get live GMP for IPO ${targetId}:`, error.message);
      }
    }

    const response = {
      success: true,
      data: liveData,
      metadata: {
        count: liveData.length,
        requested: targetIds.length,
        includeHistory,
        includeTrends,
        clientId,
        serverTime: Date.now(),
      },
      service: {
        isRunning: gmpTrackerService.getStatus().isRunning,
        lastUpdate: gmpTrackerService.getStatus().lastProcessedAt,
      },
      timestamp: new Date().toISOString(),
    };

    // No caching for live data
    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/gmp/live error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch live GMP data',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Subscribe to live GMP updates
export async function POST(request) {
  try {
    const body = await request.json();
    const { action, ipoIds, symbols, clientId, preferences = {} } = body;

    switch (action) {
      case 'subscribe':
        return await handleSubscription({
          ipoIds,
          symbols,
          clientId,
          preferences,
        });

      case 'unsubscribe':
        return await handleUnsubscription({ ipoIds, symbols, clientId });

      case 'force_update':
        return await handleForceUpdate({ ipoIds, symbols });

      case 'get_status':
        return await handleStatusRequest();

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action',
            availableActions: ['subscribe', 'unsubscribe', 'force_update', 'get_status'],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('POST /api/gmp/live error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process live GMP request',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Handle subscription to live updates
async function handleSubscription({ ipoIds, symbols, clientId, preferences }) {
  try {
    // Convert symbols to IDs if needed
    let targetIds = ipoIds || [];

    if (symbols && symbols.length > 0) {
      const ipos = await prisma.iPO.findMany({
        where: { symbol: { in: symbols.map((s) => s.toUpperCase()) } },
        select: { id: true, symbol: true },
      });
      targetIds = [...targetIds, ...ipos.map((ipo) => ipo.id)];
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid IPO IDs or symbols provided',
        },
        { status: 400 }
      );
    }

    // Create subscription via WebSocket service
    const subscription = await webSocketService.createSubscription({
      clientId: clientId || generateClientId(),
      type: 'gmp_live',
      targets: targetIds,
      preferences: {
        updateInterval: preferences.interval || 30000, // 30 seconds
        includeHistory: preferences.includeHistory || false,
        includeTrends: preferences.includeTrends || false,
        ...preferences,
      },
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        clientId: subscription.clientId,
        targets: targetIds,
        preferences: subscription.preferences,
        status: 'active',
      },
      message: 'Subscribed to live GMP updates',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create subscription',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle unsubscription
async function handleUnsubscription({ ipoIds, symbols, clientId }) {
  try {
    let result;

    if (clientId) {
      result = await webSocketService.removeClientSubscriptions(clientId, 'gmp_live');
    } else {
      // Remove specific subscriptions
      const targetIds = ipoIds || [];
      if (symbols) {
        const ipos = await prisma.iPO.findMany({
          where: { symbol: { in: symbols.map((s) => s.toUpperCase()) } },
          select: { id: true },
        });
        targetIds.push(...ipos.map((ipo) => ipo.id));
      }

      result = await webSocketService.removeTargetSubscriptions(targetIds, 'gmp_live');
    }

    return NextResponse.json({
      success: true,
      result,
      message: 'Unsubscribed from live GMP updates',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to unsubscribe',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle force update request
async function handleForceUpdate({ ipoIds, symbols }) {
  try {
    const targetIds = ipoIds || [];

    if (symbols) {
      const ipos = await prisma.iPO.findMany({
        where: { symbol: { in: symbols.map((s) => s.toUpperCase()) } },
        select: { id: true },
      });
      targetIds.push(...ipos.map((ipo) => ipo.id));
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No IPO IDs or symbols provided',
        },
        { status: 400 }
      );
    }

    // Force update via GMP tracker service
    const results = [];

    if (gmpTrackerService.getStatus().isRunning) {
      for (const ipoId of targetIds) {
        try {
          const updated = await gmpTrackerService.forceTrackIPO(ipoId);
          results.push({ ipoId, success: true, data: updated });
        } catch (error) {
          results.push({ ipoId, success: false, error: error.message });
        }
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'GMP tracker service is not running',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
      updated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to force update',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Handle status request
async function handleStatusRequest() {
  try {
    const trackerStatus = gmpTrackerService.getStatus();
    const wsStatus = await webSocketService.getConnectionStats();

    return NextResponse.json({
      success: true,
      status: {
        gmpTracker: {
          isRunning: trackerStatus.isRunning,
          trackedIPOs: trackerStatus.trackedIPOs || 0,
          lastUpdate: trackerStatus.lastProcessedAt,
          performance: trackerStatus.performance,
        },
        webSocket: {
          connectedClients: wsStatus.connectedClients || 0,
          activeSubscriptions: wsStatus.activeSubscriptions || 0,
          gmpSubscriptions: wsStatus.gmpSubscriptions || 0,
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: Date.now(),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get status',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// Helper functions
function calculateTrend(values) {
  if (values.length < 3) return 'stable';

  const recent = values.slice(0, Math.ceil(values.length / 2));
  const older = values.slice(Math.ceil(values.length / 2));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 5) return 'bullish';
  if (change < -5) return 'bearish';
  return 'stable';
}

function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
