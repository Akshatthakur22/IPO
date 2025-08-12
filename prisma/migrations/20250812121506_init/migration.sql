-- CreateTable
CREATE TABLE "ipos" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT NOT NULL,
    "sector" TEXT,
    "industry" TEXT,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION,
    "listingPrice" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,
    "issueSize" BIGINT NOT NULL,
    "lotSize" INTEGER NOT NULL,
    "marketLot" INTEGER NOT NULL,
    "openDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "listingDate" TIMESTAMP(3),
    "allotmentDate" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "leadManager" TEXT,
    "registrar" TEXT,
    "faceValue" DOUBLE PRECISION,
    "bookValue" DOUBLE PRECISION,
    "marketCap" BIGINT,
    "peRatio" DOUBLE PRECISION,
    "roe" DOUBLE PRECISION,
    "reservationDetails" TEXT,
    "aboutCompany" TEXT,
    "objectives" TEXT,
    "risks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmp_data" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER,
    "bidPrice" DOUBLE PRECISION,
    "askPrice" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmp_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_data" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "quantity" BIGINT NOT NULL,
    "bidCount" INTEGER NOT NULL,
    "subscriptionRatio" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allotment_data" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "applicationNumber" TEXT,
    "category" TEXT NOT NULL,
    "appliedQuantity" INTEGER NOT NULL,
    "allottedQuantity" INTEGER NOT NULL DEFAULT 0,
    "allottedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allotmentStatus" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allotment_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "pan" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycCompleted" BOOLEAN NOT NULL DEFAULT false,
    "preferences" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT,
    "symbol" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "avgGMP" DOUBLE PRECISION,
    "maxGMP" DOUBLE PRECISION,
    "minGMP" DOUBLE PRECISION,
    "gmpVolume" INTEGER,
    "gmpTrend" TEXT,
    "overallSubscription" DOUBLE PRECISION,
    "retailSubscription" DOUBLE PRECISION,
    "qibSubscription" DOUBLE PRECISION,
    "hniSubscription" DOUBLE PRECISION,
    "marketSentiment" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "listingGain" DOUBLE PRECISION,
    "currentReturn" DOUBLE PRECISION,
    "volatilityIndex" DOUBLE PRECISION,
    "totalGMPChanges" INTEGER NOT NULL DEFAULT 0,
    "totalSubscriptions" INTEGER NOT NULL DEFAULT 0,
    "oversubscribedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_watchlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "notes" TEXT,
    "alertPreferences" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT,
    "symbol" TEXT,
    "alertType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerValue" DOUBLE PRECISION,
    "triggerCondition" TEXT,
    "message" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "errorMessage" TEXT,
    "requestData" TEXT,
    "responseData" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_status" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL,
    "openTime" TIMESTAMP(3),
    "closeTime" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "holidays" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ipos_symbol_key" ON "ipos"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_watchlists_userId_ipoId_key" ON "user_watchlists"("userId", "ipoId");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "market_status_exchange_key" ON "market_status"("exchange");

-- AddForeignKey
ALTER TABLE "gmp_data" ADD CONSTRAINT "gmp_data_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_data" ADD CONSTRAINT "subscription_data_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allotment_data" ADD CONSTRAINT "allotment_data_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watchlists" ADD CONSTRAINT "user_watchlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watchlists" ADD CONSTRAINT "user_watchlists_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_alerts" ADD CONSTRAINT "user_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_alerts" ADD CONSTRAINT "user_alerts_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
