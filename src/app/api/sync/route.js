import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { cache } from '../../../lib/cache';
import { requireAuth } from '../../../lib/auth';
import { gmpTrackerService } from '../../../services/gmp-tracker.js';
import { subscriptionTrackerService } from '../../../services/subscription-tracker.js';
import { allotmentService } from '../../../services/allotment-service.js';
import { analyticsService } from '../../../lib/analytics.js';

// Get sync status and trigger sync operations
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const detailed = searchParams.get('detailed') === 'true';

    // Get all service statuses
    const syncStatus = {
      gmpTracker: gmpTrackerService.getStatus(),
      subscriptionTracker: subscriptionTrackerService.getStatus(),
      allotmentService: allotmentService.getStatus(),
      analytics: analyticsService.getHealthStatus(),
      database: await getDatabaseStatus(),
      cache: await cache.healthCheck(),
      lastSync: await getLastSyncTimes(),
    };

    // Add detailed info if requested
    if (detailed) {
      syncStatus.performance = await getPerformanceMetrics();
      syncStatus.dataHealth = await getDataHealthMetrics();
    }

    // Filter by specific service if requested
    if (service && syncStatus[service]) {
      return NextResponse.json({
        success: true,
        service,
        status: syncStatus[service],
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      status: syncStatus,
      overall: calculateOverallHealth(syncStatus),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get sync status',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Trigger sync operations (Admin only)
export async function POST(request) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { action, service, options = {} } = body;

    let result;

    switch (action) {
      case 'start_service':
        result = await startService(service, options);
        break;

      case 'stop_service':
        result = await stopService(service);
        break;

      case 'restart_service':
        result = await restartService(service);
        break;

      case 'sync_all':
        result = await syncAllServices(options);
        break;

      case 'clear_cache':
        result = await clearCache(options.pattern);
        break;

      case 'health_check':
        result = await performHealthCheck();
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action',
            availableActions: [
              'start_service',
              'stop_service',
              'restart_service',
              'sync_all',
              'clear_cache',
              'health_check',
            ],
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      action,
      service,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('POST /api/sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute sync operation',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Service management functions
async function startService(serviceName, options) {
  switch (serviceName) {
    case 'gmp_tracker':
      if (!gmpTrackerService.getStatus().isRunning) {
        await gmpTrackerService.start();
        return { status: 'started', service: 'GMP Tracker' };
      }
      return { status: 'already_running', service: 'GMP Tracker' };

    case 'subscription_tracker':
      if (!subscriptionTrackerService.getStatus().isRunning) {
        await subscriptionTrackerService.start();
        return { status: 'started', service: 'Subscription Tracker' };
      }
      return { status: 'already_running', service: 'Subscription Tracker' };

    case 'allotment_service':
      if (!allotmentService.getStatus().isRunning) {
        await allotmentService.start();
        return { status: 'started', service: 'Allotment Service' };
      }
      return { status: 'already_running', service: 'Allotment Service' };

    default:
      throw new Error(`Unknown service: ${serviceName}`);
  }
}

async function stopService(serviceName) {
  switch (serviceName) {
    case 'gmp_tracker':
      if (gmpTrackerService.getStatus().isRunning) {
        await gmpTrackerService.stop();
        return { status: 'stopped', service: 'GMP Tracker' };
      }
      return { status: 'already_stopped', service: 'GMP Tracker' };

    case 'subscription_tracker':
      if (subscriptionTrackerService.getStatus().isRunning) {
        await subscriptionTrackerService.stop();
        return { status: 'stopped', service: 'Subscription Tracker' };
      }
      return { status: 'already_stopped', service: 'Subscription Tracker' };

    case 'allotment_service':
      if (allotmentService.getStatus().isRunning) {
        await allotmentService.stop();
        return { status: 'stopped', service: 'Allotment Service' };
      }
      return { status: 'already_stopped', service: 'Allotment Service' };

    default:
      throw new Error(`Unknown service: ${serviceName}`);
  }
}

async function restartService(serviceName) {
  await stopService(serviceName);
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
  return await startService(serviceName);
}

async function syncAllServices(options) {
  const results = {};
  const services = ['gmp_tracker', 'subscription_tracker', 'allotment_service'];

  for (const service of services) {
    try {
      if (options.restart) {
        results[service] = await restartService(service);
      } else {
        results[service] = await startService(service);
      }
    } catch (error) {
      results[service] = { error: error.message };
    }
  }

  // Trigger analytics refresh
  try {
    const activeIPOs = await prisma.iPO.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 10,
    });

    const analyticsResults = await Promise.allSettled(
      activeIPOs.map((ipo) => analyticsService.computeIPOAnalytics(ipo.id, { lightweight: true }))
    );

    results.analytics = {
      refreshed: analyticsResults.filter((r) => r.status === 'fulfilled').length,
      failed: analyticsResults.filter((r) => r.status === 'rejected').length,
    };
  } catch (error) {
    results.analytics = { error: error.message };
  }

  return results;
}

async function clearCache(pattern) {
  try {
    const cleared = await cache.del(pattern || '*');
    return { cleared, pattern: pattern || 'all' };
  } catch (error) {
    throw new Error(`Cache clear failed: ${error.message}`);
  }
}

async function performHealthCheck() {
  const health = {
    services: {},
    database: false,
    cache: false,
    overall: 'unknown',
  };

  // Check services
  health.services.gmpTracker = gmpTrackerService.getStatus().isRunning;
  health.services.subscriptionTracker = subscriptionTrackerService.getStatus().isRunning;
  health.services.allotmentService = allotmentService.getStatus().isRunning;

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = true;
  } catch (error) {
    health.database = false;
  }

  // Check cache
  try {
    const cacheHealth = await cache.healthCheck();
    health.cache = cacheHealth.status === 'healthy';
  } catch (error) {
    health.cache = false;
  }

  // Calculate overall health
  const serviceCount = Object.values(health.services).filter(Boolean).length;
  const totalServices = Object.keys(health.services).length;

  if (health.database && health.cache && serviceCount === totalServices) {
    health.overall = 'healthy';
  } else if (health.database && serviceCount > 0) {
    health.overall = 'degraded';
  } else {
    health.overall = 'unhealthy';
  }

  return health;
}

// Helper functions
async function getDatabaseStatus() {
  try {
    const [ipoCount, gmpCount, subscriptionCount] = await Promise.all([
      prisma.iPO.count(),
      prisma.gMP.count(),
      prisma.subscriptionData.count(),
    ]);

    return {
      connected: true,
      counts: {
        ipos: ipoCount,
        gmp: gmpCount,
        subscriptions: subscriptionCount,
      },
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function getLastSyncTimes() {
  try {
    const [lastGMP, lastSubscription] = await Promise.all([
      prisma.gMP.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.subscriptionData.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    return {
      gmp: lastGMP?.timestamp,
      subscription: lastSubscription?.timestamp,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function getPerformanceMetrics() {
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: Date.now(),
  };
}

async function getDataHealthMetrics() {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentGMP, recentSubscriptions, activeIPOs] = await Promise.all([
      prisma.gMP.count({ where: { timestamp: { gte: since24h } } }),
      prisma.subscriptionData.count({
        where: { timestamp: { gte: since24h } },
      }),
      prisma.iPO.count({ where: { isActive: true, status: 'open' } }),
    ]);

    return {
      recentData: { gmp: recentGMP, subscriptions: recentSubscriptions },
      activeIPOs,
      dataFreshness: {
        gmp: recentGMP > 0 ? 'fresh' : 'stale',
        subscriptions: recentSubscriptions > 0 ? 'fresh' : 'stale',
      },
    };
  } catch (error) {
    return { error: error.message };
  }
}

function calculateOverallHealth(status) {
  const checks = [
    status.gmpTracker?.isRunning,
    status.subscriptionTracker?.isRunning,
    status.database?.connected,
    status.cache?.status === 'healthy',
  ];

  const healthy = checks.filter(Boolean).length;
  const total = checks.length;

  if (healthy === total) return 'healthy';
  if (healthy >= total * 0.7) return 'degraded';
  return 'unhealthy';
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
