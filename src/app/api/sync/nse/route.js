import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.js";
import { cache } from "../../../../lib/cache.js";
import { requireAuth } from "../../../../lib/auth.js";
import axios from "axios";

// NSE data sync endpoint for IPO data synchronization
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const action = searchParams.get("action") || "status";
    const symbol = searchParams.get("symbol");
    const includeMarketData = searchParams.get("includeMarketData") === "true";
    const force = searchParams.get("force") === "true";

    // Build cache key for status check
    const cacheKey = cache.key(
      "NSE_SYNC",
      `status:${action}:${symbol || "all"}`
    );

    // Try cache first for status checks (skip for force refresh)
    if (!force && action === "status") {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    let result;

    switch (action) {
      case "status":
        result = await getNSESyncStatus(symbol, includeMarketData);
        break;

      case "market_status":
        result = await getNSEMarketStatus();
        break;

      case "verify_symbols":
        result = await verifyNSESymbols(symbol);
        break;

      case "check_listings":
        result = await checkNSEListings();
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
            availableActions: [
              "status",
              "market_status",
              "verify_symbols",
              "check_listings",
            ],
          },
          { status: 400 }
        );
    }

    const response = {
      success: true,
      action,
      data: result,
      timestamp: new Date().toISOString(),
    };

    // Cache status responses for 5 minutes
    if (action === "status") {
      await cache.set(cacheKey, response, 300);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/sync/nse error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync with NSE",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Trigger NSE sync operations (Admin only)
export async function POST(request) {
  try {
    const authResult = await requireAuth({ roles: ["admin", "super_admin"] })(
      request
    );
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { action, symbols, options = {} } = body;

    let result;

    switch (action) {
      case "sync_ipos":
        result = await syncNSEIPOs(symbols, options);
        break;

      case "sync_prices":
        result = await syncNSEPrices(symbols);
        break;

      case "sync_corporate_actions":
        result = await syncCorporateActions(symbols);
        break;

      case "verify_data":
        result = await verifyNSEData(symbols);
        break;

      case "full_sync":
        result = await performFullNSESync(options);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
            availableActions: [
              "sync_ipos",
              "sync_prices",
              "sync_corporate_actions",
              "verify_data",
              "full_sync",
            ],
          },
          { status: 400 }
        );
    }

    // Clear relevant caches
    await cache.del(cache.key("NSE_SYNC", "*"));

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/sync/nse error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute NSE sync",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Get NSE sync status
async function getNSESyncStatus(symbol, includeMarketData) {
  try {
    // Get database sync status
    const [totalIPOs, nseIPOs, recentSync] = await Promise.all([
      prisma.iPO.count({ where: { isActive: true } }),
      prisma.iPO.count({
        where: {
          isActive: true,
          registrar: { contains: "NSE", mode: "insensitive" },
        },
      }),
      prisma.nSESync.findFirst({ orderBy: { syncedAt: "desc" } }),
    ]);

    // Get market data if requested
    let marketData = null;
    if (includeMarketData) {
      marketData = await getNSEMarketStatus();
    }

    // Get symbol-specific data if provided
    let symbolData = null;
    if (symbol) {
      symbolData = await getSymbolSyncStatus(symbol);
    }

    return {
      database: {
        totalIPOs,
        nseIPOs,
        lastSync: recentSync?.syncedAt || null,
        syncStatus: recentSync?.status || "unknown",
      },
      market: marketData,
      symbol: symbolData,
      nseConnection: await testNSEConnection(),
    };
  } catch (error) {
    throw new Error(`Failed to get NSE sync status: ${error.message}`);
  }
}

// Get NSE market status
async function getNSEMarketStatus() {
  try {
    // Mock NSE API call - replace with actual NSE API
    const nseResponse = await axios.get(
      "https://www.nseindia.com/api/marketStatus",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    return {
      marketStatus: nseResponse.data.marketState,
      timestamp: nseResponse.data.timestamp || new Date().toISOString(),
      tradingSession: nseResponse.data.tradeDate,
      connected: true,
    };
  } catch (error) {
    return {
      marketStatus: "unknown",
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// Verify NSE symbols
async function verifyNSESymbols(symbol) {
  try {
    const whereClause = symbol
      ? { symbol: symbol.toUpperCase() }
      : { isActive: true };

    const ipos = await prisma.iPO.findMany({
      where: whereClause,
      select: { id: true, symbol: true, name: true, status: true },
    });

    const verificationResults = [];

    for (const ipo of ipos) {
      try {
        // Mock NSE symbol verification - replace with actual NSE API
        const verified = await verifySymbolWithNSE(ipo.symbol);
        verificationResults.push({
          symbol: ipo.symbol,
          name: ipo.name,
          verified: verified.exists,
          nseData: verified.data || null,
          status: ipo.status,
        });
      } catch (error) {
        verificationResults.push({
          symbol: ipo.symbol,
          verified: false,
          error: error.message,
        });
      }
    }

    return {
      total: ipos.length,
      verified: verificationResults.filter((r) => r.verified).length,
      failed: verificationResults.filter((r) => !r.verified).length,
      results: verificationResults,
    };
  } catch (error) {
    throw new Error(`Failed to verify NSE symbols: ${error.message}`);
  }
}

// Check NSE listings
async function checkNSEListings() {
  try {
    // Get recent IPOs that should be listed
    const recentIPOs = await prisma.iPO.findMany({
      where: {
        status: "closed",
        closeDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, symbol: true, name: true, listingDate: true },
    });

    const listingResults = [];

    for (const ipo of recentIPOs) {
      try {
        const listingData = await checkIPOListing(ipo.symbol);
        listingResults.push({
          symbol: ipo.symbol,
          name: ipo.name,
          expectedListingDate: ipo.listingDate,
          actualListingDate: listingData.listingDate,
          isListed: listingData.isListed,
          listingPrice: listingData.price,
        });
      } catch (error) {
        listingResults.push({
          symbol: ipo.symbol,
          error: error.message,
        });
      }
    }

    return {
      total: recentIPOs.length,
      listed: listingResults.filter((r) => r.isListed).length,
      pending: listingResults.filter((r) => !r.isListed && !r.error).length,
      results: listingResults,
    };
  } catch (error) {
    throw new Error(`Failed to check NSE listings: ${error.message}`);
  }
}

// Sync NSE IPO data
async function syncNSEIPOs(symbols, options) {
  try {
    const { updateExisting = true, createNew = false } = options;

    // Get target symbols
    const targetSymbols = symbols || (await getActiveIPOSymbols());
    const results = { updated: 0, created: 0, failed: 0, errors: [] };

    for (const symbol of targetSymbols) {
      try {
        const nseData = await fetchNSEIPOData(symbol);

        if (!nseData) {
          results.failed++;
          continue;
        }

        // Check if IPO exists
        const existingIPO = await prisma.iPO.findUnique({
          where: { symbol: symbol.toUpperCase() },
        });

        if (existingIPO && updateExisting) {
          // Update existing IPO
          await prisma.iPO.update({
            where: { id: existingIPO.id },
            data: {
              listingPrice: nseData.listingPrice,
              listingDate: nseData.listingDate
                ? new Date(nseData.listingDate)
                : null,
              status: nseData.status || existingIPO.status,
              updatedAt: new Date(),
            },
          });
          results.updated++;
        } else if (!existingIPO && createNew) {
          // Create new IPO
          await prisma.iPO.create({
            data: {
              symbol: symbol.toUpperCase(),
              name: nseData.name,
              listingPrice: nseData.listingPrice,
              listingDate: nseData.listingDate
                ? new Date(nseData.listingDate)
                : null,
              status: nseData.status || "listed",
              isActive: true,
            },
          });
          results.created++;
        }

        // Log sync
        await prisma.nSESync.create({
          data: {
            symbol: symbol.toUpperCase(),
            operation: "sync_ipo",
            status: "success",
            data: JSON.stringify(nseData),
            syncedAt: new Date(),
          },
        });
      } catch (error) {
        results.failed++;
        results.errors.push({ symbol, error: error.message });
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to sync NSE IPOs: ${error.message}`);
  }
}

// Sync NSE prices
async function syncNSEPrices(symbols) {
  try {
    const targetSymbols = symbols || (await getListedIPOSymbols());
    const results = { updated: 0, failed: 0, errors: [] };

    for (const symbol of targetSymbols) {
      try {
        const priceData = await fetchNSEPrice(symbol);

        if (priceData) {
          await prisma.iPO.update({
            where: { symbol: symbol.toUpperCase() },
            data: {
              currentPrice: priceData.price,
              updatedAt: new Date(),
            },
          });
          results.updated++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ symbol, error: error.message });
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to sync NSE prices: ${error.message}`);
  }
}

// Perform full NSE sync
async function performFullNSESync(options) {
  try {
    const {
      includePrices = true,
      includeListings = true,
      includeCorporateActions = false,
    } = options;
    const results = {};

    // Sync IPO data
    results.ipos = await syncNSEIPOs(null, {
      updateExisting: true,
      createNew: false,
    });

    // Sync prices if requested
    if (includePrices) {
      results.prices = await syncNSEPrices();
    }

    // Check listings if requested
    if (includeListings) {
      results.listings = await checkNSEListings();
    }

    // Sync corporate actions if requested
    if (includeCorporateActions) {
      results.corporateActions = await syncCorporateActions();
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to perform full NSE sync: ${error.message}`);
  }
}

// Helper functions
async function testNSEConnection() {
  try {
    const response = await axios.get(
      "https://www.nseindia.com/api/marketStatus",
      {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    return { connected: true, responseTime: Date.now() };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function getSymbolSyncStatus(symbol) {
  try {
    const [ipo, lastSync] = await Promise.all([
      prisma.iPO.findUnique({ where: { symbol: symbol.toUpperCase() } }),
      prisma.nSESync.findFirst({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { syncedAt: "desc" },
      }),
    ]);

    return {
      exists: !!ipo,
      lastSync: lastSync?.syncedAt || null,
      syncStatus: lastSync?.status || "never",
      ipoData: ipo
        ? {
            status: ipo.status,
            listingPrice: ipo.listingPrice,
            listingDate: ipo.listingDate,
          }
        : null,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function verifySymbolWithNSE(symbol) {
  // Mock implementation - replace with actual NSE API
  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`,
      {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );

    return {
      exists: !!response.data,
      data: response.data,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return { exists: false };
    }
    throw error;
  }
}

async function checkIPOListing(symbol) {
  // Mock implementation - replace with actual NSE listing check
  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`,
      {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );

    return {
      isListed: !!response.data,
      listingDate: response.data?.listingDate,
      price: response.data?.price,
    };
  } catch (error) {
    return { isListed: false, error: error.message };
  }
}

async function fetchNSEIPOData(symbol) {
  // Mock implementation - replace with actual NSE IPO API
  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/ipo/${symbol}`,
      {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );

    return {
      name: response.data?.name,
      listingPrice: response.data?.listingPrice,
      listingDate: response.data?.listingDate,
      status: response.data?.status,
    };
  } catch (error) {
    return null;
  }
}

async function fetchNSEPrice(symbol) {
  // Mock implementation - replace with actual NSE price API
  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`,
      {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );

    return {
      price: response.data?.price || response.data?.lastPrice,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return null;
  }
}

async function getActiveIPOSymbols() {
  const ipos = await prisma.iPO.findMany({
    where: { isActive: true },
    select: { symbol: true },
  });
  return ipos.map((ipo) => ipo.symbol);
}

async function getListedIPOSymbols() {
  const ipos = await prisma.iPO.findMany({
    where: { isActive: true, status: "listed" },
    select: { symbol: true },
  });
  return ipos.map((ipo) => ipo.symbol);
}

async function syncCorporateActions(symbols) {
  // Mock implementation for corporate actions sync
  return { message: "Corporate actions sync not implemented yet" };
}

async function verifyNSEData(symbols) {
  // Mock implementation for data verification
  return { message: "Data verification not implemented yet" };
}

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};
