import { cache } from '../lib/cache.js';
import { prisma } from '../lib/db.js';
import { webSocketService } from '../lib/websocket.js';
import { analyticsService } from '../lib/analytics.js';

class PredictionService {
  constructor() {
    this.isRunning = false;
    this.predictionModels = new Map();
    this.trainingData = new Map();
    this.modelAccuracy = new Map();
    this.activePredictions = new Map();

    // Prediction configuration
    this.predictionConfig = {
      UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
      TRAINING_INTERVAL: 60 * 60 * 1000, // 1 hour
      ACCURACY_CHECK_INTERVAL: 30 * 60 * 1000, // 30 minutes
      MIN_TRAINING_DATA: 50, // Minimum records for training
      CONFIDENCE_THRESHOLD: 0.7, // Minimum confidence for predictions
      PREDICTION_HORIZON: 7, // Days to predict ahead
      MAX_RETRIES: 3,
    };

    // Prediction models and their configurations
    this.models = {
      LISTING_GAIN: {
        name: 'Listing Gain Prediction',
        type: 'regression',
        features: [
          'avgGMP',
          'gmpVolatility',
          'subscriptionRatio',
          'qibSubscription',
          'retailSubscription',
          'nibSubscription',
          'issueSize',
          'lotSize',
          'priceRange',
          'marketSentiment',
          'sectorPerformance',
          'marketCap',
          'promoterHolding',
          'faceValue',
          'premiumDiscount',
          'registrarReputation',
          'leadManagers',
          'gmpTrend',
          'volumeWeightedGMP',
          'daysSinceOpen',
        ],
        target: 'listingGainPercentage',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },

      ALLOTMENT_PROBABILITY: {
        name: 'Allotment Probability Prediction',
        type: 'classification',
        features: [
          'subscriptionRatio',
          'category',
          'applicationAmount',
          'lotQuantity',
          'biddingDay',
          'userHistory',
          'applicationTime',
          'applicationMethod',
          'brokerType',
          'bankType',
          'panCardAge',
          'dematAccountAge',
          'previousAllotments',
          'investmentPattern',
          'geographicLocation',
        ],
        target: 'allotmentStatus',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },

      SUBSCRIPTION_TREND: {
        name: 'Subscription Trend Prediction',
        type: 'time_series',
        features: [
          'currentSubscription',
          'hourlyVelocity',
          'timeRemaining',
          'dayOfWeek',
          'timeOfDay',
          'marketConditions',
          'newssentiment',
          'competitorIPOs',
          'seasonality',
          'economicIndicators',
          'sectorTrends',
          'mediaAttention',
        ],
        target: 'finalSubscriptionRatio',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },

      GMP_PREDICTION: {
        name: 'GMP Price Prediction',
        type: 'time_series',
        features: [
          'historicalGMP',
          'volume',
          'marketSentiment',
          'newsEvents',
          'competitorPerformance',
          'marketIndices',
          'sectorPE',
          'companyPE',
          'subscriptionStatus',
          'daysToListing',
          'marketVolatility',
          'tradingVolume',
        ],
        target: 'nextGMPValue',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },

      MARKET_SENTIMENT: {
        name: 'Market Sentiment Prediction',
        type: 'classification',
        features: [
          'newsAnalysis',
          'socialMediaMentions',
          'analystRecommendations',
          'marketTrends',
          'economicIndicators',
          'sectorPerformance',
          'competitorNews',
          'managementReputation',
          'financialMetrics',
          'industryGrowth',
          'regulatoryChanges',
          'globalMarkets',
        ],
        target: 'sentimentScore',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },

      IPO_SUCCESS: {
        name: 'IPO Success Prediction',
        type: 'classification',
        features: [
          'companyAge',
          'revenue',
          'profitability',
          'growthRate',
          'marketShare',
          'competitorAnalysis',
          'managementTeam',
          'businessModel',
          'scalability',
          'financialHealth',
          'debtRatio',
          'cashFlow',
          'marketTiming',
          'valuationMetrics',
          'riskFactors',
          'regulatoryEnvironment',
        ],
        target: 'ipoSuccessCategory',
        accuracy: 0,
        lastTrained: null,
        sampleCount: 0,
        enabled: true,
      },
    };

    // Performance tracking
    this.performance = {
      totalPredictions: 0,
      accuratePredictions: 0,
      totalTrainingSessions: 0,
      averageTrainingTime: 0,
      averagePredictionTime: 0,
      modelUpdates: 0,
      lastAccuracyCheck: null,
    };

    // Real-time prediction cache
    this.predictionCache = new Map();
    this.cacheTTL = {
      LISTING_GAIN: 30 * 60 * 1000, // 30 minutes
      ALLOTMENT_PROBABILITY: 60 * 60 * 1000, // 1 hour
      SUBSCRIPTION_TREND: 10 * 60 * 1000, // 10 minutes
      GMP_PREDICTION: 5 * 60 * 1000, // 5 minutes
      MARKET_SENTIMENT: 15 * 60 * 1000, // 15 minutes
      IPO_SUCCESS: 24 * 60 * 60 * 1000, // 24 hours
    };

    // Active intervals
    this.activeIntervals = new Map();

    // Feature engineering pipeline
    this.featureProcessors = new Map();
    this.initializeFeatureProcessors();

    // Model ensemble weights
    this.ensembleWeights = new Map();
    this.initializeEnsembleWeights();

    console.log('🔮 Prediction Service initialized');
  }

