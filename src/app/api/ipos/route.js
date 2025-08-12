import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/db.js';
import { cache } from '../../../lib/cache.js';
import { analyticsService } from '../../../lib/analytics.js';
import { predictionService } from '../../../services/prediction-service.js';

// Advanced IPO search endpoint with full-text search, filters, and AI-powered suggestions
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const type = searchParams.get('type') || 'all'; // all, symbol, name, sector, registrar
    const status = searchParams.get('status');
    const sector = searchParams.get('sector');
    const registrar = searchParams.get('registrar');
    const minPrice = parseFloat(searchParams.get('minPrice'));
    const maxPrice = parseFloat(searchParams.get('maxPrice'));
    const minIssueSize = parseFloat(searchParams.get('minIssueSize'));
    const maxIssueSize = parseFloat(searchParams.get('maxIssueSize'));
    const minGMP = parseFloat(searchParams.get('minGMP'));
    const maxGMP = parseFloat(searchParams.get('maxGMP'));
    const subscriptionMin = parseFloat(searchParams.get('subscriptionMin'));
    const subscriptionMax = parseFloat(searchParams.get('subscriptionMax'));
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
    const fuzzy = searchParams.get('fuzzy') !== 'false'; // Default true
    const suggestions = searchParams.get('suggestions') === 'true';
    const highlight = searchParams.get('highlight') !== 'false'; // Default true
    const includeAnalytics = searchParams.get('includeAnalytics') === 'true';
    const includePredictions = searchParams.get('includePredictions') === 'true';
    const advanced = searchParams.get('advanced') === 'true';

    // Validate query length
    if (query.length > 0 && query.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Search query must be at least 2 characters long',
        },
        { status: 400 }
      );
    }

    // Build cache key
    const cacheKey = cache.key(
      'SEARCH',
      `ipos:${JSON.stringify({
        query: query.toLowerCase(),
        type,
        status,
        sector,
        registrar,
        minPrice,
        maxPrice,
        minIssueSize,
        maxIssueSize,
        minGMP,
        maxGMP,
        subscriptionMin,
        subscriptionMax,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page,
        limit,
        fuzzy,
        includeAnalytics,
        includePredictions,
        advanced,
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

    // Build search results
    let searchResults;

    if (query.trim() === '') {
      // If no query, return filtered results
      searchResults = await performFilteredSearch({
        status,
        sector,
        registrar,
        minPrice,
        maxPrice,
        minIssueSize,
        maxIssueSize,
        minGMP,
        maxGMP,
        subscriptionMin,
        subscriptionMax,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page,
        limit,
        includeAnalytics,
        includePredictions,
      });
    } else {
      // Perform text search
      searchResults = await performTextSearch({
        query,
        type,
        status,
        sector,
        registrar,
        minPrice,
        maxPrice,
        minIssueSize,
        maxIssueSize,
        minGMP,
        maxGMP,
        subscriptionMin,
        subscriptionMax,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
        page,
        limit,
        fuzzy,
        highlight,
        includeAnalytics,
        includePredictions,
        advanced,
      });
    }

    // Generate search suggestions if requested
    let searchSuggestions = [];
    if (suggestions && query.length >= 2) {
      searchSuggestions = await generateSearchSuggestions(query, {
        type,
        status,
        sector,
        limit: 10,
      });
    }

    // Generate search analytics
    const searchAnalytics = await generateSearchAnalytics(query, searchResults.data);

    // Build comprehensive response
    const response = {
      success: true,
      query: {
        original: query,
        processed: processSearchQuery(query),
        type,
        fuzzy,
        advanced,
      },
      results: searchResults.data,
      pagination: searchResults.pagination,
      suggestions: searchSuggestions,
      analytics: searchAnalytics,
      filters: {
        applied: getAppliedFilters({
          status,
          sector,
          registrar,
          minPrice,
          maxPrice,
          minIssueSize,
          maxIssueSize,
          minGMP,
          maxGMP,
          subscriptionMin,
          subscriptionMax,
          dateFrom,
          dateTo,
        }),
        available: await getAvailableFilters(searchResults.data),
      },
      sorting: {
        sortBy,
        sortOrder,
        options: getSortingOptions(),
      },
      metadata: {
        searchTime: Date.now() - (searchResults.startTime || Date.now()),
        totalResults: searchResults.pagination.totalCount,
        hasMore: searchResults.pagination.hasNextPage,
        relevanceScoring: query.length > 0,
        highlighting: highlight && query.length > 0,
      },
      timestamp: new Date().toISOString(),
    };

    // Cache response for 5 minutes
    await cache.set(cacheKey, response, 300);

    // Log search for analytics
    logSearchQuery(request, {
      query,
      type,
      resultCount: searchResults.data.length,
      filters: response.filters.applied,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/ipos/search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Search failed',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Advanced search with query processing and ML-powered ranking
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      queries,
      searchType = 'semantic',
      rankingModel = 'relevance',
      boost = {},
      filters = {},
      options = {},
    } = body;

    // Validate complex search request
    if (!queries || (!Array.isArray(queries) && typeof queries !== 'string')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Queries parameter is required',
        },
        { status: 400 }
      );
    }

    // Process multiple queries or complex query
    const searchQueries = Array.isArray(queries) ? queries : [queries];

    const searchResults = await performAdvancedSearch({
      queries: searchQueries,
      searchType,
      rankingModel,
      boost,
      filters,
      options,
    });

    // Generate advanced analytics
    const advancedAnalytics = await generateAdvancedSearchAnalytics(searchQueries, searchResults);

    const response = {
      success: true,
      searchType,
      rankingModel,
      queries: searchQueries,
      results: searchResults.data,
      pagination: searchResults.pagination,
      analytics: advancedAnalytics,
      relevanceScores: searchResults.relevanceScores,
      queryProcessing: {
        normalizedQueries: searchQueries.map((q) => processSearchQuery(q)),
        semanticAnalysis:
          searchType === 'semantic' ? await performSemanticAnalysis(searchQueries) : null,
        entityExtraction: await extractEntities(searchQueries),
      },
      recommendations: await generateSearchRecommendations(searchResults.data, searchQueries),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('POST /api/ipos/search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Advanced search failed',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Perform filtered search without text query
async function performFilteredSearch(params) {
  const startTime = Date.now();

  try {
    const {
      status,
      sector,
      registrar,
      minPrice,
      maxPrice,
      minIssueSize,
      maxIssueSize,
      minGMP,
      maxGMP,
      subscriptionMin,
      subscriptionMax,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      page,
      limit,
      includeAnalytics,
      includePredictions,
    } = params;

    // Build where clause
    const whereClause = {
      isActive: true,
    };

    // Apply basic filters
    if (status && status !== 'all') {
      whereClause.status = status.includes(',') ? { in: status.split(',') } : status;
    }

    if (sector) {
      whereClause.sector = sector.includes(',')
        ? { in: sector.split(',') }
        : { contains: sector, mode: 'insensitive' };
    }

    if (registrar) {
      whereClause.registrar = { contains: registrar, mode: 'insensitive' };
    }

    // Price range filters
    if (minPrice && !isNaN(minPrice)) {
      whereClause.maxPrice = { gte: minPrice };
    }
    if (maxPrice && !isNaN(maxPrice)) {
      whereClause.minPrice = { lte: maxPrice };
    }

    // Issue size filters
    if (minIssueSize && !isNaN(minIssueSize)) {
      whereClause.issueSize = {
        ...(whereClause.issueSize || {}),
        gte: minIssueSize * 10000000,
      };
    }
    if (maxIssueSize && !isNaN(maxIssueSize)) {
      whereClause.issueSize = {
        ...(whereClause.issueSize || {}),
        lte: maxIssueSize * 10000000,
      };
    }

    // Date filters
    if (dateFrom || dateTo) {
      const dateFilter = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      whereClause.openDate = dateFilter;
    }

    // Include clause for related data
    // Add this at the beginning of your performFilteredSearch function
    const includeClause = {
      gmpData: {
        orderBy: { timestamp: 'desc' },
        take: 5,
      },
      subscriptionData: {
        orderBy: { timestamp: 'desc' },
        take: 5,
      },
      allotmentData: true,
      analytics: true,
      watchlists: true,
      alerts: true,
    };

    // Add GMP data for GMP-based filtering
    if (minGMP || maxGMP || subscriptionMin || subscriptionMax) {
      includeClause.gmp = {
        orderBy: { timestamp: 'desc' },
        take: 1,
      };
      includeClause.subscription = {
        orderBy: { timestamp: 'desc' },
        take: 5,
      };
    }

    if (includeAnalytics) {
      includeClause.analytics = true;
    }

    // Build order clause
    const orderBy = buildOrderClause(sortBy, sortOrder);

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Execute query
    const [ipos, totalCount] = await Promise.all([
      prisma.iPO.findMany({
        where: whereClause,
        include: includeClause,
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.iPO.count({ where: whereClause }),
    ]);

    // Post-process results for GMP and subscription filters
    let filteredResults = ipos;

    if (minGMP || maxGMP || subscriptionMin || subscriptionMax) {
      filteredResults = await applyAdvancedFilters(ipos, {
        minGMP,
        maxGMP,
        subscriptionMin,
        subscriptionMax,
      });
    }

    // Process results
    const processedResults = await Promise.all(
      filteredResults.map((ipo) =>
        processSearchResult(ipo, {
          includeAnalytics,
          includePredictions,
          highlight: false,
          relevanceScore: 1.0,
        })
      )
    );

    return {
      data: processedResults,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      startTime,
    };
  } catch (error) {
    console.error('Error in performFilteredSearch:', error);
    throw error;
  }
}

// Perform text-based search with relevance scoring
async function performTextSearch(params) {
  const startTime = Date.now();

  try {
    const {
      query,
      type,
      status,
      sector,
      registrar,
      minPrice,
      maxPrice,
      minIssueSize,
      maxIssueSize,
      minGMP,
      maxGMP,
      subscriptionMin,
      subscriptionMax,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      page,
      limit,
      fuzzy,
      highlight,
      includeAnalytics,
      includePredictions,
      advanced,
    } = params;

    // Process and normalize query
    const processedQuery = processSearchQuery(query);
    const searchTerms = extractSearchTerms(processedQuery);

    // Build base where clause
    const baseWhereClause = {
      isActive: true,
    };

    // Apply additional filters
    applyAdditionalFilters(baseWhereClause, {
      status,
      sector,
      registrar,
      minPrice,
      maxPrice,
      minIssueSize,
      maxIssueSize,
      dateFrom,
      dateTo,
    });

    // Build search conditions based on search type
    let searchConditions = [];

    switch (type) {
      case 'symbol':
        searchConditions = buildSymbolSearch(searchTerms, fuzzy);
        break;
      case 'name':
        searchConditions = buildNameSearch(searchTerms, fuzzy);
        break;
      case 'sector':
        searchConditions = buildSectorSearch(searchTerms, fuzzy);
        break;
      case 'registrar':
        searchConditions = buildRegistrarSearch(searchTerms, fuzzy);
        break;
      default:
        searchConditions = buildUniversalSearch(searchTerms, fuzzy);
    }

    // Combine base filters with search conditions
    const whereClause = {
      ...baseWhereClause,
      AND: [{ OR: searchConditions }],
    };

    // Include related data
    const includeClause = {
      categories: true,
      gmp: {
        orderBy: { timestamp: 'desc' },
        take: 5,
      },
      subscription: {
        orderBy: { timestamp: 'desc' },
        take: 5,
      },
    };

    if (includeAnalytics) {
      includeClause.analytics = true;
    }

    // Execute search
    const [searchResults, totalCount] = await Promise.all([
      prisma.iPO.findMany({
        where: whereClause,
        include: includeClause,
      }),
      prisma.iPO.count({ where: whereClause }),
    ]);

    // Apply advanced filters if needed
    let filteredResults = searchResults;
    if (minGMP || maxGMP || subscriptionMin || subscriptionMax) {
      filteredResults = await applyAdvancedFilters(searchResults, {
        minGMP,
        maxGMP,
        subscriptionMin,
        subscriptionMax,
      });
    }

    // Calculate relevance scores
    const scoredResults = filteredResults.map((ipo) => {
      const relevanceScore = calculateRelevanceScore(ipo, searchTerms, type);
      return { ...ipo, relevanceScore };
    });

    // Sort results
    let sortedResults;
    if (sortBy === 'relevance') {
      sortedResults = scoredResults.sort((a, b) =>
        sortOrder === 'desc'
          ? b.relevanceScore - a.relevanceScore
          : a.relevanceScore - b.relevanceScore
      );
    } else {
      const orderBy = buildOrderClause(sortBy, sortOrder);
      sortedResults = sortResults(scoredResults, orderBy);
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedResults = sortedResults.slice(offset, offset + limit);

    // Process final results
    const processedResults = await Promise.all(
      paginatedResults.map((ipo) =>
        processSearchResult(ipo, {
          includeAnalytics,
          includePredictions,
          highlight,
          searchTerms,
          relevanceScore: ipo.relevanceScore,
        })
      )
    );

    return {
      data: processedResults,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(filteredResults.length / limit),
        totalCount: filteredResults.length,
        originalCount: totalCount,
        limit,
        hasNextPage: page < Math.ceil(filteredResults.length / limit),
        hasPrevPage: page > 1,
      },
      startTime,
    };
  } catch (error) {
    console.error('Error in performTextSearch:', error);
    throw error;
  }
}

// Perform advanced search with ML ranking
async function performAdvancedSearch(params) {
  const startTime = Date.now();

  try {
    const { queries, searchType, rankingModel, boost, filters, options } = params;

    // Process all queries
    const processedQueries = queries.map((q) => processSearchQuery(q));
    const allSearchTerms = processedQueries.flatMap((q) => extractSearchTerms(q));
    const uniqueTerms = [...new Set(allSearchTerms)];

    // Build advanced search conditions
    const searchConditions = buildAdvancedSearchConditions(processedQueries, searchType);

    // Apply filters
    const whereClause = {
      isActive: true,
      AND: [{ OR: searchConditions }, ...buildAdvancedFilters(filters)],
    };

    // Execute search with comprehensive includes
    const searchResults = await prisma.iPO.findMany({
      where: whereClause,
      include: {
        categories: true,
        gmp: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
        subscription: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
        analytics: true,
        allotmentResults: {
          take: 5,
          select: {
            category: true,
            allotmentStatus: true,
            allottedQuantity: true,
          },
        },
      },
    });

    // Apply ML-powered ranking
    const rankedResults = await applyMLRanking(searchResults, {
      queries: processedQueries,
      rankingModel,
      boost,
      searchType,
    });

    // Generate relevance scores
    const relevanceScores = rankedResults.map((ipo, index) => ({
      ipoId: ipo.id,
      symbol: ipo.symbol,
      score: ipo.mlScore || 1.0,
      rank: index + 1,
      factors: ipo.rankingFactors || {},
    }));

    // Apply pagination
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;
    const paginatedResults = rankedResults.slice(offset, offset + limit);

    // Process final results
    const processedResults = await Promise.all(
      paginatedResults.map((ipo) =>
        processAdvancedSearchResult(ipo, {
          queries: processedQueries,
          searchType,
          highlight: options.highlight !== false,
          includeAnalytics: options.includeAnalytics === true,
          includePredictions: options.includePredictions === true,
        })
      )
    );

    return {
      data: processedResults,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(rankedResults.length / limit),
        totalCount: rankedResults.length,
        limit,
        hasNextPage: page < Math.ceil(rankedResults.length / limit),
        hasPrevPage: page > 1,
      },
      relevanceScores,
      startTime,
    };
  } catch (error) {
    console.error('Error in performAdvancedSearch:', error);
    throw error;
  }
}

// Process search query and normalize
function processSearchQuery(query) {
  if (!query || typeof query !== 'string') return '';

  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Extract search terms from processed query
function extractSearchTerms(processedQuery) {
  if (!processedQuery) return [];

  const terms = processedQuery.split(' ').filter((term) => term.length >= 2);

  // Add partial terms for fuzzy matching
  const expandedTerms = [...terms];
  terms.forEach((term) => {
    if (term.length >= 4) {
      expandedTerms.push(term.substring(0, term.length - 1)); // Partial match
    }
  });

  return [...new Set(expandedTerms)];
}

// Build search conditions for different types
function buildSymbolSearch(searchTerms, fuzzy) {
  const conditions = [];

  searchTerms.forEach((term) => {
    if (fuzzy) {
      conditions.push({
        symbol: { contains: term, mode: 'insensitive' },
      });
    } else {
      conditions.push({
        symbol: { startsWith: term.toUpperCase() },
      });
    }
  });

  return conditions;
}

function buildNameSearch(searchTerms, fuzzy) {
  const conditions = [];

  searchTerms.forEach((term) => {
    conditions.push({
      name: { contains: term, mode: 'insensitive' },
    });
  });

  return conditions;
}

function buildSectorSearch(searchTerms, fuzzy) {
  const conditions = [];

  searchTerms.forEach((term) => {
    conditions.push({
      sector: { contains: term, mode: 'insensitive' },
    });
  });

  return conditions;
}

function buildRegistrarSearch(searchTerms, fuzzy) {
  const conditions = [];

  searchTerms.forEach((term) => {
    conditions.push({
      registrar: { contains: term, mode: 'insensitive' },
    });
  });

  return conditions;
}

function buildUniversalSearch(searchTerms, fuzzy) {
  const conditions = [];

  searchTerms.forEach((term) => {
    conditions.push(
      { symbol: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
      { sector: { contains: term, mode: 'insensitive' } },
      { registrar: { contains: term, mode: 'insensitive' } }
    );

    // Add lead managers search
    if (term.length >= 3) {
      conditions.push({
        leadManagers: {
          array_contains: [term],
        },
      });
    }
  });

  return conditions;
}

// Calculate relevance score for search results
function calculateRelevanceScore(ipo, searchTerms, searchType) {
  let score = 0;
  const weights = {
    symbol: 10,
    name: 8,
    sector: 5,
    registrar: 3,
    leadManagers: 2,
  };

  searchTerms.forEach((term) => {
    const termRegex = new RegExp(term, 'i');

    // Symbol matching (highest weight)
    if (ipo.symbol && termRegex.test(ipo.symbol)) {
      score += weights.symbol;
      if (ipo.symbol.toLowerCase().startsWith(term.toLowerCase())) {
        score += weights.symbol * 0.5; // Bonus for prefix match
      }
    }

    // Name matching
    if (ipo.name && termRegex.test(ipo.name)) {
      score += weights.name;
      const nameWords = ipo.name.toLowerCase().split(' ');
      if (nameWords.some((word) => word.startsWith(term.toLowerCase()))) {
        score += weights.name * 0.3; // Bonus for word start match
      }
    }

    // Sector matching
    if (ipo.sector && termRegex.test(ipo.sector)) {
      score += weights.sector;
    }

    // Registrar matching
    if (ipo.registrar && termRegex.test(ipo.registrar)) {
      score += weights.registrar;
    }

    // Lead managers matching
    if (ipo.leadManagers && Array.isArray(ipo.leadManagers)) {
      ipo.leadManagers.forEach((manager) => {
        if (termRegex.test(manager)) {
          score += weights.leadManagers;
        }
      });
    }
  });

  // Apply search type boost
  if (searchType !== 'all') {
    const typeBoosts = {
      symbol: ipo.symbol ? 1.5 : 0.5,
      name: ipo.name ? 1.3 : 0.7,
      sector: ipo.sector ? 1.2 : 0.8,
      registrar: ipo.registrar ? 1.1 : 0.9,
    };
    score *= typeBoosts[searchType] || 1.0;
  }

  // Apply status boost (open IPOs get higher relevance)
  const statusBoosts = {
    open: 1.5,
    upcoming: 1.2,
    closed: 1.0,
    listed: 0.8,
  };
  score *= statusBoosts[ipo.status] || 1.0;

  return Math.round(score * 100) / 100;
}

// Apply additional filters to where clause
function applyAdditionalFilters(whereClause, filters) {
  const {
    status,
    sector,
    registrar,
    minPrice,
    maxPrice,
    minIssueSize,
    maxIssueSize,
    dateFrom,
    dateTo,
  } = filters;

  if (status && status !== 'all') {
    whereClause.status = status.includes(',') ? { in: status.split(',') } : status;
  }

  if (sector) {
    whereClause.sector = sector.includes(',')
      ? { in: sector.split(',') }
      : { contains: sector, mode: 'insensitive' };
  }

  if (registrar) {
    whereClause.registrar = { contains: registrar, mode: 'insensitive' };
  }

  if (minPrice && !isNaN(minPrice)) {
    whereClause.maxPrice = { gte: minPrice };
  }
  if (maxPrice && !isNaN(maxPrice)) {
    whereClause.minPrice = { lte: maxPrice };
  }

  if (minIssueSize && !isNaN(minIssueSize)) {
    whereClause.issueSize = {
      ...(whereClause.issueSize || {}),
      gte: minIssueSize * 10000000,
    };
  }
  if (maxIssueSize && !isNaN(maxIssueSize)) {
    whereClause.issueSize = {
      ...(whereClause.issueSize || {}),
      lte: maxIssueSize * 10000000,
    };
  }

  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    whereClause.openDate = dateFilter;
  }
}

// Apply advanced filters (GMP, subscription)
async function applyAdvancedFilters(ipos, filters) {
  const { minGMP, maxGMP, subscriptionMin, subscriptionMax } = filters;

  return ipos.filter((ipo) => {
    // GMP filtering
    if (minGMP || maxGMP) {
      const latestGMP = ipo.gmp?.[0];
      if (!latestGMP) return false;

      if (minGMP && latestGMP.value < minGMP) return false;
      if (maxGMP && latestGMP.value > maxGMP) return false;
    }

    // Subscription filtering
    if (subscriptionMin || subscriptionMax) {
      if (!ipo.subscription || ipo.subscription.length === 0) return false;

      const maxSubscription = Math.max(...ipo.subscription.map((s) => s.subscriptionRatio));

      if (subscriptionMin && maxSubscription < subscriptionMin) return false;
      if (subscriptionMax && maxSubscription > subscriptionMax) return false;
    }

    return true;
  });
}

// Build order clause for sorting
function buildOrderClause(sortBy, sortOrder) {
  const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';

  switch (sortBy) {
    case 'openDate':
      return { openDate: orderDirection };
    case 'closeDate':
      return { closeDate: orderDirection };
    case 'listingDate':
      return { listingDate: orderDirection };
    case 'issueSize':
      return { issueSize: orderDirection };
    case 'maxPrice':
      return { maxPrice: orderDirection };
    case 'name':
      return { name: orderDirection };
    case 'symbol':
      return { symbol: orderDirection };
    case 'status':
      return { status: orderDirection };
    case 'sector':
      return { sector: orderDirection };
    case 'createdAt':
      return { createdAt: orderDirection };
    default:
      return { updatedAt: 'desc' };
  }
}

// Sort results manually (for relevance-based sorting)
function sortResults(results, orderBy) {
  if (!orderBy || typeof orderBy !== 'object') return results;

  const [field, direction] = Object.entries(orderBy)[0];

  return results.sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];

    // Handle different data types
    if (aVal instanceof Date) aVal = aVal.getTime();
    if (bVal instanceof Date) bVal = bVal.getTime();
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    // Handle null/undefined values
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return direction === 'asc' ? -1 : 1;
    if (bVal == null) return direction === 'asc' ? 1 : -1;

    // Compare values
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Process search result with highlighting and enhancements
async function processSearchResult(ipo, options) {
  const { includeAnalytics, includePredictions, highlight, searchTerms, relevanceScore } = options;

  // Base result
  const result = {
    id: ipo.id,
    symbol: ipo.symbol,
    name: ipo.name,
    sector: ipo.sector,
    status: ipo.status,
    openDate: ipo.openDate,
    closeDate: ipo.closeDate,
    listingDate: ipo.listingDate,
    minPrice: ipo.minPrice,
    maxPrice: ipo.maxPrice,
    lotSize: ipo.lotSize,
    issueSize: ipo.issueSize?.toString(),
    registrar: ipo.registrar,
    leadManagers: ipo.leadManagers,
    categories: ipo.categories,
    relevanceScore,

    // Current metrics
    currentMetrics: {
      gmp: ipo.gmp?.[0]
        ? {
            value: ipo.gmp[0].value,
            percentage: ipo.gmp[0].percentage,
            timestamp: ipo.gmp[0].timestamp,
          }
        : null,
      subscription: getLatestSubscription(ipo.subscription),
    },
  };

  // Add highlighting if requested
  if (highlight && searchTerms && searchTerms.length > 0) {
    result.highlights = generateHighlights(ipo, searchTerms);
  }

  // Add analytics if requested
  if (includeAnalytics && ipo.analytics) {
    result.analytics = {
      riskScore: ipo.analytics.riskScore,
      predictedListingGain: ipo.analytics.predictedListingGain,
      avgGMP: ipo.analytics.avgGMP,
      finalSubscription: ipo.analytics.finalSubscription,
    };
  }

  // Add predictions if requested
  if (includePredictions) {
    try {
      const [listingGain, marketSentiment] = await Promise.allSettled([
        predictionService.predictListingGain(ipo.id),
        predictionService.predictMarketSentiment(ipo.id),
      ]);

      result.predictions = {
        listingGain: listingGain.status === 'fulfilled' ? listingGain.value : null,
        marketSentiment: marketSentiment.status === 'fulfilled' ? marketSentiment.value : null,
      };
    } catch (error) {
      result.predictions = null;
    }
  }

  return result;
}

// Generate text highlights for search terms
function generateHighlights(ipo, searchTerms) {
  const highlights = {};

  const highlightText = (text, terms) => {
    if (!text || !terms.length) return text;

    let highlightedText = text;
    terms.forEach((term) => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    return highlightedText;
  };

  // Highlight different fields
  if (ipo.symbol) {
    const highlighted = highlightText(ipo.symbol, searchTerms);
    if (highlighted !== ipo.symbol) {
      highlights.symbol = highlighted;
    }
  }

  if (ipo.name) {
    const highlighted = highlightText(ipo.name, searchTerms);
    if (highlighted !== ipo.name) {
      highlights.name = highlighted;
    }
  }

  if (ipo.sector) {
    const highlighted = highlightText(ipo.sector, searchTerms);
    if (highlighted !== ipo.sector) {
      highlights.sector = highlighted;
    }
  }

  if (ipo.registrar) {
    const highlighted = highlightText(ipo.registrar, searchTerms);
    if (highlighted !== ipo.registrar) {
      highlights.registrar = highlighted;
    }
  }

  return highlights;
}

// Get latest subscription data
function getLatestSubscription(subscriptionData) {
  if (!subscriptionData || subscriptionData.length === 0) return null;

  const latest = subscriptionData.reduce((latest, current) => {
    return current.timestamp > latest.timestamp ? current : latest;
  });

  return {
    category: latest.category,
    subscriptionRatio: latest.subscriptionRatio,
    quantity: latest.quantity?.toString(),
    bidCount: latest.bidCount,
    timestamp: latest.timestamp,
  };
}

// Generate search suggestions
async function generateSearchSuggestions(query, options) {
  try {
    const { type, status, sector, limit } = options;
    const processedQuery = processSearchQuery(query);

    if (processedQuery.length < 2) return [];

    // Get suggestions from different sources
    const suggestions = [];

    // Symbol suggestions
    const symbolSuggestions = await prisma.iPO.findMany({
      where: {
        isActive: true,
        symbol: { contains: processedQuery.toUpperCase() },
        ...(status && status !== 'all' ? { status } : {}),
      },
      select: { symbol: true, name: true },
      take: 5,
    });

    symbolSuggestions.forEach((ipo) => {
      suggestions.push({
        type: 'symbol',
        value: ipo.symbol,
        display: `${ipo.symbol} - ${ipo.name}`,
        category: 'Symbol',
      });
    });

    // Name suggestions
    const nameSuggestions = await prisma.iPO.findMany({
      where: {
        isActive: true,
        name: { contains: processedQuery, mode: 'insensitive' },
        ...(status && status !== 'all' ? { status } : {}),
      },
      select: { symbol: true, name: true },
      take: 5,
    });

    nameSuggestions.forEach((ipo) => {
      if (!suggestions.some((s) => s.value === ipo.symbol)) {
        suggestions.push({
          type: 'name',
          value: ipo.name,
          display: `${ipo.name} (${ipo.symbol})`,
          category: 'Company',
        });
      }
    });

    // Sector suggestions
    const sectorSuggestions = await prisma.iPO.groupBy({
      by: ['sector'],
      where: {
        isActive: true,
        sector: { contains: processedQuery, mode: 'insensitive' },
        ...(status && status !== 'all' ? { status } : {}),
      },
      _count: { sector: true },
      take: 3,
    });

    sectorSuggestions.forEach((item) => {
      if (item.sector) {
        suggestions.push({
          type: 'sector',
          value: item.sector,
          display: `${item.sector} (${item._count.sector} IPOs)`,
          category: 'Sector',
        });
      }
    });

    // Registrar suggestions
    const registrarSuggestions = await prisma.iPO.groupBy({
      by: ['registrar'],
      where: {
        isActive: true,
        registrar: { contains: processedQuery, mode: 'insensitive' },
        ...(status && status !== 'all' ? { status } : {}),
      },
      _count: { registrar: true },
      take: 3,
    });

    registrarSuggestions.forEach((item) => {
      if (item.registrar) {
        suggestions.push({
          type: 'registrar',
          value: item.registrar,
          display: `${item.registrar} (${item._count.registrar} IPOs)`,
          category: 'Registrar',
        });
      }
    });

    // Sort by relevance and limit
    return suggestions
      .sort((a, b) => {
        const typeOrder = { symbol: 0, name: 1, sector: 2, registrar: 3 };
        return typeOrder[a.type] - typeOrder[b.type];
      })
      .slice(0, limit);
  } catch (error) {
    console.error('Error generating search suggestions:', error);
    return [];
  }
}

// Generate search analytics
async function generateSearchAnalytics(query, results) {
  try {
    const analytics = {
      query: {
        length: query.length,
        wordCount: query.split(' ').filter((w) => w.length > 0).length,
        hasNumbers: /\d/.test(query),
        hasSpecialChars: /[^a-zA-Z0-9\s]/.test(query),
      },
      results: {
        total: results.length,
        byStatus: {},
        bySector: {},
        relevanceDistribution: {
          high: 0, // > 75% of max relevance
          medium: 0, // 25-75% of max relevance
          low: 0, // < 25% of max relevance
        },
      },
      performance: {
        searchTime: Date.now() % 1000, // Mock search time
        cacheHit: false,
      },
    };

    // Analyze results
    if (results.length > 0) {
      const maxRelevance = Math.max(...results.map((r) => r.relevanceScore || 0));

      results.forEach((result) => {
        // Status distribution
        analytics.results.byStatus[result.status] =
          (analytics.results.byStatus[result.status] || 0) + 1;

        // Sector distribution
        if (result.sector) {
          analytics.results.bySector[result.sector] =
            (analytics.results.bySector[result.sector] || 0) + 1;
        }

        // Relevance distribution
        const relevancePercent = maxRelevance > 0 ? (result.relevanceScore || 0) / maxRelevance : 0;
        if (relevancePercent > 0.75) {
          analytics.results.relevanceDistribution.high++;
        } else if (relevancePercent > 0.25) {
          analytics.results.relevanceDistribution.medium++;
        } else {
          analytics.results.relevanceDistribution.low++;
        }
      });
    }

    return analytics;
  } catch (error) {
    console.error('Error generating search analytics:', error);
    return { error: 'Analytics generation failed' };
  }
}

// Get applied filters summary
function getAppliedFilters(filters) {
  const applied = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      applied.push({
        type: key,
        value,
        display: formatFilterDisplay(key, value),
      });
    }
  });

  return applied;
}

// Get available filters based on current results
async function getAvailableFilters(results) {
  const available = {
    status: {},
    sector: {},
    registrar: {},
    priceRange: { min: null, max: null },
    issueSizeRange: { min: null, max: null },
  };

  results.forEach((result) => {
    // Status options
    available.status[result.status] = (available.status[result.status] || 0) + 1;

    // Sector options
    if (result.sector) {
      available.sector[result.sector] = (available.sector[result.sector] || 0) + 1;
    }

    // Registrar options
    if (result.registrar) {
      available.registrar[result.registrar] = (available.registrar[result.registrar] || 0) + 1;
    }

    // Price range
    if (result.minPrice) {
      available.priceRange.min = available.priceRange.min
        ? Math.min(available.priceRange.min, result.minPrice)
        : result.minPrice;
    }
    if (result.maxPrice) {
      available.priceRange.max = available.priceRange.max
        ? Math.max(available.priceRange.max, result.maxPrice)
        : result.maxPrice;
    }

    // Issue size range
    if (result.issueSize) {
      const sizeInCrores = parseInt(result.issueSize) / 10000000;
      available.issueSizeRange.min = available.issueSizeRange.min
        ? Math.min(available.issueSizeRange.min, sizeInCrores)
        : sizeInCrores;
      available.issueSizeRange.max = available.issueSizeRange.max
        ? Math.max(available.issueSizeRange.max, sizeInCrores)
        : sizeInCrores;
    }
  });

  return available;
}

// Get sorting options
function getSortingOptions() {
  return [
    { value: 'relevance', label: 'Relevance', description: 'Best match first' },
    {
      value: 'openDate',
      label: 'Open Date',
      description: 'Sort by IPO opening date',
    },
    {
      value: 'closeDate',
      label: 'Close Date',
      description: 'Sort by IPO closing date',
    },
    {
      value: 'issueSize',
      label: 'Issue Size',
      description: 'Sort by IPO issue size',
    },
    { value: 'maxPrice', label: 'Price', description: 'Sort by maximum price' },
    {
      value: 'name',
      label: 'Company Name',
      description: 'Alphabetical by company name',
    },
    { value: 'symbol', label: 'Symbol', description: 'Alphabetical by symbol' },
    { value: 'status', label: 'Status', description: 'Group by IPO status' },
    { value: 'sector', label: 'Sector', description: 'Group by sector' },
  ];
}

// Format filter display text
function formatFilterDisplay(key, value) {
  switch (key) {
    case 'minPrice':
      return `Min Price: ₹${value}`;
    case 'maxPrice':
      return `Max Price: ₹${value}`;
    case 'minIssueSize':
      return `Min Issue Size: ₹${value} Cr`;
    case 'maxIssueSize':
      return `Max Issue Size: ₹${value} Cr`;
    case 'minGMP':
      return `Min GMP: ₹${value}`;
    case 'maxGMP':
      return `Max GMP: ₹${value}`;
    case 'subscriptionMin':
      return `Min Subscription: ${value}x`;
    case 'subscriptionMax':
      return `Max Subscription: ${value}x`;
    case 'dateFrom':
      return `From: ${new Date(value).toLocaleDateString()}`;
    case 'dateTo':
      return `To: ${new Date(value).toLocaleDateString()}`;
    default:
      return `${key}: ${value}`;
  }
}

// Advanced search functions (ML-powered)
async function buildAdvancedSearchConditions(queries, searchType) {
  // Implementation would depend on the search type
  const conditions = [];

  queries.forEach((query) => {
    const terms = extractSearchTerms(query);

    if (searchType === 'semantic') {
      // Add semantic search conditions
      conditions.push(...buildSemanticSearch(terms));
    } else {
      // Add traditional search conditions
      conditions.push(...buildUniversalSearch(terms, true));
    }
  });

  return conditions;
}

function buildSemanticSearch(terms) {
  // Mock semantic search - in production, this would use NLP models
  const semanticConditions = [];

  terms.forEach((term) => {
    // Add related terms based on semantic similarity
    const relatedTerms = getSemanticallySimilarTerms(term);

    relatedTerms.forEach((relatedTerm) => {
      semanticConditions.push(
        { name: { contains: relatedTerm, mode: 'insensitive' } },
        { sector: { contains: relatedTerm, mode: 'insensitive' } }
      );
    });
  });

  return semanticConditions;
}

function getSemanticallySimilarTerms(term) {
  // Mock semantic similarity - in production, use word embeddings
  const synonyms = {
    tech: ['technology', 'software', 'digital', 'IT'],
    bank: ['banking', 'financial', 'finance'],
    pharma: ['pharmaceutical', 'drug', 'medicine'],
    auto: ['automobile', 'automotive', 'vehicle'],
  };

  return synonyms[term.toLowerCase()] || [term];
}

async function applyMLRanking(results, params) {
  // Mock ML ranking - in production, use trained models
  return results
    .map((ipo, index) => {
      const mlScore = calculateMLScore(ipo, params);
      return {
        ...ipo,
        mlScore,
        rankingFactors: {
          textRelevance: 0.7,
          popularity: 0.2,
          recency: 0.1,
        },
      };
    })
    .sort((a, b) => b.mlScore - a.mlScore);
}

function calculateMLScore(ipo, params) {
  // Mock ML scoring
  let score = Math.random() * 100;

  // Boost for exact matches
  if (
    params.queries.some(
      (q) =>
        ipo.symbol.toLowerCase().includes(q.toLowerCase()) ||
        ipo.name.toLowerCase().includes(q.toLowerCase())
    )
  ) {
    score *= 1.5;
  }

  // Status boost
  const statusBoosts = { open: 1.3, upcoming: 1.1, closed: 1.0, listed: 0.9 };
  score *= statusBoosts[ipo.status] || 1.0;

  return Math.round(score * 100) / 100;
}

function buildAdvancedFilters(filters) {
  const conditions = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      switch (key) {
        case 'status':
          conditions.push({
            status: Array.isArray(value) ? { in: value } : value,
          });
          break;
        case 'sector':
          conditions.push({
            sector: { in: Array.isArray(value) ? value : [value] },
          });
          break;
        case 'priceRange':
          if (value.min) conditions.push({ maxPrice: { gte: value.min } });
          if (value.max) conditions.push({ minPrice: { lte: value.max } });
          break;
        // Add more filter types as needed
      }
    }
  });

  return conditions;
}

async function performSemanticAnalysis(queries) {
  // Mock semantic analysis
  return {
    entities: extractEntitiesFromQueries(queries),
    intent: detectSearchIntent(queries),
    sentiment: 'neutral',
    complexity: queries.reduce((sum, q) => sum + q.split(' ').length, 0) / queries.length,
  };
}

async function extractEntities(queries) {
  // Mock entity extraction
  const entities = {
    companies: [],
    sectors: [],
    dates: [],
    amounts: [],
  };

  queries.forEach((query) => {
    // Extract company names (mock)
    if (query.includes('ltd') || query.includes('limited')) {
      entities.companies.push(query);
    }

    // Extract sectors (mock)
    const sectorKeywords = ['tech', 'bank', 'pharma', 'auto'];
    sectorKeywords.forEach((keyword) => {
      if (query.toLowerCase().includes(keyword)) {
        entities.sectors.push(keyword);
      }
    });

    // Extract dates (mock)
    const datePattern = /\d{4}-\d{2}-\d{2}/g;
    const dates = query.match(datePattern);
    if (dates) entities.dates.push(...dates);

    // Extract amounts (mock)
    const amountPattern = /₹?\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:cr|crore|l|lakh))?/gi;
    const amounts = query.match(amountPattern);
    if (amounts) entities.amounts.push(...amounts);
  });

  return entities;
}

function extractEntitiesFromQueries(queries) {
  return queries.flatMap((query) => extractSearchTerms(query));
}

function detectSearchIntent(queries) {
  // Mock intent detection
  const query = queries.join(' ').toLowerCase();

  if (query.includes('when') || query.includes('date')) return 'temporal';
  if (query.includes('best') || query.includes('good')) return 'recommendation';
  if (query.includes('price') || query.includes('₹')) return 'financial';
  if (query.includes('compare')) return 'comparison';

  return 'search';
}

async function generateAdvancedSearchAnalytics(queries, results) {
  return {
    queryComplexity: queries.reduce((sum, q) => sum + q.split(' ').length, 0) / queries.length,
    resultDiversity: calculateResultDiversity(results.data),
    confidence: 0.85, // Mock confidence score
    processingTime: 150, // Mock processing time in ms
  };
}

function calculateResultDiversity(results) {
  const sectors = new Set(results.map((r) => r.sector).filter(Boolean));
  const statuses = new Set(results.map((r) => r.status));

  return {
    sectorDiversity: sectors.size / Math.max(results.length, 1),
    statusDiversity: statuses.size / Math.max(results.length, 1),
    overallDiversity: (sectors.size + statuses.size) / (2 * Math.max(results.length, 1)),
  };
}

async function generateSearchRecommendations(results, queries) {
  const recommendations = [];

  if (results.length === 0) {
    recommendations.push({
      type: 'broaden_search',
      message: 'Try removing some filters or using broader search terms',
      action: 'modify_query',
    });
  } else if (results.length > 50) {
    recommendations.push({
      type: 'narrow_search',
      message: 'Too many results. Try adding filters or being more specific',
      action: 'add_filters',
    });
  }

  // Sector-based recommendations
  const sectors = [...new Set(results.map((r) => r.sector).filter(Boolean))];
  if (sectors.length === 1) {
    recommendations.push({
      type: 'explore_sectors',
      message: `All results are from ${sectors[0]}. Explore other sectors?`,
      action: 'suggest_sectors',
      data: { excludeSector: sectors[0] },
    });
  }

  return recommendations;
}

async function processAdvancedSearchResult(ipo, options) {
  const { queries, searchType, highlight, includeAnalytics, includePredictions } = options;

  const result = await processSearchResult(ipo, {
    includeAnalytics,
    includePredictions,
    highlight,
    searchTerms: queries.flatMap((q) => extractSearchTerms(q)),
    relevanceScore: ipo.mlScore || 1.0,
  });

  // Add advanced search specific data
  result.mlScore = ipo.mlScore;
  result.rankingFactors = ipo.rankingFactors;
  result.searchType = searchType;

  return result;
}

// Logging function
function logSearchQuery(request, data) {
  try {
    // Log search analytics - non-blocking
    setImmediate(() => {
      console.log('Search Query:', {
        timestamp: new Date().toISOString(),
        ip: request.ip,
        userAgent: request.headers.get('user-agent'),
        ...data,
      });
    });
  } catch (error) {
    // Silent fail for logging
  }
}

// Export configuration
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
