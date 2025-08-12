import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db.js';
import { cache } from '../../../../lib/cache.js';
import { requireAuth } from '../../../../lib/auth.js';
import { predictionService } from '../../../../services/prediction-service.js';

// Get prediction analytics for IPOs
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const ipoId = searchParams.get('ipoId');
    const symbol = searchParams.get('symbol');
    const predictionType = searchParams.get('type') || 'all';
    const timeRange = parseInt(searchParams.get('timeRange')) || 7;
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const includeAccuracy = searchParams.get('includeAccuracy') === 'true';

    // Build cache key
    const cacheKey = cache.key(
      'PREDICTIONS',
      `analytics:${JSON.stringify({
        ipoId,
        symbol,
        predictionType,
        timeRange,
        includeHistory,
        includeAccuracy,
      })}`
    );

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    let predictions;

    if (ipoId || symbol) {
      // Single IPO predictions
      const targetIpoId =
        ipoId ||
        (
          await prisma.iPO.findUnique({
            where: { symbol: symbol.toUpperCase() },
            select: { id: true },
          })
        )?.id;

      if (!targetIpoId) {
        return NextResponse.json(
          {
            success: false,
            error: 'IPO not found',
          },
          { status: 404 }
        );
      }

      predictions = await getSingleIPOPredictions(targetIpoId, {
        predictionType,
        timeRange,
        includeHistory,
        includeAccuracy,
      });
    } else {
      // Market-wide prediction analytics
      predictions = await getMarketPredictions({
        timeRange,
        includeAccuracy,
      });
    }

    const response = {
      success: true,
      data: predictions,
      metadata: {
        ipoId,
        symbol,
        predictionType,
        timeRange,
        includeHistory,
        includeAccuracy,
        generatedAt: new Date().toISOString(),
      },
    };

    // Cache for 2 minutes (predictions change frequently)
    await cache.set(cacheKey, response, 120);
    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/analytics/predictions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prediction analytics',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Create or update predictions (Admin only)