  // Start comprehensive prediction service
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Prediction Service is already running');
      return;
    }

    try {
      console.log('🚀 Starting Enhanced Prediction Service...');

      // Initialize prediction models
      await this.initializePredictionModels();

      // Load training data
      await this.loadTrainingData();

      // Train initial models
      await this.trainAllModels();

      // Start prediction workflows
      this.startPredictionWorkflows();

      // Start model training scheduler
      this.startModelTraining();

      // Start accuracy monitoring
      this.startAccuracyMonitoring();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Start maintenance tasks
      this.startMaintenanceTasks();

      this.isRunning = true;

      console.log('✅ Enhanced Prediction Service started successfully');
      console.log(`🔮 ${Object.keys(this.models).length} prediction models active`);

      // Broadcast service start
      await webSocketService.broadcastSystemStatus({
        type: 'prediction_service_started',
        models: Object.keys(this.models).length,
        accuracy: this.getOverallAccuracy(),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Failed to start Prediction Service:', error);
      throw error;
    }
  }

  // Initialize prediction models
  async initializePredictionModels() {
    console.log('🧠 Initializing prediction models...');

    try {
      for (const [modelKey, modelConfig] of Object.entries(this.models)) {
        // Initialize model structure
        const model = {
          ...modelConfig,
          weights: new Map(),
          biases: new Map(),
          normalizers: new Map(),
          featureImportance: new Map(),
          trainingHistory: [],
          predictions: [],
          lastPrediction: null,
          isReady: false,
        };

        // Load existing model if available
        const savedModel = await this.loadSavedModel(modelKey);
        if (savedModel) {
          Object.assign(model, savedModel);
          model.isReady = true;
          console.log(`📂 Loaded saved model: ${modelKey}`);
        }

        this.predictionModels.set(modelKey, model);

        // Initialize ensemble weights
        this.ensembleWeights.set(modelKey, 1.0 / Object.keys(this.models).length);
      }

      console.log(`✅ Initialized ${this.predictionModels.size} prediction models`);
    } catch (error) {
      console.error('❌ Failed to initialize prediction models:', error);
      throw error;
    }
  }

  // Load training data from database
  async loadTrainingData() {
    console.log('📊 Loading training data...');

    try {
      // Load IPO historical data
      const ipos = await prisma.iPO.findMany({
        where: {
          status: 'listed',
          listingDate: { not: null },
        },
        include: {
          gmpData: {
            orderBy: { timestamp: 'desc' },
          },
          subscriptionData: {
            orderBy: { timestamp: 'desc' },
          },
          allotmentData: true,
          analytics: true,
          watchlists: true,
          alerts: true,
        },
      });

      // Process training data for each model
      for (const [modelKey, model] of this.predictionModels) {
        const trainingSet = await this.prepareTrainingData(modelKey, ipos);
        this.trainingData.set(modelKey, trainingSet);

        console.log(`📈 Prepared ${trainingSet.length} training samples for ${modelKey}`);
      }

      console.log(`✅ Loaded training data for ${this.predictionModels.size} models`);
    } catch (error) {
      console.error('❌ Failed to load training data:', error);
      throw error;
    }
  }

  // Prepare training data for specific model
  async prepareTrainingData(modelKey, ipos) {
    const model = this.predictionModels.get(modelKey);
    const trainingSet = [];

    try {
      for (const ipo of ipos) {
        // Extract features based on model configuration
        const features = await this.extractFeatures(modelKey, ipo);
        const target = await this.extractTarget(modelKey, ipo);

        if (features && target !== null && target !== undefined) {
          trainingSet.push({
            id: ipo.id,
            symbol: ipo.symbol,
            features,
            target,
            timestamp: ipo.listingDate,
            metadata: {
              issueSize: ipo.issueSize,
              sector: ipo.sector,
              registrar: ipo.registrar,
            },
          });
        }
      }

      // Validate and clean training data
      return this.validateTrainingData(trainingSet, model);
    } catch (error) {
      console.error(`Error preparing training data for ${modelKey}:`, error);
      return [];
    }
  }

  // Extract features for model training/prediction
  async extractFeatures(modelKey, ipo) {
    const model = this.predictionModels.get(modelKey);
    const features = {};

    try {
      for (const featureName of model.features) {
        const processor = this.featureProcessors.get(featureName);
        if (processor) {
          features[featureName] = await processor(ipo);
        } else {
          features[featureName] = this.extractBasicFeature(featureName, ipo);
        }
      }

      return features;
    } catch (error) {
      console.error(`Error extracting features for ${modelKey}:`, error);
      return null;
    }
  }

  // Extract target variable for training
  async extractTarget(modelKey, ipo) {
    const model = this.predictionModels.get(modelKey);

    try {
      switch (model.target) {
        case 'listingGainPercentage':
          return this.calculateListingGain(ipo);

        case 'allotmentStatus':
          return this.getAllotmentStatus(ipo);

        case 'finalSubscriptionRatio':
          return this.getFinalSubscriptionRatio(ipo);

        case 'nextGMPValue':
          return this.getNextGMPValue(ipo);

        case 'sentimentScore':
          return this.getSentimentScore(ipo);

        case 'ipoSuccessCategory':
          return this.getIPOSuccessCategory(ipo);

        default:
          return null;
      }
    } catch (error) {
      console.error(`Error extracting target for ${modelKey}:`, error);
      return null;
    }
  }

  // Initialize feature processors
  initializeFeatureProcessors() {
    // GMP-related features
    this.featureProcessors.set('avgGMP', async (ipo) => {
      const gmpValues = ipo.gmp?.map((g) => g.value) || [];
      return gmpValues.length > 0 ? gmpValues.reduce((a, b) => a + b, 0) / gmpValues.length : 0;
    });

    this.featureProcessors.set('gmpVolatility', async (ipo) => {
      const gmpValues = ipo.gmp?.map((g) => g.value) || [];
      if (gmpValues.length < 2) return 0;

      const mean = gmpValues.reduce((a, b) => a + b, 0) / gmpValues.length;
      const variance =
        gmpValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / gmpValues.length;
      return Math.sqrt(variance);
    });

    this.featureProcessors.set('gmpTrend', async (ipo) => {
      const gmpValues = ipo.gmp?.map((g) => g.value) || [];
      if (gmpValues.length < 3) return 0;

      const recentAvg = gmpValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = gmpValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
      return olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
    });

    // Subscription-related features
    this.featureProcessors.set('subscriptionRatio', async (ipo) => {
      const latest = ipo.subscription?.[0];
      return latest?.subscriptionRatio || 0;
    });

    this.featureProcessors.set('qibSubscription', async (ipo) => {
      const qibSub = ipo.subscription?.find((s) => s.category === 'QIB');
      return qibSub?.subscriptionRatio || 0;
    });

    this.featureProcessors.set('retailSubscription', async (ipo) => {
      const retailSub = ipo.subscription?.find((s) => s.category === 'RETAIL');
      return retailSub?.subscriptionRatio || 0;
    });

    // Market and timing features
    this.featureProcessors.set('daysSinceOpen', async (ipo) => {
      const openDate = new Date(ipo.openDate);
      const now = new Date();
      return Math.ceil((now - openDate) / (1000 * 60 * 60 * 24));
    });

    this.featureProcessors.set('marketSentiment', async (ipo) => {
      // Mock market sentiment - in production, integrate with news/social media APIs
      return Math.random() * 2 - 1; // Range: -1 to 1
    });

    this.featureProcessors.set('sectorPerformance', async (ipo) => {
      // Mock sector performance - in production, fetch from market data APIs
      return Math.random() * 0.2 - 0.1; // Range: -10% to 10%
    });

    // Company-specific features
    this.featureProcessors.set('issueSize', async (ipo) => {
      return Number(ipo.issueSize || 0) / 1000000000; // Normalize to billions
    });

    this.featureProcessors.set('priceRange', async (ipo) => {
      return ipo.maxPrice > 0 ? (ipo.maxPrice - ipo.minPrice) / ipo.maxPrice : 0;
    });

    console.log(`🔧 Initialized ${this.featureProcessors.size} feature processors`);
  }

  // Initialize ensemble weights
  initializeEnsembleWeights() {
    const modelCount = Object.keys(this.models).length;
    const baseWeight = 1.0 / modelCount;

    for (const modelKey of Object.keys(this.models)) {
      this.ensembleWeights.set(modelKey, baseWeight);
    }

    console.log('⚖️  Initialized ensemble weights');
  }

  // Train all models
  async trainAllModels() {
    console.log('🎯 Training all prediction models...');

    for (const [modelKey, model] of this.predictionModels) {
      try {
        if (model.enabled) {
          await this.trainModel(modelKey);
        }
      } catch (error) {
        console.error(`Error training model ${modelKey}:`, error);
      }
    }

    console.log('✅ Completed training all models');
  }

  // Train individual model
  async trainModel(modelKey) {
    const startTime = Date.now();
    console.log(`🧠 Training model: ${modelKey}...`);

    try {
      const model = this.predictionModels.get(modelKey);
      const trainingData = this.trainingData.get(modelKey);

      if (!trainingData || trainingData.length < this.predictionConfig.MIN_TRAINING_DATA) {
        console.warn(
          `Insufficient training data for ${modelKey}: ${trainingData?.length || 0} samples`
        );
        return;
      }

      // Split data into training and validation sets
      const splitIndex = Math.floor(trainingData.length * 0.8);
      const trainSet = trainingData.slice(0, splitIndex);
      const validationSet = trainingData.slice(splitIndex);

      // Normalize features
      const normalizers = this.calculateNormalizers(trainSet);
      model.normalizers = normalizers;

      // Train based on model type
      let trainedWeights;
      switch (model.type) {
        case 'regression':
          trainedWeights = await this.trainRegressionModel(trainSet, normalizers);
          break;
        case 'classification':
          trainedWeights = await this.trainClassificationModel(trainSet, normalizers);
          break;
        case 'time_series':
          trainedWeights = await this.trainTimeSeriesModel(trainSet, normalizers);
          break;
        default:
          throw new Error(`Unknown model type: ${model.type}`);
      }

      model.weights = trainedWeights.weights;
      model.biases = trainedWeights.biases;

      // Calculate accuracy on validation set
      const accuracy = await this.validateModel(modelKey, validationSet);
      model.accuracy = accuracy;

      // Update model metadata
      model.lastTrained = new Date();
      model.sampleCount = trainSet.length;
      model.isReady = true;

      // Store training history
      model.trainingHistory.push({
        timestamp: Date.now(),
        accuracy,
        sampleCount: trainSet.length,
        trainingTime: Date.now() - startTime,
      });

      // Save model
      await this.saveModel(modelKey, model);

      // Update ensemble weights based on accuracy
      this.updateEnsembleWeight(modelKey, accuracy);

      const trainingTime = Date.now() - startTime;
      this.updateTrainingMetrics(trainingTime);

      console.log(`✅ Trained ${modelKey}: ${accuracy.toFixed(3)} accuracy (${trainingTime}ms)`);
    } catch (error) {
      console.error(`❌ Failed to train model ${modelKey}:`, error);
      throw error;
    }
  }

  // Train regression model (Linear Regression)
  async trainRegressionModel(trainSet, normalizers) {
    const features = trainSet[0].features;
    const featureNames = Object.keys(features);
    const m = trainSet.length;
    const n = featureNames.length;

    // Initialize weights and bias
    const weights = new Map();
    featureNames.forEach((name) => weights.set(name, Math.random() * 0.01));
    let bias = 0;

    // Gradient descent parameters
    const learningRate = 0.01;
    const epochs = 1000;

    // Training loop
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      const gradients = new Map();
      let biasGradient = 0;

      // Initialize gradients
      featureNames.forEach((name) => gradients.set(name, 0));

      // Forward pass and gradient calculation
      for (const sample of trainSet) {
        const normalizedFeatures = this.normalizeFeatures(sample.features, normalizers);

        // Prediction
        let prediction = bias;
        for (const [featureName, value] of Object.entries(normalizedFeatures)) {
          prediction += weights.get(featureName) * value;
        }

        // Loss (Mean Squared Error)
        const error = prediction - sample.target;
        totalLoss += error * error;

        // Gradients
        biasGradient += error;
        for (const [featureName, value] of Object.entries(normalizedFeatures)) {
          gradients.set(featureName, gradients.get(featureName) + error * value);
        }
      }

      // Update weights
      bias -= (learningRate * biasGradient) / m;
      for (const featureName of featureNames) {
        const currentWeight = weights.get(featureName);
        weights.set(featureName, currentWeight - (learningRate * gradients.get(featureName)) / m);
      }

      // Early stopping check
      if (epoch % 100 === 0) {
        const avgLoss = totalLoss / m;
        if (avgLoss < 0.001) break; // Convergence threshold
      }
    }

    return { weights, biases: new Map([['bias', bias]]) };
  }

  // Train classification model (Logistic Regression)
  async trainClassificationModel(trainSet, normalizers) {
    const features = trainSet[0].features;
    const featureNames = Object.keys(features);
    const m = trainSet.length;

    // Get unique classes
    const classes = [...new Set(trainSet.map((s) => s.target))];
    const numClasses = classes.length;

    // For binary classification
    if (numClasses === 2) {
      return this.trainBinaryClassifier(trainSet, normalizers, featureNames);
    }

    // For multiclass classification (One-vs-Rest)
    const classifierWeights = new Map();
    const classifierBiases = new Map();

    for (const targetClass of classes) {
      // Create binary dataset for this class
      const binaryTrainSet = trainSet.map((sample) => ({
        ...sample,
        target: sample.target === targetClass ? 1 : 0,
      }));

      const { weights, biases } = await this.trainBinaryClassifier(
        binaryTrainSet,
        normalizers,
        featureNames
      );
      classifierWeights.set(targetClass, weights);
      classifierBiases.set(targetClass, biases);
    }

    return { weights: classifierWeights, biases: classifierBiases };
  }

  // Train binary classifier
  async trainBinaryClassifier(trainSet, normalizers, featureNames) {
    const weights = new Map();
    featureNames.forEach((name) => weights.set(name, Math.random() * 0.01));
    let bias = 0;

    const learningRate = 0.01;
    const epochs = 1000;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradients = new Map();
      let biasGradient = 0;
      featureNames.forEach((name) => gradients.set(name, 0));

      for (const sample of trainSet) {
        const normalizedFeatures = this.normalizeFeatures(sample.features, normalizers);

        // Prediction (sigmoid)
        let z = bias;
        for (const [featureName, value] of Object.entries(normalizedFeatures)) {
          z += weights.get(featureName) * value;
        }
        const prediction = 1 / (1 + Math.exp(-z));

        // Gradient calculation
        const error = prediction - sample.target;
        biasGradient += error;

        for (const [featureName, value] of Object.entries(normalizedFeatures)) {
          gradients.set(featureName, gradients.get(featureName) + error * value);
        }
      }

      // Update weights
      bias -= (learningRate * biasGradient) / trainSet.length;
      for (const featureName of featureNames) {
        const currentWeight = weights.get(featureName);
        weights.set(
          featureName,
          currentWeight - (learningRate * gradients.get(featureName)) / trainSet.length
        );
      }
    }

    return { weights, biases: new Map([['bias', bias]]) };
  }

  // Train time series model (Moving Average + Trend)
  async trainTimeSeriesModel(trainSet, normalizers) {
    // Simplified time series model using moving averages
    const windowSizes = [3, 5, 10, 20];
    const weights = new Map();
    const biases = new Map();

    // Calculate weights for different window sizes
    let totalError = 0;
    let sampleCount = 0;

    for (const windowSize of windowSizes) {
      let windowError = 0;
      let windowSamples = 0;

      for (let i = windowSize; i < trainSet.length; i++) {
        const historicalValues = trainSet.slice(i - windowSize, i).map((s) => s.target);
        const movingAverage = historicalValues.reduce((a, b) => a + b, 0) / windowSize;

        const actualValue = trainSet[i].target;
        const error = Math.abs(actualValue - movingAverage);

        windowError += error;
        windowSamples++;
      }

      const avgError = windowSamples > 0 ? windowError / windowSamples : Infinity;
      weights.set(`window_${windowSize}`, 1 / (1 + avgError));

      totalError += windowError;
      sampleCount += windowSamples;
    }

    // Normalize weights
    const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    for (const [key, weight] of weights) {
      weights.set(key, weight / totalWeight);
    }

    biases.set('trend_factor', 0.1); // Simple trend factor

    return { weights, biases };
  }

  // Validate model accuracy
  async validateModel(modelKey, validationSet) {
    const model = this.predictionModels.get(modelKey);
    if (!validationSet || validationSet.length === 0) return 0;

    let correctPredictions = 0;
    let totalError = 0;

    for (const sample of validationSet) {
      const prediction = await this.makeSinglePrediction(modelKey, sample.features);

      if (model.type === 'classification') {
        // For classification, check if prediction matches target
        if (prediction.value === sample.target) {
          correctPredictions++;
        }
      } else {
        // For regression, calculate mean absolute error
        const error = Math.abs(prediction.value - sample.target);
        totalError += error;
      }
    }

    if (model.type === 'classification') {
      return correctPredictions / validationSet.length;
    } else {
      // Convert MAE to accuracy score (inverse relationship)
      const mae = totalError / validationSet.length;
      return Math.max(0, 1 - mae / 100); // Normalize to 0-1 range
    }
  }

  // Make single prediction
  async makeSinglePrediction(modelKey, features) {
    const model = this.predictionModels.get(modelKey);

    if (!model.isReady) {
      throw new Error(`Model ${modelKey} is not ready for predictions`);
    }

    try {
      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features, model.normalizers);

      // Make prediction based on model type
      let prediction;
      switch (model.type) {
        case 'regression':
          prediction = await this.predictRegression(model, normalizedFeatures);
          break;
        case 'classification':
          prediction = await this.predictClassification(model, normalizedFeatures);
          break;
        case 'time_series':
          prediction = await this.predictTimeSeries(model, normalizedFeatures, features);
          break;
        default:
          throw new Error(`Unknown model type: ${model.type}`);
      }

      return {
        value: prediction.value,
        confidence: prediction.confidence || 0.5,
        modelKey,
        timestamp: Date.now(),
        features: Object.keys(features),
      };
    } catch (error) {
      console.error(`Error making prediction with ${modelKey}:`, error);
      throw error;
    }
  }

  // Predict using regression model
  async predictRegression(model, normalizedFeatures) {
    let prediction = model.biases.get('bias') || 0;

    for (const [featureName, value] of Object.entries(normalizedFeatures)) {
      const weight = model.weights.get(featureName) || 0;
      prediction += weight * value;
    }

    // Calculate confidence based on feature importance and model accuracy
    const confidence = Math.min(0.95, model.accuracy * 0.8 + 0.2);

    return {
      value: prediction,
      confidence,
    };
  }

  // Predict using classification model
  async predictClassification(model, normalizedFeatures) {
    if (model.weights instanceof Map && model.weights.size > 1) {
      // Multiclass classification
      const classScores = new Map();

      for (const [className, classWeights] of model.weights) {
        let score = model.biases.get(className)?.get('bias') || 0;

        for (const [featureName, value] of Object.entries(normalizedFeatures)) {
          const weight = classWeights.get(featureName) || 0;
          score += weight * value;
        }

        // Apply sigmoid for probability
        const probability = 1 / (1 + Math.exp(-score));
        classScores.set(className, probability);
      }

      // Find class with highest probability
      const bestClass = Array.from(classScores.entries()).reduce((a, b) => (a[1] > b[1] ? a : b));

      return {
        value: bestClass[0],
        confidence: bestClass[1],
        probabilities: Object.fromEntries(classScores),
      };
    } else {
      // Binary classification
      let score = model.biases.get('bias') || 0;

      for (const [featureName, value] of Object.entries(normalizedFeatures)) {
        const weight = model.weights.get(featureName) || 0;
        score += weight * value;
      }

      const probability = 1 / (1 + Math.exp(-score));

      return {
        value: probability > 0.5 ? 1 : 0,
        confidence: Math.abs(probability - 0.5) * 2, // Convert to 0-1 range
        probability,
      };
    }
  }

  // Predict using time series model
  async predictTimeSeries(model, normalizedFeatures, originalFeatures) {
    let prediction = 0;
    let totalWeight = 0;

    // Use weighted moving averages
    for (const [weightKey, weight] of model.weights) {
      if (weightKey.startsWith('window_')) {
        const windowSize = parseInt(weightKey.split('_')[1]);

        // For simplicity, use current value as base
        // In production, you'd use actual historical data
        const currentValue = originalFeatures.historicalGMP || originalFeatures.currentValue || 0;
        prediction += weight * currentValue;
        totalWeight += weight;
      }
    }

    // Apply trend factor
    const trendFactor = model.biases.get('trend_factor') || 0;
    prediction *= 1 + trendFactor;

    const confidence = Math.min(0.9, model.accuracy * 0.7 + 0.3);

    return {
      value: prediction,
      confidence,
    };
  }

  // Start prediction workflows
  startPredictionWorkflows() {
    // Real-time prediction updates
    const predictionInterval = setInterval(async () => {
      await this.updateRealTimePredictions();
    }, this.predictionConfig.UPDATE_INTERVAL);

    this.activeIntervals.set('PREDICTIONS', predictionInterval);

    console.log('🔮 Started prediction workflows');
  }

  // Update real-time predictions
  async updateRealTimePredictions() {
    try {
      // Get active IPOs that need predictions
      const activeIPOs = await prisma.iPO.findMany({
        where: {
          isActive: true,
          status: { in: ['upcoming', 'open', 'closed'] },
        },
        include: {
          gmp: { orderBy: { timestamp: 'desc' }, take: 20 },
          subscription: { orderBy: { timestamp: 'desc' }, take: 20 },
          analytics: true,
        },
      });

      let predictionsUpdated = 0;

      for (const ipo of activeIPOs) {
        try {
          // Update predictions for each model
          for (const [modelKey, model] of this.predictionModels) {
            if (model.isReady && model.enabled) {
              await this.updateIPOPrediction(modelKey, ipo);
              predictionsUpdated++;
            }
          }
        } catch (error) {
          console.error(`Error updating predictions for IPO ${ipo.symbol}:`, error);
        }
      }

      console.log(`🔮 Updated ${predictionsUpdated} predictions for ${activeIPOs.length} IPOs`);
    } catch (error) {
      console.error('Error updating real-time predictions:', error);
    }
  }

  // Update prediction for specific IPO and model
  async updateIPOPrediction(modelKey, ipo) {
    try {
      // Check cache first
      const cacheKey = `prediction:${modelKey}:${ipo.id}`;
      const cached = this.predictionCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTTL[modelKey]) {
        return cached.prediction;
      }

      // Extract features for current IPO
      const features = await this.extractFeatures(modelKey, ipo);
      if (!features) return null;

      // Make prediction
      const prediction = await this.makeSinglePrediction(modelKey, features);

      // Cache prediction
      this.predictionCache.set(cacheKey, {
        prediction,
        timestamp: Date.now(),
      });

      // Store prediction in database
      await this.storePrediction(ipo.id, modelKey, prediction);

      // Broadcast prediction update
      await this.broadcastPredictionUpdate(ipo, modelKey, prediction);

      return prediction;
    } catch (error) {
      console.error(`Error updating prediction for ${modelKey}:`, error);
      return null;
    }
  }

  // Store prediction in database
  async storePrediction(ipoId, modelKey, prediction) {
    try {
      await prisma.prediction.upsert({
        where: {
          ipoId_modelType: {
            ipoId,
            modelType: modelKey,
          },
        },
        update: {
          predictedValue: prediction.value,
          confidence: prediction.confidence,
          features: JSON.stringify(prediction.features),
          updatedAt: new Date(),
        },
        create: {
          ipoId,
          modelType: modelKey,
          predictedValue: prediction.value,
          confidence: prediction.confidence,
          features: JSON.stringify(prediction.features),
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error storing prediction:', error);
    }
  }

  // Broadcast prediction update via WebSocket
  async broadcastPredictionUpdate(ipo, modelKey, prediction) {
    try {
      const updateData = {
        ipoId: ipo.id,
        symbol: ipo.symbol,
        modelType: modelKey,
        prediction: prediction.value,
        confidence: prediction.confidence,
        timestamp: Date.now(),
        features: prediction.features,
      };

      await webSocketService.broadcastAnalyticsUpdate(ipo.id, {
        predictions: { [modelKey]: updateData },
        type: 'prediction_update',
      });
    } catch (error) {
      console.error('Error broadcasting prediction update:', error);
    }
  }

  // Public API methods
  async predictListingGain(ipoId) {
    return await this.getPrediction(ipoId, 'LISTING_GAIN');
  }

  async predictAllotmentProbability(userId, ipoId, applicationData) {
    const features = {
      ...applicationData,
      userHistory: await this.getUserHistory(userId),
      applicationTime: Date.now(),
    };

    return await this.makeSinglePrediction('ALLOTMENT_PROBABILITY', features);
  }

  async predictSubscriptionTrend(ipoId) {
    return await this.getPrediction(ipoId, 'SUBSCRIPTION_TREND');
  }

  async predictGMPPrice(ipoId, horizon = 1) {
    return await this.getPrediction(ipoId, 'GMP_PREDICTION');
  }

  async predictMarketSentiment(ipoId) {
    return await this.getPrediction(ipoId, 'MARKET_SENTIMENT');
  }

  async predictIPOSuccess(ipoId) {
    return await this.getPrediction(ipoId, 'IPO_SUCCESS');
  }

  // Get ensemble prediction combining multiple models
  async getEnsemblePrediction(ipoId, predictionType) {
    try {
      const relevantModels = this.getRelevantModels(predictionType);
      const predictions = [];
      let totalWeight = 0;

      for (const modelKey of relevantModels) {
        try {
          const prediction = await this.getPrediction(ipoId, modelKey);
          if (prediction && prediction.confidence > this.predictionConfig.CONFIDENCE_THRESHOLD) {
            const weight = this.ensembleWeights.get(modelKey) * prediction.confidence;
            predictions.push({ prediction, weight });
            totalWeight += weight;
          }
        } catch (error) {
          console.warn(`Model ${modelKey} failed:`, error.message);
        }
      }

      if (predictions.length === 0) {
        throw new Error('No valid predictions available');
      }

      // Calculate weighted average
      let ensembleValue = 0;
      let ensembleConfidence = 0;

      for (const { prediction, weight } of predictions) {
        const normalizedWeight = weight / totalWeight;
        ensembleValue += prediction.value * normalizedWeight;
        ensembleConfidence += prediction.confidence * normalizedWeight;
      }

      return {
        value: ensembleValue,
        confidence: ensembleConfidence,
        modelCount: predictions.length,
        models: predictions.map((p) => p.prediction.modelKey),
        ensemble: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error getting ensemble prediction:', error);
      throw error;
    }
  }

  // Get prediction from cache or generate new one
  async getPrediction(ipoId, modelKey) {
    try {
      const cacheKey = `prediction:${modelKey}:${ipoId}`;
      const cached = this.predictionCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTTL[modelKey]) {
        return cached.prediction;
      }

      // Get IPO data
      const ipo = await prisma.iPO.findUnique({
        where: { id: ipoId },
        include: {
          gmp: { orderBy: { timestamp: 'desc' }, take: 20 },
          subscription: { orderBy: { timestamp: 'desc' }, take: 20 },
          analytics: true,
        },
      });

      if (!ipo) {
        throw new Error(`IPO not found: ${ipoId}`);
      }

      return await this.updateIPOPrediction(modelKey, ipo);
    } catch (error) {
      console.error(`Error getting prediction for ${modelKey}:`, error);
      throw error;
    }
  }

  // Helper methods
  calculateNormalizers(trainSet) {
    const normalizers = new Map();
    const featureNames = Object.keys(trainSet[0].features);

    for (const featureName of featureNames) {
      const values = trainSet
        .map((sample) => sample.features[featureName])
        .filter((v) => v !== null && v !== undefined);

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(
          values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
        );

        normalizers.set(featureName, { min, max, mean, std });
      }
    }

    return normalizers;
  }

  normalizeFeatures(features, normalizers) {
    const normalized = {};

    for (const [featureName, value] of Object.entries(features)) {
      const norm = normalizers.get(featureName);
      if (norm && value !== null && value !== undefined) {
        // Z-score normalization
        normalized[featureName] = norm.std > 0 ? (value - norm.mean) / norm.std : 0;
      } else {
        normalized[featureName] = 0;
      }
    }

    return normalized;
  }

  extractBasicFeature(featureName, ipo) {
    switch (featureName) {
      case 'lotSize':
        return ipo.lotSize || 0;
      case 'faceValue':
        return ipo.faceValue || 0;
      case 'minPrice':
        return ipo.minPrice || 0;
      case 'maxPrice':
        return ipo.maxPrice || 0;
      default:
        return 0;
    }
  }

  // Target extraction methods
  calculateListingGain(ipo) {
    if (!ipo.listingPrice || !ipo.maxPrice) return null;
    return ((ipo.listingPrice - ipo.maxPrice) / ipo.maxPrice) * 100;
  }

  getAllotmentStatus(ipo) {
    // This would come from actual allotment data
    return Math.random() > 0.3 ? 'allotted' : 'not_allotted';
  }

  getFinalSubscriptionRatio(ipo) {
    const finalSub =
      ipo.subscription?.find((s) => s.category === 'OVERALL') || ipo.subscription?.[0];
    return finalSub?.subscriptionRatio || 0;
  }

  getNextGMPValue(ipo) {
    const gmpValues = ipo.gmp?.map((g) => g.value) || [];
    return gmpValues.length > 0 ? gmpValues[0] : 0;
  }

  getSentimentScore(ipo) {
    // Mock sentiment - in production, analyze news/social media
    return Math.random() * 2 - 1; // -1 to 1
  }

  getIPOSuccessCategory(ipo) {
    const gain = this.calculateListingGain(ipo);
    if (gain === null) return 'unknown';
    if (gain > 20) return 'highly_successful';
    if (gain > 0) return 'successful';
    return 'unsuccessful';
  }

  validateTrainingData(trainingSet, model) {
    return trainingSet.filter((sample) => {
      // Remove samples with missing critical features
      const features = sample.features;
      const requiredFeatures = model.features.slice(0, 5); // Top 5 critical features

      return requiredFeatures.every(
        (feature) =>
          features[feature] !== null && features[feature] !== undefined && !isNaN(features[feature])
      );
    });
  }

  getRelevantModels(predictionType) {
    const modelGroups = {
      listing_performance: ['LISTING_GAIN', 'GMP_PREDICTION', 'MARKET_SENTIMENT'],
      subscription_analysis: ['SUBSCRIPTION_TREND', 'MARKET_SENTIMENT'],
      allotment_chances: ['ALLOTMENT_PROBABILITY', 'SUBSCRIPTION_TREND'],
      overall_success: ['IPO_SUCCESS', 'LISTING_GAIN', 'MARKET_SENTIMENT'],
    };

    return modelGroups[predictionType] || [predictionType];
  }

  async getUserHistory(userId) {
    try {
      const applications = await prisma.userApplication.findMany({
        where: { userId },
        include: { ipo: true },
      });

      return {
        totalApplications: applications.length,
        allottedCount: applications.filter((a) => a.allotmentStatus === 'allotted').length,
        averageAmount:
          applications.reduce((sum, a) => sum + (a.amount || 0), 0) / applications.length,
        recentActivity:
          applications.length > 0
            ? Date.now() - new Date(applications[0].submittedAt).getTime()
            : 0,
      };
    } catch (error) {
      return {
        totalApplications: 0,
        allottedCount: 0,
        averageAmount: 0,
        recentActivity: 0,
      };
    }
  }

  updateEnsembleWeight(modelKey, accuracy) {
    const currentWeight = this.ensembleWeights.get(modelKey);
    const newWeight = currentWeight * 0.7 + accuracy * 0.3; // Weighted update
    this.ensembleWeights.set(modelKey, newWeight);

    // Normalize weights
    const totalWeight = Array.from(this.ensembleWeights.values()).reduce((a, b) => a + b, 0);
    for (const [key, weight] of this.ensembleWeights) {
      this.ensembleWeights.set(key, weight / totalWeight);
    }
  }

  // Model persistence
  async saveModel(modelKey, model) {
    try {
      const modelData = {
        modelKey,
        weights: Object.fromEntries(model.weights),
        biases: Object.fromEntries(model.biases),
        normalizers: Object.fromEntries(model.normalizers),
        accuracy: model.accuracy,
        sampleCount: model.sampleCount,
        lastTrained: model.lastTrained,
      };

      await cache.set(
        cache.key('MODEL', `saved:${modelKey}`),
        modelData,
        7 * 24 * 60 * 60 // 7 days
      );
    } catch (error) {
      console.error(`Error saving model ${modelKey}:`, error);
    }
  }

  async loadSavedModel(modelKey) {
    try {
      const modelData = await cache.get(cache.key('MODEL', `saved:${modelKey}`));

      if (modelData) {
        return {
          weights: new Map(Object.entries(modelData.weights)),
          biases: new Map(Object.entries(modelData.biases)),
          normalizers: new Map(Object.entries(modelData.normalizers)),
          accuracy: modelData.accuracy,
          sampleCount: modelData.sampleCount,
          lastTrained: new Date(modelData.lastTrained),
        };
      }

      return null;
    } catch (error) {
      console.error(`Error loading model ${modelKey}:`, error);
      return null;
    }
  }

  // Model training scheduler
  startModelTraining() {
    const trainingInterval = setInterval(async () => {
      await this.scheduledModelTraining();
    }, this.predictionConfig.TRAINING_INTERVAL);

    this.activeIntervals.set('TRAINING', trainingInterval);

    console.log('🎯 Started model training scheduler');
  }

  async scheduledModelTraining() {
    try {
      console.log('🔄 Running scheduled model training...');

      // Reload training data
      await this.loadTrainingData();

      // Train models that need updates
      for (const [modelKey, model] of this.predictionModels) {
        if (model.enabled && this.shouldRetrainModel(model)) {
          await this.trainModel(modelKey);
        }
      }

      this.performance.totalTrainingSessions++;
    } catch (error) {
      console.error('Error in scheduled model training:', error);
    }
  }

  shouldRetrainModel(model) {
    if (!model.lastTrained) return true;

    const daysSinceTraining = (Date.now() - model.lastTrained.getTime()) / (1000 * 60 * 60 * 24);
    const trainingDataSize = this.trainingData.get(model.name)?.length || 0;

    // Retrain if:
    // - Model hasn't been trained in 7 days
    // - Training data has grown significantly
    // - Model accuracy is below threshold
    return (
      daysSinceTraining > 7 || trainingDataSize > model.sampleCount * 1.2 || model.accuracy < 0.6
    );
  }

  // Accuracy monitoring
  startAccuracyMonitoring() {
    const accuracyInterval = setInterval(async () => {
      await this.checkPredictionAccuracy();
    }, this.predictionConfig.ACCURACY_CHECK_INTERVAL);

    this.activeIntervals.set('ACCURACY_CHECK', accuracyInterval);

    console.log('📊 Started accuracy monitoring');
  }

  async checkPredictionAccuracy() {
    try {
      console.log('📊 Checking prediction accuracy...');

      // Get recent predictions with actual outcomes
      const recentPredictions = await prisma.prediction.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        include: {
          ipo: {
            select: { listingPrice: true, maxPrice: true, status: true },
          },
        },
      });

      const accuracyByModel = new Map();

      for (const prediction of recentPredictions) {
        if (prediction.ipo.status === 'listed' && prediction.ipo.listingPrice) {
          const actualGain = this.calculateListingGain(prediction.ipo);

          if (actualGain !== null) {
            const error = Math.abs(prediction.predictedValue - actualGain);
            const accuracy = Math.max(0, 1 - error / 100); // Convert to 0-1 range

            if (!accuracyByModel.has(prediction.modelType)) {
              accuracyByModel.set(prediction.modelType, []);
            }
            accuracyByModel.get(prediction.modelType).push(accuracy);
          }
        }
      }

      // Update model accuracies
      for (const [modelKey, accuracies] of accuracyByModel) {
        const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
        const model = this.predictionModels.get(modelKey);
        if (model) {
          model.accuracy = avgAccuracy;
          this.updateEnsembleWeight(modelKey, avgAccuracy);
        }
      }

      this.performance.lastAccuracyCheck = Date.now();
    } catch (error) {
      console.error('Error checking prediction accuracy:', error);
    }
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    const performanceInterval = setInterval(
      () => {
        this.logPerformanceMetrics();
      },
      5 * 60 * 1000
    ); // Every 5 minutes

    this.activeIntervals.set('PERFORMANCE', performanceInterval);

    console.log('📊 Started prediction performance monitoring');
  }

  updateTrainingMetrics(trainingTime) {
    this.performance.averageTrainingTime =
      (this.performance.averageTrainingTime * this.performance.totalTrainingSessions +
        trainingTime) /
      (this.performance.totalTrainingSessions + 1);
  }

  logPerformanceMetrics() {
    const metrics = this.getPerformanceMetrics();
    console.log('📊 Prediction Service Performance:', metrics);

    // Store metrics in cache
    cache.set('prediction_service_metrics', metrics, 300);
  }

  getPerformanceMetrics() {
    const overallAccuracy = this.getOverallAccuracy();
    const modelStatus = {};

    for (const [modelKey, model] of this.predictionModels) {
      modelStatus[modelKey] = {
        accuracy: model.accuracy,
        isReady: model.isReady,
        sampleCount: model.sampleCount,
        lastTrained: model.lastTrained?.toISOString(),
      };
    }

    return {
      totalPredictions: this.performance.totalPredictions,
      overallAccuracy: `${(overallAccuracy * 100).toFixed(2)}%`,
      totalTrainingSessions: this.performance.totalTrainingSessions,
      averageTrainingTime: Math.round(this.performance.averageTrainingTime),
      modelUpdates: this.performance.modelUpdates,
      activePredictions: this.predictionCache.size,
      modelStatus,
      lastAccuracyCheck: this.performance.lastAccuracyCheck
        ? new Date(this.performance.lastAccuracyCheck).toISOString()
        : null,
    };
  }

  getOverallAccuracy() {
    const accuracies = Array.from(this.predictionModels.values())
      .filter((model) => model.isReady)
      .map((model) => model.accuracy);

    return accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0;
  }

  // Maintenance tasks
  startMaintenanceTasks() {
    const maintenanceInterval = setInterval(
      () => {
        this.performMaintenance();
      },
      60 * 60 * 1000
    ); // Every hour

    this.activeIntervals.set('MAINTENANCE', maintenanceInterval);

    console.log('🧹 Started prediction service maintenance tasks');
  }

  performMaintenance() {
    const now = Date.now();

    // Clean up old cached predictions
    for (const [cacheKey, data] of this.predictionCache) {
      const modelKey = cacheKey.split(':')[1];
      const ttl = this.cacheTTL[modelKey] || 30 * 60 * 1000;

      if (now - data.timestamp > ttl * 2) {
        // Keep for 2x TTL
        this.predictionCache.delete(cacheKey);
      }
    }

    // Clean up old model training history
    for (const model of this.predictionModels.values()) {
      if (model.trainingHistory.length > 100) {
        model.trainingHistory = model.trainingHistory.slice(-50); // Keep last 50
      }
    }

    console.log('🧹 Prediction service maintenance completed');
  }

  // Service status and health check
  getStatus() {
    return {
      isRunning: this.isRunning,
      models: Object.keys(this.models).length,
      readyModels: Array.from(this.predictionModels.values()).filter((m) => m.isReady).length,
      performance: this.getPerformanceMetrics(),
      activePredictions: this.predictionCache.size,
      ensembleWeights: Object.fromEntries(this.ensembleWeights),
      activeIntervals: this.activeIntervals.size,
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheck() {
    try {
      // Check model readiness
      const readyModels = Array.from(this.predictionModels.values()).filter(
        (m) => m.isReady
      ).length;
      const totalModels = this.predictionModels.size;

      // Check database connectivity
      const dbCheck = await prisma.prediction.findFirst();

      // Check cache connectivity
      const cacheCheck = await cache.healthCheck();

      const isHealthy =
        this.isRunning &&
        readyModels > 0 &&
        dbCheck !== undefined &&
        cacheCheck.status === 'healthy';

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        isRunning: this.isRunning,
        database: dbCheck !== undefined ? 'connected' : 'disconnected',
        cache: cacheCheck.status,
        models: {
          total: totalModels,
          ready: readyModels,
          readiness: `${readyModels}/${totalModels}`,
        },
        performance: this.getPerformanceMetrics(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Stop service gracefully
  async stop() {
    console.log('🛑 Stopping Prediction Service...');

    this.isRunning = false;

    // Clear all active intervals
    for (const [name, intervalId] of this.activeIntervals) {
      clearInterval(intervalId);
      console.log(`⏹️  Stopped ${name} interval`);
    }

    this.activeIntervals.clear();

    // Save all models
    for (const [modelKey, model] of this.predictionModels) {
      try {
        if (model.isReady) {
          await this.saveModel(modelKey, model);
        }
      } catch (error) {
        console.error(`Error saving model ${modelKey}:`, error);
      }
    }

    // Broadcast shutdown notification
    try {
      await webSocketService.broadcastSystemStatus(
        {
          type: 'prediction_service_shutdown',
          message: 'Prediction service has been stopped',
          finalMetrics: this.getPerformanceMetrics(),
          timestamp: Date.now(),
        },
        { priority: 'high' }
      );
    } catch (error) {
      console.error('Error broadcasting shutdown:', error);
    }

    // Clear data structures
    this.predictionModels.clear();
    this.trainingData.clear();
    this.modelAccuracy.clear();
    this.activePredictions.clear();
    this.predictionCache.clear();
    this.featureProcessors.clear();
    this.ensembleWeights.clear();

    console.log('✅ Prediction Service stopped gracefully');
    console.log('📊 Final Performance Metrics:', this.getPerformanceMetrics());
  }
}

// Export singleton instance
export const predictionService = new PredictionService();

// Auto-start if not in test environment
if (process.env.NODE_ENV !== 'test' && process.env.AUTO_START_PREDICTION_SERVICE !== 'false') {
  predictionService.start().catch((error) => {
    console.error('Failed to auto-start Prediction Service:', error);
    process.exit(1);
  });
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Received ${signal}, shutting down Prediction Service gracefully...`);
  try {
    await predictionService.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Export additional utilities
export const {
  predictListingGain,
  predictAllotmentProbability,
  predictSubscriptionTrend,
  predictGMPPrice,
  predictMarketSentiment,
  predictIPOSuccess,
  getEnsemblePrediction,
} = predictionService;

export default predictionService;
