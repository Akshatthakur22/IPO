import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db.js';
import { cache } from '../../../../lib/cache.js';
import { requireAuth } from '../../../../lib/auth.js';
import { analyticsService } from '../../../../lib/analytics.js';
import { predictionService } from '../../../../services/prediction-service.js';
import { webSocketService } from '../../../../lib/websocket.js';

// Get specific IPO by ID with comprehensive data
export async function GET(request, { params }) {
  try {
    const { id } = params;

    // Validate ID format
    if (!id || (id.length !== 24 && !/^\d+$/.test(id))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid IPO ID format',
          message: 'ID must be a valid ObjectId or numeric ID',
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Extract query parameters for data inclusion
    const includeAnalytics = searchParams.get('includeAnalytics') !== 'false'; // Default true
    const includePredictions = searchParams.get('includePredictions') !== 'false'; // Default true
    const includeGMP = searchParams.get('includeGMP') !== 'false'; // Default true
    const includeSubscription = searchParams.get('includeSubscription') !== 'false'; // Default true
    const includeDemand = searchParams.get('includeDemand') === 'true';
    const includeAllotment = searchParams.get('includeAllotment') === 'true';
    const includeApplications = searchParams.get('includeApplications') === 'true';
    const gmpLimit = parseInt(searchParams.get('gmpLimit')) || 50;
    const subscriptionLimit = parseInt(searchParams.get('subscriptionLimit')) || 50;
    const demandLimit = parseInt(searchParams.get('demandLimit')) || 20;
    const includeTimeline = searchParams.get('includeTimeline') !== 'false'; // Default true
    const includeInsights = searchParams.get('includeInsights') !== 'false'; // Default true

    // Build cache key
    const cacheKey = cache.key(
      'API',
      `ipo:${id}:${JSON.stringify({
        includeAnalytics,
        includePredictions,
        includeGMP,
        includeSubscription,
        includeDemand,
        includeAllotment,
        includeApplications,
        gmpLimit,
        subscriptionLimit,
        demandLimit,
        includeTimeline,
        includeInsights,
      })}`
    );

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
        cacheTime: new Date().toISOString(),
      });
    }

    // Build comprehensive include clause
    const includeClause = {
      categories: {
        orderBy: { categoryCode: 'asc' },
      },
    };

    // Conditional includes based on parameters
    if (includeGMP) {
      includeClause.gmp = {
        orderBy: { timestamp: 'desc' },
        take: gmpLimit,
        select: {
          id: true,
          value: true,
          percentage: true,
          volume: true,
          source: true,
          timestamp: true,
          date: true,
          bidPrice: true,
          askPrice: true,
          metadata: true,
        },
      };
    }

    if (includeSubscription) {
      includeClause.subscription = {
        orderBy: { timestamp: 'desc' },
        take: subscriptionLimit,
        select: {
          id: true,
          category: true,
          subCategory: true,
          quantity: true,
          bidCount: true,
          subscriptionRatio: true,
          timestamp: true,
          metadata: true,
        },
      };
    }

    if (includeDemand) {
      includeClause.demand = {
        orderBy: { timestamp: 'desc' },
        take: demandLimit,
        select: {
          id: true,
          pricePoint: true,
          quantity: true,
          bidCount: true,
          timestamp: true,
          category: true,
        },
      };
    }

    if (includeAnalytics) {
      includeClause.analytics = true;
    }

    if (includeAllotment) {
      includeClause.allotmentResults = {
        take: 100, // Sample of allotment results
        select: {
          id: true,
          panNumber: true,
          applicationNumber: true,
          category: true,
          appliedQuantity: true,
          allottedQuantity: true,
          allottedAmount: true,
          refundAmount: true,
          allotmentStatus: true,
          createdAt: true,
        },
      };
    }

    if (includeApplications) {
      includeClause.applications = {
        take: 50,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          userId: true,
          category: true,
          quantity: true,
          amount: true,
          applicationNumber: true,
          status: true,
          allotmentStatus: true,
          submittedAt: true,
        },
      };
    }

    // Fetch IPO data
    const ipo = await prisma.iPO.findUnique({
      where: { id },
      include: includeClause,
    });

    if (!ipo) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not found',
          message: `No IPO found with ID: ${id}`,
        },
        { status: 404 }
      );
    }

    // Check if IPO is active
    if (!ipo.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not available',
          message: 'This IPO is not currently active',
        },
        { status: 410 }
      );
    }

    // Process and enhance IPO data
    const processedIPO = await processIPOData(ipo, {
      includeAnalytics,
      includePredictions,
      includeGMP,
      includeSubscription,
      includeDemand,
      includeAllotment,
      includeApplications,
      includeTimeline,
      includeInsights,
    });

    // Cache the response for 1 minute (short cache for real-time data)
    await cache.set(cacheKey, processedIPO, 60);

    return NextResponse.json({
      success: true,
      ...processedIPO,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`GET /api/ipos/${params?.id} error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch IPO details',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Update specific IPO (Admin only)
export async function PUT(request, { params }) {
  try {
    const { id } = params;

    // Require admin authentication
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Validate ID
    if (!id || (id.length !== 24 && !/^\d+$/.test(id))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid IPO ID format',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate that IPO exists
    const existingIPO = await prisma.iPO.findUnique({
      where: { id },
      select: { id: true, symbol: true, status: true },
    });

    if (!existingIPO) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not found',
        },
        { status: 404 }
      );
    }

    // Build update data
    const updateData = {
      updatedAt: new Date(),
    };

    // Handle different field updates with validation
    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }

    if (body.sector !== undefined) {
      updateData.sector = body.sector?.trim();
    }

    if (body.openDate !== undefined) {
      updateData.openDate = new Date(body.openDate);
    }

    if (body.closeDate !== undefined) {
      updateData.closeDate = new Date(body.closeDate);
    }

    if (body.listingDate !== undefined) {
      updateData.listingDate = body.listingDate ? new Date(body.listingDate) : null;
    }

    if (body.allotmentDate !== undefined) {
      updateData.allotmentDate = body.allotmentDate ? new Date(body.allotmentDate) : null;
    }

    if (body.minPrice !== undefined) {
      updateData.minPrice = parseFloat(body.minPrice);
    }

    if (body.maxPrice !== undefined) {
      updateData.maxPrice = parseFloat(body.maxPrice);
    }

    if (body.cutOffPrice !== undefined) {
      updateData.cutOffPrice = body.cutOffPrice ? parseFloat(body.cutOffPrice) : null;
    }

    if (body.listingPrice !== undefined) {
      updateData.listingPrice = body.listingPrice ? parseFloat(body.listingPrice) : null;
    }

    if (body.lotSize !== undefined) {
      updateData.lotSize = parseInt(body.lotSize);
    }

    if (body.faceValue !== undefined) {
      updateData.faceValue = parseFloat(body.faceValue);
    }

    if (body.issueSize !== undefined) {
      updateData.issueSize = BigInt(body.issueSize);
    }

    if (body.issueType !== undefined) {
      updateData.issueType = body.issueType;
    }

    if (body.subType !== undefined) {
      updateData.subType = body.subType;
    }

    if (body.registrar !== undefined) {
      updateData.registrar = body.registrar.trim();
    }

    if (body.leadManagers !== undefined) {
      updateData.leadManagers = Array.isArray(body.leadManagers) ? body.leadManagers : [];
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    // Validate business rules
    const validationErrors = [];

    if (
      updateData.openDate &&
      updateData.closeDate &&
      updateData.openDate >= updateData.closeDate
    ) {
      validationErrors.push('openDate must be before closeDate');
    }

    if (
      updateData.minPrice !== undefined &&
      updateData.maxPrice !== undefined &&
      updateData.minPrice >= updateData.maxPrice
    ) {
      validationErrors.push('minPrice must be less than maxPrice');
    }

    if (updateData.lotSize !== undefined && updateData.lotSize <= 0) {
      validationErrors.push('lotSize must be positive');
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          validationErrors,
        },
        { status: 400 }
      );
    }

    // Perform update in transaction
    const updatedIPO = await prisma.$transaction(async (tx) => {
      // Update main IPO record
      const ipo = await tx.iPO.update({
        where: { id },
        data: updateData,
        include: {
          categories: true,
          analytics: true,
        },
      });

      // Handle category updates if provided
      if (body.categories && Array.isArray(body.categories)) {
        // Delete existing categories
        await tx.iPOCategory.deleteMany({
          where: { ipoId: id },
        });

        // Create new categories
        if (body.categories.length > 0) {
          const categoryData = body.categories.map((category) => ({
            ipoId: id,
            categoryCode: category.categoryCode,
            subCategoryCode: category.subCategoryCode || null,
            minValue: category.minValue || null,
            maxValue: category.maxValue || null,
            maxQuantity: category.maxQuantity ? BigInt(category.maxQuantity) : null,
            maxUpiLimit: category.maxUpiLimit || null,
            allowCutOff: Boolean(category.allowCutOff),
            allowUpi: Boolean(category.allowUpi),
            discountType: category.discountType || null,
            discountPrice: category.discountPrice || null,
            startTime: category.startTime ? new Date(category.startTime) : null,
            endTime: category.endTime ? new Date(category.endTime) : null,
          }));

          await tx.iPOCategory.createMany({
            data: categoryData,
          });
        }

        // Refresh categories in result
        ipo.categories = await tx.iPOCategory.findMany({
          where: { ipoId: id },
          orderBy: { categoryCode: 'asc' },
        });
      }

      return ipo;
    });

    // Clear related caches
    await Promise.all([
      cache.del(cache.key('API', `ipo:${id}:*`)),
      cache.del(cache.key('API', 'ipos:*')),
      cache.del(cache.key('IPO', `detail:${id}`)),
      cache.del(cache.key('IPO', 'list:*')),
    ]);

    // Trigger analytics recalculation if significant changes
    const significantFields = ['status', 'listingPrice', 'cutOffPrice'];
    const hasSignificantChanges = significantFields.some(
      (field) => updateData[field] !== undefined
    );

    if (hasSignificantChanges) {
      try {
        await analyticsService.computeIPOAnalytics(id, {
          includeHistorical: true,
          includePredictions: true,
        });
      } catch (error) {
        console.error('Error recalculating analytics after update:', error);
      }
    }

    // Broadcast update notification
    await webSocketService.broadcastIPOUpdate(id, {
      type: 'ipo_updated',
      changes: Object.keys(updateData),
      updatedBy: authResult.user?.id,
      timestamp: Date.now(),
    });

    console.log(`✅ Updated IPO: ${existingIPO.symbol} (ID: ${id})`);

    return NextResponse.json({
      success: true,
      data: {
        ...updatedIPO,
        issueSize: updatedIPO.issueSize?.toString(), // Convert BigInt
      },
      message: 'IPO updated successfully',
      changes: Object.keys(updateData),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`PUT /api/ipos/${params?.id} error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update IPO',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Partially update IPO (Admin only)
export async function PATCH(request, { params }) {
  try {
    const { id } = params;

    // Require admin authentication
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Validate ID
    if (!id || (id.length !== 24 && !/^\d+$/.test(id))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid IPO ID format',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Special operations
    if (body.operation) {
      return await handleSpecialOperations(id, body.operation, body.data, authResult);
    }

    // Standard patch operation
    const updateData = {
      ...body,
      updatedAt: new Date(),
    };

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Handle BigInt conversion
    if (updateData.issueSize) {
      updateData.issueSize = BigInt(updateData.issueSize);
    }

    // Update IPO
    const updatedIPO = await prisma.iPO.update({
      where: { id },
      data: updateData,
      include: {
        categories: true,
        analytics: true,
      },
    });

    // Clear caches
    await cache.del(cache.key('API', `ipo:${id}:*`));

    return NextResponse.json({
      success: true,
      data: {
        ...updatedIPO,
        issueSize: updatedIPO.issueSize?.toString(),
      },
      message: 'IPO updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`PATCH /api/ipos/${params?.id} error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to patch IPO',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Delete specific IPO (Super Admin only)
export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    // Require super admin authentication
    const authResult = await requireAuth({ roles: ['super_admin'] })(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Validate ID
    if (!id || (id.length !== 24 && !/^\d+$/.test(id))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid IPO ID format',
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const soft = searchParams.get('soft') !== 'false'; // Default to soft delete

    // Check if IPO exists
    const existingIPO = await prisma.iPO.findUnique({
      where: { id },
      select: { id: true, symbol: true, name: true, isActive: true },
    });

    if (!existingIPO) {
      return NextResponse.json(
        {
          success: false,
          error: 'IPO not found',
        },
        { status: 404 }
      );
    }

    let result;

    if (soft) {
      // Soft delete - mark as inactive
      result = await prisma.iPO.update({
        where: { id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });
    } else {
      // Hard delete - remove completely
      await prisma.$transaction(async (tx) => {
        // Delete in correct order to avoid foreign key constraints
        await tx.prediction.deleteMany({ where: { ipoId: id } });
        await tx.allotmentResult.deleteMany({ where: { ipoId: id } });
        await tx.userApplication.deleteMany({ where: { ipoId: id } });
        await tx.marketDemand.deleteMany({ where: { ipoId: id } });
        await tx.subscriptionData.deleteMany({ where: { ipoId: id } });
        await tx.gMP.deleteMany({ where: { ipoId: id } });
        await tx.iPOAnalytics.deleteMany({ where: { ipoId: id } });
        await tx.iPOCategory.deleteMany({ where: { ipoId: id } });

        // Finally delete the IPO
        result = await tx.iPO.delete({ where: { id } });
      });
    }

    // Clear all related caches
    await Promise.all([
      cache.del(cache.key('API', `ipo:${id}:*`)),
      cache.del(cache.key('API', 'ipos:*')),
      cache.del(cache.key('IPO', `detail:${id}`)),
      cache.del(cache.key('IPO', 'list:*')),
      cache.del(cache.key('GMP', `ipo:${id}:*`)),
      cache.del(cache.key('SUBSCRIPTION', `ipo:${id}:*`)),
      cache.del(cache.key('ANALYTICS', `ipo:${id}:*`)),
    ]);

    // Broadcast deletion notification
    await webSocketService.broadcastSystemStatus({
      type: soft ? 'ipo_deactivated' : 'ipo_deleted',
      ipoId: id,
      symbol: existingIPO.symbol,
      deletedBy: authResult.user?.id,
      timestamp: Date.now(),
    });

    console.log(`✅ ${soft ? 'Deactivated' : 'Deleted'} IPO: ${existingIPO.symbol} (ID: ${id})`);

    return NextResponse.json({
      success: true,
      data: {
        id,
        symbol: existingIPO.symbol,
        name: existingIPO.name,
        method: soft ? 'deactivated' : 'permanently deleted',
      },
      message: `IPO ${soft ? 'deactivated' : 'deleted'} successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`DELETE /api/ipos/${params?.id} error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete IPO',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Process IPO data with enhancements
async function processIPOData(ipo, options) {
  const {
    includeAnalytics,
    includePredictions,
    includeGMP,
    includeSubscription,
    includeDemand,
    includeAllotment,
    includeApplications,
    includeTimeline,
    includeInsights,
  } = options;

  // Base IPO data
  const processedIPO = {
    data: {
      id: ipo.id,
      symbol: ipo.symbol,
      name: ipo.name,
      sector: ipo.sector,
      status: ipo.status,
      openDate: ipo.openDate,
      closeDate: ipo.closeDate,
      listingDate: ipo.listingDate,
      allotmentDate: ipo.allotmentDate,
      minPrice: ipo.minPrice,
      maxPrice: ipo.maxPrice,
      cutOffPrice: ipo.cutOffPrice,
      listingPrice: ipo.listingPrice,
      lotSize: ipo.lotSize,
      faceValue: ipo.faceValue,
      issueSize: ipo.issueSize?.toString(),
      issueType: ipo.issueType,
      subType: ipo.subType,
      registrar: ipo.registrar,
      leadManagers: ipo.leadManagers,
      categories: ipo.categories,
      isActive: ipo.isActive,
      createdAt: ipo.createdAt,
      updatedAt: ipo.updatedAt,

      // Computed fields
      priceRange: {
        min: ipo.minPrice,
        max: ipo.maxPrice,
        spread: ipo.maxPrice - ipo.minPrice,
        spreadPercentage:
          ipo.minPrice > 0
            ? parseFloat((((ipo.maxPrice - ipo.minPrice) / ipo.minPrice) * 100).toFixed(2))
            : 0,
      },

      investment: {
        minInvestment: ipo.lotSize * ipo.minPrice,
        maxInvestment: ipo.lotSize * ipo.maxPrice,
        cutOffInvestment: ipo.cutOffPrice ? ipo.lotSize * ipo.cutOffPrice : null,
        retailMaxInvestment: Math.min(ipo.lotSize * ipo.maxPrice * 13, 200000), // 13 lots or 2L max
      },

      marketCap: ipo.listingPrice
        ? {
            current: calculateMarketCap(ipo, ipo.listingPrice),
            atMaxPrice: calculateMarketCap(ipo, ipo.maxPrice),
            atMinPrice: calculateMarketCap(ipo, ipo.minPrice),
          }
        : null,
    },
  };

  // Add timeline if requested
  if (includeTimeline) {
    processedIPO.timeline = calculateTimeline(ipo);
  }

  // Add GMP data if requested
  if (includeGMP && ipo.gmp) {
    processedIPO.gmp = processGMPData(ipo.gmp);
  }

  // Add subscription data if requested
  if (includeSubscription && ipo.subscription) {
    processedIPO.subscription = processSubscriptionData(ipo.subscription);
  }

  // Add demand data if requested
  if (includeDemand && ipo.demand) {
    processedIPO.demand = processDemandData(ipo.demand);
  }

  // Add analytics if requested
  if (includeAnalytics && ipo.analytics) {
    processedIPO.analytics = {
      ...ipo.analytics,
      computed: {
        gmpAccuracy: calculateGMPAccuracy(ipo),
        subscriptionTrend: calculateSubscriptionTrend(ipo),
        demandAnalysis: calculateDemandAnalysis(ipo),
      },
    };
  }

  // Add predictions if requested
  if (includePredictions) {
    try {
      const [listingGain, marketSentiment, ipoSuccess, allotmentProb] = await Promise.allSettled([
        predictionService.predictListingGain(ipo.id),
        predictionService.predictMarketSentiment(ipo.id),
        predictionService.predictIPOSuccess(ipo.id),
        predictionService.predictAllotmentProbability(null, ipo.id, {
          category: 'RETAIL',
        }),
      ]);

      processedIPO.predictions = {
        listingGain: listingGain.status === 'fulfilled' ? listingGain.value : null,
        marketSentiment: marketSentiment.status === 'fulfilled' ? marketSentiment.value : null,
        ipoSuccess: ipoSuccess.status === 'fulfilled' ? ipoSuccess.value : null,
        allotmentProbability: allotmentProb.status === 'fulfilled' ? allotmentProb.value : null,
        lastUpdated: new Date().toISOString(),
        disclaimer:
          'Predictions are based on historical data and market analysis. Actual results may vary.',
      };
    } catch (error) {
      console.error('Error fetching predictions:', error);
      processedIPO.predictions = {
        error: 'Predictions temporarily unavailable',
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  // Add allotment results if requested
  if (includeAllotment && ipo.allotmentResults) {
    processedIPO.allotment = processAllotmentData(ipo.allotmentResults);
  }

  // Add applications if requested
  if (includeApplications && ipo.applications) {
    processedIPO.applications = processApplicationData(ipo.applications);
  }

  // Add insights if requested
  if (includeInsights) {
    processedIPO.insights = await generateInsights(ipo, processedIPO);
  }

  return processedIPO;
}

// Handle special operations
async function handleSpecialOperations(ipoId, operation, data, authResult) {
  switch (operation) {
    case 'refresh_analytics':
      try {
        const analytics = await analyticsService.computeIPOAnalytics(ipoId, {
          includeHistorical: true,
          includePredictions: true,
          forceRefresh: true,
        });

        await cache.del(cache.key('API', `ipo:${ipoId}:*`));

        return NextResponse.json({
          success: true,
          data: { analytics },
          message: 'Analytics refreshed successfully',
          operation,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to refresh analytics',
            message: error.message,
          },
          { status: 500 }
        );
      }

    case 'update_status':
      try {
        const newStatus = data.status;
        const validStatuses = ['upcoming', 'open', 'closed', 'listed'];

        if (!validStatuses.includes(newStatus)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Invalid status',
              validStatuses,
            },
            { status: 400 }
          );
        }

        const updatedIPO = await prisma.iPO.update({
          where: { id: ipoId },
          data: {
            status: newStatus,
            updatedAt: new Date(),
          },
        });

        await cache.del(cache.key('API', `ipo:${ipoId}:*`));

        // Broadcast status change
        await webSocketService.broadcastIPOUpdate(ipoId, {
          type: 'status_changed',
          newStatus,
          changedBy: authResult.user?.id,
          timestamp: Date.now(),
        });

        return NextResponse.json({
          success: true,
          data: {
            id: ipoId,
            status: newStatus,
            previousStatus: data.previousStatus,
          },
          message: 'Status updated successfully',
          operation,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to update status',
            message: error.message,
          },
          { status: 500 }
        );
      }

    case 'clear_cache':
      try {
        await Promise.all([
          cache.del(cache.key('API', `ipo:${ipoId}:*`)),
          cache.del(cache.key('IPO', `detail:${ipoId}`)),
          cache.del(cache.key('GMP', `ipo:${ipoId}:*`)),
          cache.del(cache.key('SUBSCRIPTION', `ipo:${ipoId}:*`)),
          cache.del(cache.key('ANALYTICS', `ipo:${ipoId}:*`)),
        ]);

        return NextResponse.json({
          success: true,
          message: 'Cache cleared successfully',
          operation,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to clear cache',
            message: error.message,
          },
          { status: 500 }
        );
      }

    default:
      return NextResponse.json(
        {
          success: false,
          error: 'Unknown operation',
          availableOperations: ['refresh_analytics', 'update_status', 'clear_cache'],
        },
        { status: 400 }
      );
  }
}

// Helper functions
function calculateTimeline(ipo) {
  const now = new Date();

  return {
    current: {
      phase: determineCurrentPhase(ipo, now),
      daysFromOpen: ipo.openDate
        ? Math.floor((now - new Date(ipo.openDate)) / (1000 * 60 * 60 * 24))
        : null,
      daysFromClose: ipo.closeDate
        ? Math.floor((now - new Date(ipo.closeDate)) / (1000 * 60 * 60 * 24))
        : null,
    },
    upcoming: {
      daysToOpen:
        ipo.openDate && new Date(ipo.openDate) > now
          ? Math.ceil((new Date(ipo.openDate) - now) / (1000 * 60 * 60 * 24))
          : null,
      daysToClose:
        ipo.closeDate && new Date(ipo.closeDate) > now
          ? Math.ceil((new Date(ipo.closeDate) - now) / (1000 * 60 * 60 * 24))
          : null,
      daysToListing:
        ipo.listingDate && new Date(ipo.listingDate) > now
          ? Math.ceil((new Date(ipo.listingDate) - now) / (1000 * 60 * 60 * 24))
          : null,
      daysToAllotment:
        ipo.allotmentDate && new Date(ipo.allotmentDate) > now
          ? Math.ceil((new Date(ipo.allotmentDate) - now) / (1000 * 60 * 60 * 24))
          : null,
    },
    duration: {
      bidding:
        ipo.openDate && ipo.closeDate
          ? Math.ceil((new Date(ipo.closeDate) - new Date(ipo.openDate)) / (1000 * 60 * 60 * 24))
          : null,
      toAllotment:
        ipo.closeDate && ipo.allotmentDate
          ? Math.ceil(
              (new Date(ipo.allotmentDate) - new Date(ipo.closeDate)) / (1000 * 60 * 60 * 24)
            )
          : null,
      toListing:
        ipo.closeDate && ipo.listingDate
          ? Math.ceil((new Date(ipo.listingDate) - new Date(ipo.closeDate)) / (1000 * 60 * 60 * 24))
          : null,
    },
  };
}

function determineCurrentPhase(ipo, now) {
  if (ipo.listingDate && now >= new Date(ipo.listingDate)) {
    return 'listed';
  } else if (ipo.closeDate && now > new Date(ipo.closeDate)) {
    if (ipo.allotmentDate && now < new Date(ipo.allotmentDate)) {
      return 'allotment_pending';
    }
    return 'closed';
  } else if (ipo.openDate && now >= new Date(ipo.openDate) && now <= new Date(ipo.closeDate)) {
    return 'open';
  } else {
    return 'upcoming';
  }
}

function processGMPData(gmpRecords) {
  if (!gmpRecords || gmpRecords.length === 0) {
    return {
      current: null,
      history: [],
      statistics: null,
      trend: 'stable',
    };
  }

  const latest = gmpRecords[0];
  const values = gmpRecords.map((g) => g.value);

  return {
    current: {
      value: latest.value,
      percentage: latest.percentage,
      volume: latest.volume,
      spread: latest.askPrice && latest.bidPrice ? latest.askPrice - latest.bidPrice : null,
      timestamp: latest.timestamp,
      source: latest.source,
    },
    history: gmpRecords.map((g) => ({
      value: g.value,
      percentage: g.percentage,
      volume: g.volume,
      timestamp: g.timestamp,
      source: g.source,
    })),
    statistics: {
      count: gmpRecords.length,
      average: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      highest: Math.max(...values),
      lowest: Math.min(...values),
      volatility: calculateVolatility(values),
      volume: gmpRecords.reduce((sum, g) => sum + (g.volume || 0), 0),
    },
    trend: calculateGMPTrend(values),
  };
}

function processSubscriptionData(subscriptionRecords) {
  if (!subscriptionRecords || subscriptionRecords.length === 0) {
    return {
      current: { overall: 0, categories: {} },
      history: [],
      summary: null,
    };
  }

  // Group by category and get latest
  const categoryMap = new Map();
  const timeline = [];

  subscriptionRecords.forEach((sub) => {
    const key = `${sub.category}_${sub.subCategory || ''}`;
    if (!categoryMap.has(key) || sub.timestamp > categoryMap.get(key).timestamp) {
      categoryMap.set(key, sub);
    }
    timeline.push({
      category: sub.category,
      subCategory: sub.subCategory,
      subscriptionRatio: sub.subscriptionRatio,
      quantity: sub.quantity?.toString(),
      bidCount: sub.bidCount,
      timestamp: sub.timestamp,
    });
  });

  // Calculate overall subscription
  const categorySubscriptions = {};
  let overallSubscription = 0;

  for (const [key, sub] of categoryMap) {
    const categoryKey = key.split('_')[0];
    categorySubscriptions[categoryKey] = {
      subscriptionRatio: sub.subscriptionRatio,
      quantity: sub.quantity?.toString(),
      bidCount: sub.bidCount,
      timestamp: sub.timestamp,
    };
    overallSubscription = Math.max(overallSubscription, sub.subscriptionRatio);
  }

  return {
    current: {
      overall: overallSubscription,
      categories: categorySubscriptions,
      isOversubscribed: overallSubscription > 1,
      lastUpdated: subscriptionRecords[0].timestamp,
    },
    history: timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    summary: {
      totalRecords: subscriptionRecords.length,
      categoriesTracked: categoryMap.size,
      peakSubscription: Math.max(...subscriptionRecords.map((s) => s.subscriptionRatio)),
      averageSubscription:
        subscriptionRecords.reduce((sum, s) => sum + s.subscriptionRatio, 0) /
        subscriptionRecords.length,
    },
  };
}

function processDemandData(demandRecords) {
  if (!demandRecords || demandRecords.length === 0) {
    return { current: null, history: [], analysis: null };
  }

  // Group by price point
  const demandByPrice = new Map();
  demandRecords.forEach((demand) => {
    const key = `${demand.pricePoint}_${demand.category || 'ALL'}`;
    if (!demandByPrice.has(key)) {
      demandByPrice.set(key, []);
    }
    demandByPrice.get(key).push(demand);
  });

  return {
    current: demandRecords[0] || null,
    history: demandRecords,
    analysis: {
      totalDemand: demandRecords.reduce((sum, d) => sum + (d.quantity || 0), 0),
      pricePoints: demandByPrice.size,
      categories: [...new Set(demandRecords.map((d) => d.category).filter(Boolean))],
      peakDemand: Math.max(...demandRecords.map((d) => d.quantity || 0)),
    },
  };
}

function processAllotmentData(allotmentRecords) {
  if (!allotmentRecords || allotmentRecords.length === 0) {
    return { summary: null, sample: [] };
  }

  const allotted = allotmentRecords.filter((r) => r.allottedQuantity > 0);
  const categories = {};

  allotmentRecords.forEach((record) => {
    if (!categories[record.category]) {
      categories[record.category] = {
        total: 0,
        allotted: 0,
        totalAmount: 0,
        allottedAmount: 0,
      };
    }

    const cat = categories[record.category];
    cat.total++;
    cat.totalAmount +=
      record.appliedQuantity * (record.allottedAmount / record.allottedQuantity || 0);

    if (record.allottedQuantity > 0) {
      cat.allotted++;
      cat.allottedAmount += record.allottedAmount;
    }
  });

  return {
    summary: {
      totalApplications: allotmentRecords.length,
      allottedApplications: allotted.length,
      allotmentRatio: ((allotted.length / allotmentRecords.length) * 100).toFixed(2),
      categories: Object.fromEntries(
        Object.entries(categories).map(([key, cat]) => [
          key,
          {
            ...cat,
            allotmentRatio: ((cat.allotted / cat.total) * 100).toFixed(2),
          },
        ])
      ),
    },
    sample: allotmentRecords.slice(0, 20).map((r) => ({
      applicationNumber: r.applicationNumber,
      category: r.category,
      appliedQuantity: r.appliedQuantity,
      allottedQuantity: r.allottedQuantity,
      allotmentStatus: r.allotmentStatus,
      refundAmount: r.refundAmount,
    })),
  };
}

function processApplicationData(applicationRecords) {
  if (!applicationRecords || applicationRecords.length === 0) {
    return { summary: null, recent: [] };
  }

  const byCategory = {};
  const byStatus = {};

  applicationRecords.forEach((app) => {
    // Category stats
    if (!byCategory[app.category]) {
      byCategory[app.category] = { count: 0, totalAmount: 0 };
    }
    byCategory[app.category].count++;
    byCategory[app.category].totalAmount += app.amount;

    // Status stats
    const status = app.allotmentStatus || app.status;
    byStatus[status] = (byStatus[status] || 0) + 1;
  });

  return {
    summary: {
      totalApplications: applicationRecords.length,
      totalAmount: applicationRecords.reduce((sum, app) => sum + app.amount, 0),
      averageAmount:
        applicationRecords.reduce((sum, app) => sum + app.amount, 0) / applicationRecords.length,
      byCategory,
      byStatus,
    },
    recent: applicationRecords.slice(0, 10).map((app) => ({
      id: app.id,
      category: app.category,
      quantity: app.quantity,
      amount: app.amount,
      status: app.status,
      allotmentStatus: app.allotmentStatus,
      submittedAt: app.submittedAt,
    })),
  };
}

async function generateInsights(ipo, processedData) {
  const insights = [];

  try {
    // Timeline insights
    if (processedData.timeline) {
      const timeline = processedData.timeline;

      if (timeline.upcoming.daysToOpen > 0 && timeline.upcoming.daysToOpen <= 3) {
        insights.push({
          type: 'timeline',
          category: 'urgent',
          message: `IPO opens in ${timeline.upcoming.daysToOpen} day(s)`,
          action: 'Prepare your application',
        });
      }

      if (timeline.upcoming.daysToClose > 0 && timeline.upcoming.daysToClose <= 1) {
        insights.push({
          type: 'timeline',
          category: 'critical',
          message: `IPO closes in ${timeline.upcoming.daysToClose} day(s)`,
          action: 'Submit your application immediately',
        });
      }
    }

    // GMP insights
    if (processedData.gmp && processedData.gmp.current) {
      const gmp = processedData.gmp;

      if (gmp.current.value > 0) {
        const percentage = gmp.current.percentage;
        if (percentage > 20) {
          insights.push({
            type: 'gmp',
            category: 'positive',
            message: `Strong GMP of ₹${gmp.current.value} (${percentage}% premium)`,
            action: 'High listing gain expected',
          });
        } else if (percentage < 0) {
          insights.push({
            type: 'gmp',
            category: 'negative',
            message: `Negative GMP of ₹${gmp.current.value} (${percentage}% discount)`,
            action: 'Consider risks before applying',
          });
        }
      }

      if (gmp.statistics && gmp.statistics.volatility > 10) {
        insights.push({
          type: 'gmp',
          category: 'warning',
          message: `High GMP volatility (${gmp.statistics.volatility.toFixed(1)}%)`,
          action: 'Monitor closely before listing',
        });
      }
    }

    // Subscription insights
    if (processedData.subscription && processedData.subscription.current) {
      const sub = processedData.subscription.current;

      if (sub.overall > 5) {
        insights.push({
          type: 'subscription',
          category: 'warning',
          message: `Heavy oversubscription (${sub.overall.toFixed(1)}x)`,
          action: 'Low allotment probability',
        });
      } else if (sub.overall < 0.5) {
        insights.push({
          type: 'subscription',
          category: 'opportunity',
          message: `Undersubscribed (${sub.overall.toFixed(1)}x)`,
          action: 'High allotment chances',
        });
      }

      // Category-specific insights
      if (sub.categories.RETAIL && sub.categories.QIB) {
        const retail = sub.categories.RETAIL.subscriptionRatio;
        const qib = sub.categories.QIB.subscriptionRatio;

        if (retail > qib * 2) {
          insights.push({
            type: 'subscription',
            category: 'info',
            message: 'Retail category more popular than institutional',
            action: 'Consider HNI category if eligible',
          });
        }
      }
    }

    // Predictions insights
    if (processedData.predictions && processedData.predictions.listingGain) {
      const prediction = processedData.predictions.listingGain;

      if (prediction.value > 15 && prediction.confidence > 0.7) {
        insights.push({
          type: 'prediction',
          category: 'positive',
          message: `Predicted listing gain: ${prediction.value.toFixed(1)}%`,
          action: `Confidence: ${(prediction.confidence * 100).toFixed(0)}%`,
        });
      } else if (prediction.value < -5 && prediction.confidence > 0.7) {
        insights.push({
          type: 'prediction',
          category: 'negative',
          message: `Predicted listing loss: ${Math.abs(prediction.value).toFixed(1)}%`,
          action: `Confidence: ${(prediction.confidence * 100).toFixed(0)}%`,
        });
      }
    }

    // Price and valuation insights
    if (ipo.listingPrice && ipo.maxPrice) {
      const listingGain = ((ipo.listingPrice - ipo.maxPrice) / ipo.maxPrice) * 100;

      insights.push({
        type: 'performance',
        category: listingGain > 0 ? 'positive' : 'negative',
        message: `Listed at ${listingGain > 0 ? '+' : ''}${listingGain.toFixed(1)}% from issue price`,
        action: listingGain > 0 ? 'Successful listing' : 'Below issue price',
      });
    }
  } catch (error) {
    console.error('Error generating insights:', error);
    insights.push({
      type: 'error',
      category: 'info',
      message: 'Some insights temporarily unavailable',
      action: 'Refresh to retry',
    });
  }

  return insights;
}

// Additional helper functions
function calculateMarketCap(ipo, price) {
  if (!ipo.issueSize || !price) return null;

  // Approximate calculation based on issue size
  const sharesInIssue = Number(ipo.issueSize) / price;
  const estimatedTotalShares = sharesInIssue * 3; // Rough estimate

  return {
    value: estimatedTotalShares * price,
    formatted: formatCurrency(estimatedTotalShares * price),
    sharesOutstanding: estimatedTotalShares,
  };
}

function formatCurrency(amount) {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(1)} Cr`;
  } else if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)} L`;
  } else {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
}

function calculateVolatility(values) {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

  return parseFloat(Math.sqrt(variance).toFixed(2));
}

function calculateGMPTrend(values) {
  if (values.length < 3) return 'stable';

  const recent = values.slice(0, 3);
  const older = values.slice(-3);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 5) return 'bullish';
  if (change < -5) return 'bearish';
  return 'stable';
}

function calculateGMPAccuracy(ipo) {
  if (!ipo.listingPrice || !ipo.gmp || ipo.gmp.length === 0) return null;

  const latestGMP = ipo.gmp[0];
  const predictedPrice = ipo.maxPrice + latestGMP.value;
  const actualPrice = ipo.listingPrice;

  const accuracy = 100 - Math.abs((predictedPrice - actualPrice) / actualPrice) * 100;
  return Math.max(0, Math.min(100, accuracy));
}

function calculateSubscriptionTrend(ipo) {
  if (!ipo.subscription || ipo.subscription.length < 5) return null;

  const recentSubs = ipo.subscription.slice(0, 5);
  const subscriptionRatios = recentSubs.map((s) => s.subscriptionRatio);

  // Simple linear regression slope
  const n = subscriptionRatios.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = subscriptionRatios.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * subscriptionRatios[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  return {
    direction: slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable',
    rate: Math.abs(slope),
    confidence: Math.min(1, n / 10), // More data points = higher confidence
  };
}

function calculateDemandAnalysis(ipo) {
  if (!ipo.demand || ipo.demand.length === 0) return null;

  const demandData = ipo.demand;
  const totalDemand = demandData.reduce((sum, d) => sum + (d.quantity || 0), 0);
  const pricePoints = [...new Set(demandData.map((d) => d.pricePoint))].sort((a, b) => a - b);

  return {
    totalDemand,
    pricePoints: pricePoints.length,
    priceRange: {
      min: Math.min(...pricePoints),
      max: Math.max(...pricePoints),
    },
    concentrationIndex: calculateConcentrationIndex(demandData),
  };
}

function calculateConcentrationIndex(demandData) {
  // Herfindahl-Hirschman Index for demand concentration
  const totalDemand = demandData.reduce((sum, d) => sum + (d.quantity || 0), 0);

  if (totalDemand === 0) return 0;

  const shares = demandData.map((d) => (d.quantity || 0) / totalDemand);
  const hhi = shares.reduce((sum, share) => sum + share * share, 0);

  return Math.round(hhi * 10000); // Scale to 0-10000
}

// Export configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};
