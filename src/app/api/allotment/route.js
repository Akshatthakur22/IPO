import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/db.js';
import { cache } from '../../../lib/cache.js';
import { requireAuth } from '../../../lib/auth.js';
import { allotmentService } from '../../../services/allotment-service.js';

// Get allotment results with filtering and search
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const ipoId = searchParams.get('ipoId');
    const symbol = searchParams.get('symbol');
    const panNumber = searchParams.get('panNumber');
    const applicationNumber = searchParams.get('applicationNumber');
    const category = searchParams.get('category');
    const status = searchParams.get('allotmentStatus');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
    const includeStats = searchParams.get('includeStats') === 'true';

    // Build cache key
    const cacheKey = cache.key(
      'ALLOTMENT',
      `results:${JSON.stringify({
        ipoId,
        symbol,
        panNumber,
        applicationNumber,
        category,
        status,
        page,
        limit,
        includeStats,
      })}`
    );

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // Build where clause
    const whereClause = {};
    if (ipoId) whereClause.ipoId = ipoId;
    if (panNumber) whereClause.panNumber = { contains: panNumber.toUpperCase() };
    if (applicationNumber) whereClause.applicationNumber = { contains: applicationNumber };
    if (category) whereClause.category = category;
    if (status) whereClause.allotmentStatus = status;

    // Add IPO symbol filter
    if (symbol) {
      whereClause.ipo = { symbol: symbol.toUpperCase() };
    }

    // Execute query with pagination
    const offset = (page - 1) * limit;
    const [results, totalCount] = await Promise.all([
      prisma.allotmentResult.findMany({
        where: whereClause,
        include: {
          ipo: { select: { symbol: true, name: true, finalPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.allotmentResult.count({ where: whereClause }),
    ]);

    // Generate statistics if requested
    let statistics = null;
    if (includeStats && results.length > 0) {
      const allotted = results.filter((r) => r.allottedQuantity > 0);
      statistics = {
        total: results.length,
        allotted: allotted.length,
        notAllotted: results.length - allotted.length,
        allotmentRate: ((allotted.length / results.length) * 100).toFixed(2) + '%',
        totalRefund: results.reduce((sum, r) => sum + (r.refundAmount || 0), 0),
        avgAllotment:
          allotted.length > 0
            ? allotted.reduce((sum, r) => sum + r.allottedQuantity, 0) / allotted.length
            : 0,
      };
    }

    const response = {
      success: true,
      data: results,
      statistics,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      filters: {
        ipoId,
        symbol,
        panNumber,
        applicationNumber,
        category,
        status,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);
    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/allotment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch allotment results',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Check allotment status for user applications
export async function POST(request) {
  try {
    const body = await request.json();
    const { panNumber, ipoId, applicationNumbers, checkAll = false } = body;

    if (!panNumber) {
      return NextResponse.json(
        {
          success: false,
          error: 'PAN number is required',
        },
        { status: 400 }
      );
    }

    // Build where clause
    const whereClause = {
      panNumber: panNumber.toUpperCase(),
    };

    if (ipoId) whereClause.ipoId = ipoId;
    if (applicationNumbers && applicationNumbers.length > 0) {
      whereClause.applicationNumber = { in: applicationNumbers };
    }

    // Fetch allotment results
    const results = await prisma.allotmentResult.findMany({
      where: whereClause,
      include: {
        ipo: {
          select: {
            symbol: true,
            name: true,
            status: true,
            finalPrice: true,
            lotSize: true,
            listingDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no results found and checkAll is true, try to fetch from service
    if (results.length === 0 && checkAll) {
      try {
        // Get all IPOs for this PAN from user applications
        const userApplications = await prisma.userApplication.findMany({
          where: { panNumber: panNumber.toUpperCase() },
          include: { ipo: true },
        });

        // Check allotment for each IPO
        const serviceResults = await Promise.allSettled(
          userApplications.map((app) =>
            allotmentService.getUserAllotmentStatus(app.userId, app.ipoId)
          )
        );

        const combinedResults = serviceResults
          .filter((r) => r.status === 'fulfilled')
          .flatMap((r) => r.value);

        if (combinedResults.length > 0) {
          return NextResponse.json({
            success: true,
            data: combinedResults,
            message: 'Allotment data fetched from service',
            source: 'service',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (serviceError) {
        console.error('Service check failed:', serviceError);
      }
    }

    // Process results
    const processedResults = results.map((result) => ({
      id: result.id,
      panNumber: result.panNumber,
      applicationNumber: result.applicationNumber,
      category: result.category,
      appliedQuantity: result.appliedQuantity,
      appliedAmount: result.appliedAmount,
      allottedQuantity: result.allottedQuantity,
      allottedAmount: result.allottedAmount,
      refundAmount: result.refundAmount,
      allotmentStatus: result.allotmentStatus,
      ipo: result.ipo,
      createdAt: result.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: processedResults,
      summary: {
        total: results.length,
        allotted: results.filter((r) => r.allottedQuantity > 0).length,
        totalInvested: results.reduce((sum, r) => sum + (r.appliedAmount || 0), 0),
        totalAllotted: results.reduce((sum, r) => sum + (r.allottedAmount || 0), 0),
        totalRefund: results.reduce((sum, r) => sum + (r.refundAmount || 0), 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('POST /api/allotment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check allotment status',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Update allotment results (Admin only)
export async function PUT(request) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { ipoId, results } = body;

    if (!ipoId || !results || !Array.isArray(results)) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO ID and results array are required',
        },
        { status: 400 }
      );
    }

    // Process results in transaction
    const updatedResults = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const result of results) {
        const updated = await tx.allotmentResult.upsert({
          where: {
            ipoId_panNumber_applicationNumber: {
              ipoId,
              panNumber: result.panNumber.toUpperCase(),
              applicationNumber: result.applicationNumber,
            },
          },
          update: {
            category: result.category,
            appliedQuantity: result.appliedQuantity,
            appliedAmount: result.appliedAmount,
            allottedQuantity: result.allottedQuantity,
            allottedAmount: result.allottedAmount,
            refundAmount: result.refundAmount,
            allotmentStatus: result.allotmentStatus,
            finalPrice: result.finalPrice,
            updatedAt: new Date(),
          },
          create: {
            ipoId,
            panNumber: result.panNumber.toUpperCase(),
            applicationNumber: result.applicationNumber,
            category: result.category || 'RETAIL',
            appliedQuantity: result.appliedQuantity,
            appliedAmount: result.appliedAmount,
            allottedQuantity: result.allottedQuantity,
            allottedAmount: result.allottedAmount,
            refundAmount: result.refundAmount,
            allotmentStatus: result.allotmentStatus,
            finalPrice: result.finalPrice,
          },
        });
        processed.push(updated);
      }

      return processed;
    });

    // Clear relevant caches
    await cache.del(cache.key('ALLOTMENT', `*`));

    return NextResponse.json({
      success: true,
      data: {
        processed: updatedResults.length,
        ipoId,
      },
      message: 'Allotment results updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('PUT /api/allotment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update allotment results',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Delete allotment results (Admin only)
export async function DELETE(request) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const ipoId = searchParams.get('ipoId');
    const ids = searchParams.get('ids')?.split(',');

    if (!ipoId && !ids) {
      return NextResponse.json(
        {
          success: false,
          error: 'Either ipoId or ids parameter is required',
        },
        { status: 400 }
      );
    }

    // Build delete conditions
    const whereClause = {};
    if (ipoId) whereClause.ipoId = ipoId;
    if (ids) whereClause.id = { in: ids };

    // Delete results
    const result = await prisma.allotmentResult.deleteMany({
      where: whereClause,
    });

    // Clear caches
    await cache.del(cache.key('ALLOTMENT', `*`));

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
      message: `Deleted ${result.count} allotment results`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('DELETE /api/allotment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete allotment results',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
