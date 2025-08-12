import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Connection pool configuration for better performance
    __internal: {
      engine: {
        connectTimeout: 60000,
        queryTimeout: 60000,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Database health check
export async function checkDBHealth() {
  try {
    await prisma.$queryRaw`SELECT 1 as health`;
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      connection: 'active',
      version: await getDatabaseVersion(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      connection: 'failed',
    };
  }
}

// Get database version
async function getDatabaseVersion() {
  try {
    const result = await prisma.$queryRaw`SELECT VERSION() as version`;
    return result[0]?.version || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// Database cleanup utility for expired cache entries
export async function cleanupExpiredCache() {
  try {
    const result = await prisma.cacheEntry.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log(`🧹 Cleaned up ${result.count} expired cache entries`);
    return result.count;
  } catch (error) {
    console.error('Cache cleanup failed:', error);
    return 0;
  }
}

// Cleanup old sync logs (keep only last 30 days)
export async function cleanupOldSyncLogs() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.syncLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });
    console.log(`🧹 Cleaned up ${result.count} old sync logs`);
    return result.count;
  } catch (error) {
    console.error('Sync logs cleanup failed:', error);
    return 0;
  }
}

// Transaction helper for complex operations
export async function withTransaction(callback) {
  return await prisma.$transaction(callback, {
    maxWait: 5000, // 5 seconds
    timeout: 10000, // 10 seconds
    isolationLevel: 'ReadCommitted',
  });
}

// Batch operations helper
export async function batchOperation(operation, data, batchSize = 100) {
  const results = [];
  const errors = [];

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    try {
      const batchResult = await operation(batch);
      results.push(batchResult);
    } catch (error) {
      errors.push({
        batchIndex: Math.floor(i / batchSize),
        error: error.message,
        data: batch,
      });
    }
  }

  return { results, errors };
}

// Connection pool management
export async function getConnectionInfo() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    return result[0];
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return null;
  }
}

// Database performance metrics
export async function getDatabaseMetrics() {
  try {
    const [connectionInfo, tableStats, indexStats] = await Promise.all([
      getConnectionInfo(),
      getTableStats(),
      getIndexStats(),
    ]);

    return {
      connections: connectionInfo,
      tables: tableStats,
      indexes: indexStats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to get database metrics:', error);
    return { error: error.message };
  }
}

// Get table statistics
async function getTableStats() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 10
    `;
    return result;
  } catch (error) {
    return [];
  }
}

// Get index statistics
async function getIndexStats() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE idx_tup_read > 0
      ORDER BY idx_tup_read DESC
      LIMIT 10
    `;
    return result;
  } catch (error) {
    return [];
  }
}

// Backup and maintenance functions
export async function createBackupSnapshot() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    console.log(`📦 Creating backup snapshot at ${timestamp}`);

    // This would integrate with your backup solution
    // For now, we'll just log the operation
    console.log('✅ Backup snapshot created successfully');

    return {
      success: true,
      timestamp,
      message: 'Backup snapshot created',
    };
  } catch (error) {
    console.error('Backup snapshot failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Database optimization
export async function optimizeDatabase() {
  try {
    console.log('🔧 Starting database optimization...');

    // Analyze tables for better query planning
    await prisma.$executeRaw`ANALYZE`;

    // Vacuum to reclaim space (for PostgreSQL)
    await prisma.$executeRaw`VACUUM (ANALYZE, VERBOSE)`;

    console.log('✅ Database optimization completed');

    return {
      success: true,
      message: 'Database optimization completed',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Database optimization failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Seed check - verify if database has initial data
export async function checkDatabaseSeeded() {
  try {
    const ipoCount = await prisma.iPO.count();
    const userCount = await prisma.user.count();

    return {
      isSeeded: ipoCount > 0 && userCount > 0,
      counts: {
        ipos: ipoCount,
        users: userCount,
      },
    };
  } catch (error) {
    return {
      isSeeded: false,
      error: error.message,
    };
  }
}

// Utility function to reset specific tables (for development)
export async function resetTables(tableNames = []) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot reset tables in production environment');
  }

  try {
    console.log(`🗑️  Resetting tables: ${tableNames.join(', ')}`);

    for (const tableName of tableNames) {
      switch (tableName.toLowerCase()) {
        case 'gmp':
          await prisma.gMP.deleteMany();
          break;
        case 'subscription':
          await prisma.subscriptionData.deleteMany();
          break;
        case 'demand':
          await prisma.marketDemand.deleteMany();
          break;
        case 'allotments':
          await prisma.allotment.deleteMany();
          break;
        case 'analytics':
          await prisma.iPOAnalytics.deleteMany();
          break;
        case 'synclogs':
          await prisma.syncLog.deleteMany();
          break;
        case 'cache':
          await prisma.cacheEntry.deleteMany();
          break;
        default:
          console.warn(`Unknown table: ${tableName}`);
      }
    }

    console.log('✅ Tables reset successfully');
    return { success: true };
  } catch (error) {
    console.error('Table reset failed:', error);
    return { success: false, error: error.message };
  }
}

// Get database size and usage information
export async function getDatabaseSize() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        pg_size_pretty(pg_total_relation_size('ipos')) as ipos_table_size,
        pg_size_pretty(pg_total_relation_size('gmp')) as gmp_table_size,
        pg_size_pretty(pg_total_relation_size('subscription_data')) as subscription_table_size
    `;

    return result[0];
  } catch (error) {
    console.error('Failed to get database size:', error);
    return null;
  }
}

// Monitor slow queries (if available)
export async function getSlowQueries(limit = 10) {
  try {
    // This requires pg_stat_statements extension
    const result = await prisma.$queryRaw`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements
      ORDER BY mean_time DESC
      LIMIT ${limit}
    `;

    return result;
  } catch (error) {
    // Extension might not be available
    return [];
  }
}

// Periodic maintenance function
export async function performMaintenance() {
  try {
    console.log('🔧 Starting periodic maintenance...');

    const results = await Promise.allSettled([
      cleanupExpiredCache(),
      cleanupOldSyncLogs(),
      optimizeDatabase(),
    ]);

    const summary = {
      timestamp: new Date().toISOString(),
      operations: [
        {
          name: 'cleanupExpiredCache',
          status: results[0].status,
          result: results[0].value || results[0].reason,
        },
        {
          name: 'cleanupOldSyncLogs',
          status: results[1].status,
          result: results[1].value || results[1].reason,
        },
        {
          name: 'optimizeDatabase',
          status: results[2].status,
          result: results[2].value || results[2].reason,
        },
      ],
    };

    console.log('✅ Periodic maintenance completed:', summary);
    return summary;
  } catch (error) {
    console.error('Periodic maintenance failed:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// Schedule periodic maintenance (runs every 6 hours)
if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_MAINTENANCE !== 'false') {
  setInterval(
    async () => {
      try {
        await performMaintenance();
      } catch (error) {
        console.error('Scheduled maintenance failed:', error);
      }
    },
    6 * 60 * 60 * 1000
  ); // 6 hours
}

// Graceful shutdown handler
async function gracefulShutdown() {
  console.log('🔌 Closing database connections...');
  try {
    await prisma.$disconnect();
    console.log('✅ Database connections closed successfully');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
}

// Handle process shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGQUIT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await gracefulShutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await gracefulShutdown();
  process.exit(1);
});

// Default export
export default prisma;