export async function POST(request) {
  try {
    const authResult = await requireAuth({ roles: ['admin', 'super_admin'] })(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { action, ipoId, predictionType, options = {} } = body;

    let result;

    switch (action) {
      case 'generate':
        if (!ipoId) {
          return NextResponse.json(
            {
              success: false,
              error: 'IPO ID is required for generate action',
            },
            { status: 400 }
          );
        }

        result = await generatePredictions(ipoId, predictionType, options);
        break;

      case 'refresh_all':
        const activeIPOs = await prisma.iPO.findMany({
          where: { isActive: true, status: { in: ['upcoming', 'open'] } },
          select: { id: true, symbol: true },
        });

        const refreshResults = await Promise.allSettled(
          activeIPOs.map((ipo) => generatePredictions(ipo.id, 'all', { lightweight: true }))
        );

        const successful = refreshResults.filter((r) => r.status === 'fulfilled').length;
        result = {
          refreshed: successful,
          failed: refreshResults.length - successful,
        };
        break;

      case 'accuracy_check':
        result = await checkPredictionAccuracy(options);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action',
            availableActions: ['generate', 'refresh_all', 'accuracy_check'],
          },
          { status: 400 }
        );
    }

    // Clear relevant caches
    await cache.del(cache.key('PREDICTIONS', '*'));

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('POST /api/analytics/predictions error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process prediction request',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Get predictions for single IPO
async function getSingleIPOPredictions(ipoId, options) {
  const { predictionType, includeHistory, includeAccuracy } = options;

  const predictions = {};
  const predictionTypes =
    predictionType === 'all'
      ? ['LISTING_GAIN', 'ALLOTMENT_PROBABILITY', 'GMP_PREDICTION', 'MARKET_SENTIMENT']
      : [predictionType];

  // Get current predictions
  for (const type of predictionTypes) {
    try {
      let prediction;
      switch (type) {
        case 'LISTING_GAIN':
          prediction = await predictionService.predictListingGain(ipoId);
          break;
        case 'ALLOTMENT_PROBABILITY':
          prediction = await predictionService.predictAllotmentProbability(null, ipoId, {
            category: 'RETAIL',
          });
          break;
        case 'GMP_PREDICTION':
          prediction = await predictionService.predictGMPPrice(ipoId);
          break;
        case 'MARKET_SENTIMENT':
          prediction = await predictionService.predictMarketSentiment(ipoId);
          break;
        default:
          continue;
      }

      predictions[type] = {
        current: prediction,
        type: type.toLowerCase(),
        confidence: prediction?.confidence || 0,
        timestamp: prediction?.timestamp || Date.now(),
      };
    } catch (error) {
      predictions[type] = {
        current: null,
        error: error.message,
        type: type.toLowerCase(),
      };
    }
  }

  // Add historical data if requested
  if (includeHistory) {
    const historicalData = await prisma.prediction.findMany({
      where: {
        ipoId,
        ...(predictionType !== 'all' ? { modelType: predictionType } : {}),
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    predictions.history = historicalData.map((p) => ({
      modelType: p.modelType,
      value: p.predictedValue,
      confidence: p.confidence,
      timestamp: p.createdAt,
    }));
  }

  // Add accuracy metrics if requested
  if (includeAccuracy) {
    predictions.accuracy = await calculatePredictionAccuracy(ipoId, predictionTypes);
  }

  return predictions;
}

// Get market-wide predictions
async function getMarketPredictions(options) {
  const { timeRange, includeAccuracy } = options;
  const since = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

  const [recentPredictions, activeIPOs] = await Promise.all([
    prisma.prediction.findMany({
      where: { createdAt: { gte: since } },
      include: { ipo: { select: { symbol: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.iPO.count({
      where: { isActive: true, status: { in: ['upcoming', 'open'] } },
    }),
  ]);

  // Group by model type
  const byModelType = {};
  recentPredictions.forEach((p) => {
    if (!byModelType[p.modelType]) {
      byModelType[p.modelType] = [];
    }
    byModelType[p.modelType].push(p);
  });

  // Calculate statistics for each model type
  const modelStats = {};
  Object.entries(byModelType).forEach(([modelType, predictions]) => {
    const values = predictions.map((p) => p.predictedValue).filter((v) => v !== null);
    const confidences = predictions.map((p) => p.confidence).filter((c) => c !== null);

    modelStats[modelType] = {
      count: predictions.length,
      avgValue: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      avgConfidence:
        confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      valueRange:
        values.length > 0
          ? {
              min: Math.min(...values),
              max: Math.max(...values),
            }
          : null,
    };
  });

  // Market sentiment analysis
  const sentimentPredictions = byModelType.MARKET_SENTIMENT || [];
  const marketSentiment = calculateOverallSentiment(sentimentPredictions);

  const summary = {
    totalPredictions: recentPredictions.length,
    activeIPOs,
    modelTypes: Object.keys(byModelType),
    modelStats,
    marketSentiment,
    topPerformers: getTopPerformingModels(byModelType),
  };

  if (includeAccuracy) {
    summary.accuracyMetrics = await calculateMarketAccuracy(since);
  }

  return summary;
}

// Generate predictions for an IPO
async function generatePredictions(ipoId, predictionType, options) {
  const results = {};
  const types =
    predictionType === 'all'
      ? ['LISTING_GAIN', 'ALLOTMENT_PROBABILITY', 'GMP_PREDICTION', 'MARKET_SENTIMENT']
      : [predictionType];

  for (const type of types) {
    try {
      let prediction;
      switch (type) {
        case 'LISTING_GAIN':
          prediction = await predictionService.predictListingGain(ipoId);
          break;
        case 'ALLOTMENT_PROBABILITY':
          prediction = await predictionService.predictAllotmentProbability(null, ipoId, {
            category: 'RETAIL',
          });
          break;
        case 'GMP_PREDICTION':
          prediction = await predictionService.predictGMPPrice(ipoId);
          break;
        case 'MARKET_SENTIMENT':
          prediction = await predictionService.predictMarketSentiment(ipoId);
          break;
      }

      // Store prediction in database
      if (prediction) {
        await prisma.prediction.create({
          data: {
            ipoId,
            modelType: type,
            predictedValue: prediction.value,
            confidence: prediction.confidence,
            features: JSON.stringify(prediction.features || []),
          },
        });
      }

      results[type] = prediction;
    } catch (error) {
      results[type] = { error: error.message };
    }
  }

  return results;
}

// Calculate prediction accuracy
async function calculatePredictionAccuracy(ipoId, predictionTypes) {
  const ipo = await prisma.iPO.findUnique({
    where: { id: ipoId },
    select: { status: true, listingPrice: true, maxPrice: true },
  });

  if (ipo.status !== 'listed' || !ipo.listingPrice) {
    return {
      message: 'Cannot calculate accuracy - IPO not yet listed or missing listing price',
    };
  }

  const actualListingGain = ((ipo.listingPrice - ipo.maxPrice) / ipo.maxPrice) * 100;
  const predictions = await prisma.prediction.findMany({
    where: {
      ipoId,
      modelType: { in: predictionTypes },
    },
    orderBy: { createdAt: 'desc' },
    take: 5, // Latest 5 predictions per type
  });

  const accuracyByType = {};

  predictions.forEach((p) => {
    if (p.modelType === 'LISTING_GAIN') {
      const error = Math.abs(p.predictedValue - actualListingGain);
      const accuracy = Math.max(0, 100 - error);

      if (!accuracyByType[p.modelType]) accuracyByType[p.modelType] = [];
      accuracyByType[p.modelType].push({
        predicted: p.predictedValue,
        actual: actualListingGain,
        accuracy: accuracy.toFixed(2),
        confidence: p.confidence,
      });
    }
  });

  return accuracyByType;
}

// Check prediction accuracy across market
async function checkPredictionAccuracy(options) {
  const { days = 30 } = options;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const listedIPOs = await prisma.iPO.findMany({
    where: {
      status: 'listed',
      listingDate: { gte: since },
      listingPrice: { not: null },
    },
    include: {
      predictions: {
        where: { modelType: 'LISTING_GAIN' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const accuracyData = [];

  listedIPOs.forEach((ipo) => {
    if (ipo.predictions.length > 0) {
      const prediction = ipo.predictions[0];
      const actualGain = ((ipo.listingPrice - ipo.maxPrice) / ipo.maxPrice) * 100;
      const error = Math.abs(prediction.predictedValue - actualGain);
      const accuracy = Math.max(0, 100 - error);

      accuracyData.push({
        symbol: ipo.symbol,
        predicted: prediction.predictedValue,
        actual: actualGain,
        error: error.toFixed(2),
        accuracy: accuracy.toFixed(2),
        confidence: prediction.confidence,
      });
    }
  });

  const avgAccuracy =
    accuracyData.length > 0
      ? accuracyData.reduce((sum, item) => sum + parseFloat(item.accuracy), 0) / accuracyData.length
      : 0;

  return {
    totalIPOs: accuracyData.length,
    averageAccuracy: avgAccuracy.toFixed(2) + '%',
    results: accuracyData,
    period: `${days} days`,
  };
}

// Calculate market-wide accuracy
async function calculateMarketAccuracy(since) {
  const predictions = await prisma.prediction.findMany({
    where: {
      createdAt: { gte: since },
      ipo: { status: 'listed', listingPrice: { not: null } },
    },
    include: {
      ipo: { select: { listingPrice: true, maxPrice: true } },
    },
  });

  const accuracyByModel = {};

  predictions.forEach((p) => {
    if (p.modelType === 'LISTING_GAIN' && p.ipo.listingPrice) {
      const actualGain = ((p.ipo.listingPrice - p.ipo.maxPrice) / p.ipo.maxPrice) * 100;
      const error = Math.abs(p.predictedValue - actualGain);
      const accuracy = Math.max(0, 100 - error);

      if (!accuracyByModel[p.modelType]) accuracyByModel[p.modelType] = [];
      accuracyByModel[p.modelType].push(accuracy);
    }
  });

  const avgAccuracyByModel = {};
  Object.entries(accuracyByModel).forEach(([model, accuracies]) => {
    avgAccuracyByModel[model] = {
      averageAccuracy: accuracies.reduce((a, b) => a + b, 0) / accuracies.length,
      sampleSize: accuracies.length,
    };
  });

  return avgAccuracyByModel;
}

// Calculate overall market sentiment
function calculateOverallSentiment(sentimentPredictions) {
  if (sentimentPredictions.length === 0) return 'neutral';

  const avgSentiment =
    sentimentPredictions.reduce((sum, p) => sum + p.predictedValue, 0) /
    sentimentPredictions.length;

  if (avgSentiment > 0.6) return 'very_positive';
  if (avgSentiment > 0.2) return 'positive';
  if (avgSentiment < -0.6) return 'very_negative';
  if (avgSentiment < -0.2) return 'negative';
  return 'neutral';
}

// Get top performing models
function getTopPerformingModels(byModelType) {
  return Object.entries(byModelType)
    .map(([modelType, predictions]) => ({
      modelType,
      count: predictions.length,
      avgConfidence:
        predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) / predictions.length,
    }))
    .sort((a, b) => b.avgConfidence - a.avgConfidence)
    .slice(0, 3);
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
