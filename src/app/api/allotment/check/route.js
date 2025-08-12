import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.js";
import { cache } from "../../../../lib/cache.js";
import { allotmentService } from "../../../../services/allotment-service.js";

// Check allotment status for specific PAN/Application
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const panNumber = searchParams.get("pan");
    const applicationNumber = searchParams.get("application");
    const ipoSymbol = searchParams.get("symbol");
    const ipoId = searchParams.get("ipoId");
    const live = searchParams.get("live") === "true";

    if (!panNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "PAN number is required",
        },
        { status: 400 }
      );
    }

    // Build cache key
    const cacheKey = cache.key(
      "ALLOTMENT_CHECK",
      `${panNumber}:${applicationNumber || "all"}:${ipoSymbol || ipoId || "all"}`
    );

    // Try cache first (skip for live requests)
    if (!live) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Build where clause
    const whereClause = { panNumber: panNumber.toUpperCase() };
    if (applicationNumber) whereClause.applicationNumber = applicationNumber;
    if (ipoId) whereClause.ipoId = ipoId;
    if (ipoSymbol) whereClause.ipo = { symbol: ipoSymbol.toUpperCase() };

    // Fetch from database
    const results = await prisma.allotmentResult.findMany({
      where: whereClause,
      include: {
        ipo: {
          select: {
            id: true,
            symbol: true,
            name: true,
            status: true,
            finalPrice: true,
            lotSize: true,
            listingDate: true,
            listingPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // If no results and live check requested, try service
    if (results.length === 0 && live) {
      try {
        const serviceResults = await allotmentService.getUserAllotmentStatus(
          null,
          ipoId
        );
        if (serviceResults.length > 0) {
          return NextResponse.json({
            success: true,
            data: serviceResults,
            source: "live_service",
            message: "Fetched from live allotment service",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn("Live service check failed:", error.message);
      }
    }

    // Process results
    const processedResults = results.map((result) => {
      const listingGain =
        result.ipo.listingPrice && result.ipo.finalPrice
          ? ((result.ipo.listingPrice - result.ipo.finalPrice) /
              result.ipo.finalPrice) *
            100
          : null;

      return {
        id: result.id,
        panNumber: result.panNumber,
        applicationNumber: result.applicationNumber,
        category: result.category,
        appliedQuantity: result.appliedQuantity,
        allottedQuantity: result.allottedQuantity,
        allottedAmount: result.allottedAmount,
        refundAmount: result.refundAmount,
        allotmentStatus: result.allotmentStatus,
        ipo: {
          ...result.ipo,
          listingGain: listingGain
            ? `${listingGain > 0 ? "+" : ""}${listingGain.toFixed(2)}%`
            : null,
        },
        profit:
          result.allottedQuantity > 0 && listingGain
            ? result.allottedQuantity *
              result.ipo.lotSize *
              (result.ipo.listingPrice - result.ipo.finalPrice)
            : 0,
        createdAt: result.createdAt,
      };
    });

    const response = {
      success: true,
      data: processedResults,
      summary: {
        totalApplications: results.length,
        allottedApplications: results.filter((r) => r.allottedQuantity > 0)
          .length,
        totalInvested: results.reduce(
          (sum, r) => sum + (r.appliedAmount || 0),
          0
        ),
        totalReceived: results.reduce(
          (sum, r) => sum + (r.allottedAmount || 0),
          0
        ),
        totalRefund: results.reduce((sum, r) => sum + (r.refundAmount || 0), 0),
        totalProfit: processedResults.reduce(
          (sum, r) => sum + (r.profit || 0),
          0
        ),
      },
      query: { panNumber, applicationNumber, ipoSymbol, ipoId },
      timestamp: new Date().toISOString(),
    };

    // Cache for 2 minutes (shorter for check endpoint)
    if (!live) {
      await cache.set(cacheKey, response, 120);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/allotment/check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check allotment status",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Batch check multiple applications
export async function POST(request) {
  try {
    const body = await request.json();
    const { applications, live = false } = body;

    if (!applications || !Array.isArray(applications)) {
      return NextResponse.json(
        {
          success: false,
          error: "Applications array is required",
        },
        { status: 400 }
      );
    }

    const batchResults = await Promise.allSettled(
      applications.map(async (app) => {
        const { panNumber, applicationNumber, ipoId } = app;

        if (!panNumber) {
          throw new Error("PAN number is required for each application");
        }

        const whereClause = { panNumber: panNumber.toUpperCase() };
        if (applicationNumber)
          whereClause.applicationNumber = applicationNumber;
        if (ipoId) whereClause.ipoId = ipoId;

        const result = await prisma.allotmentResult.findFirst({
          where: whereClause,
          include: {
            ipo: {
              select: {
                symbol: true,
                name: true,
                status: true,
                finalPrice: true,
                listingPrice: true,
              },
            },
          },
        });

        return {
          query: app,
          result: result
            ? {
                allotmentStatus: result.allotmentStatus,
                appliedQuantity: result.appliedQuantity,
                allottedQuantity: result.allottedQuantity,
                allottedAmount: result.allottedAmount,
                refundAmount: result.refundAmount,
                ipo: result.ipo,
              }
            : null,
        };
      })
    );

    const successfulResults = batchResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    const failedResults = batchResults
      .filter((r) => r.status === "rejected")
      .map((r) => ({ error: r.reason.message }));

    return NextResponse.json({
      success: true,
      data: successfulResults,
      errors: failedResults,
      summary: {
        requested: applications.length,
        found: successfulResults.filter((r) => r.result).length,
        notFound: successfulResults.filter((r) => !r.result).length,
        failed: failedResults.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/allotment/check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to batch check allotments",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';