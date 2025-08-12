import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  // Clear existing data in correct order (respecting foreign keys)
  console.log('🗑️  Clearing existing data...');
  await prisma.userAlert.deleteMany();
  await prisma.userWatchlist.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.apiLog.deleteMany();
  await prisma.systemConfig.deleteMany();
  await prisma.allotmentData.deleteMany();
  await prisma.subscriptionData.deleteMany();
  await prisma.gMP.deleteMany();
  await prisma.analytics.deleteMany();
  await prisma.iPO.deleteMany();
  await prisma.marketStatus.deleteMany();

  console.log('✅ Existing data cleared');

  // Create comprehensive sample IPOs
  const ipoData = [
    {
      symbol: 'TECHCORP',
      name: 'TechCorp Ltd',
      lotSize: 100,
      minPrice: 500,
      maxPrice: 550,
      issueSize: BigInt('1500000000'), // 1500 Cr
      marketLot: 100,
      status: 'listed',
      sector: 'Technology',
      openDate: new Date('2024-03-15'),
      closeDate: new Date('2024-03-17'),
      listingDate: new Date('2024-03-22'),
      allotmentDate: new Date('2024-03-19'),
      registrar: 'KFintech',
      isActive: true,
      gmpValues: [
        { value: 85, days: 7, volume: 1500 },
        { value: 92, days: 6, volume: 1800 },
        { value: 78, days: 5, volume: 1200 },
        { value: 105, days: 4, volume: 2100 },
        { value: 95, days: 3, volume: 1900 },
        { value: 88, days: 2, volume: 1600 },
        { value: 110, days: 1, volume: 2500 },
        { value: 98, days: 0, volume: 2200 },
      ],
      subscriptions: [
        {
          category: 'RETAIL',
          subCategory: 'IND',
          quantity: BigInt('50000'),
          bidCount: 5000,
          ratio: 2.5,
        },
        {
          category: 'QIB',
          subCategory: 'FII',
          quantity: BigInt('100000'),
          bidCount: 50,
          ratio: 3.2,
        },
        {
          category: 'QIB',
          subCategory: 'MF',
          quantity: BigInt('80000'),
          bidCount: 35,
          ratio: 2.8,
        },
        {
          category: 'HNI',
          subCategory: 'CO',
          quantity: BigInt('30000'),
          bidCount: 150,
          ratio: 1.8,
        },
        {
          category: 'HNI',
          subCategory: 'IND',
          quantity: BigInt('25000'),
          bidCount: 120,
          ratio: 1.5,
        },
      ],
    },
    {
      symbol: 'GREENENG',
      name: 'GreenEnergy Solutions',
      lotSize: 50,
      minPrice: 300,
      maxPrice: 350,
      issueSize: BigInt('800000000'), // 800 Cr
      marketLot: 50,
      status: 'closed',
      sector: 'Energy',
      openDate: new Date('2024-03-20'),
      closeDate: new Date('2024-03-22'),
      listingDate: new Date('2024-03-27'),
      allotmentDate: new Date('2024-03-24'),
      registrar: 'Link Intime',
      isActive: true,
      gmpValues: [
        { value: 45, days: 6, volume: 800 },
        { value: 52, days: 5, volume: 950 },
        { value: 38, days: 4, volume: 600 },
        { value: 60, days: 3, volume: 1200 },
        { value: 55, days: 2, volume: 1100 },
        { value: 48, days: 1, volume: 900 },
        { value: 65, days: 0, volume: 1400 },
      ],
      subscriptions: [
        {
          category: 'RETAIL',
          subCategory: 'IND',
          quantity: BigInt('25000'),
          bidCount: 2500,
          ratio: 4.1,
        },
        {
          category: 'QIB',
          subCategory: 'MF',
          quantity: BigInt('40000'),
          bidCount: 25,
          ratio: 2.8,
        },
        {
          category: 'HNI',
          subCategory: 'CO',
          quantity: BigInt('15000'),
          bidCount: 75,
          ratio: 1.2,
        },
      ],
    },
    {
      symbol: 'FINTECH',
      name: 'FinTech Innovations',
      lotSize: 200,
      minPrice: 800,
      maxPrice: 900,
      issueSize: BigInt('2000000000'), // 2000 Cr
      marketLot: 200,
      status: 'upcoming',
      sector: 'Financial Services',
      openDate: new Date('2024-04-10'),
      closeDate: new Date('2024-04-12'),
      listingDate: new Date('2024-04-17'),
      allotmentDate: new Date('2024-04-14'),
      registrar: 'Bigshare',
      isActive: true,
      gmpValues: [
        { value: 120, days: 10, volume: 2000 },
        { value: 135, days: 9, volume: 2300 },
        { value: 110, days: 8, volume: 1800 },
        { value: 140, days: 7, volume: 2500 },
        { value: 125, days: 6, volume: 2100 },
        { value: 150, days: 5, volume: 2800 },
        { value: 145, days: 4, volume: 2600 },
        { value: 130, days: 3, volume: 2200 },
      ],
      subscriptions: [],
    },
    {
      symbol: 'HEALTHTC',
      name: 'HealthTech Corp',
      lotSize: 75,
      minPrice: 600,
      maxPrice: 700,
      issueSize: BigInt('1200000000'), // 1200 Cr
      marketLot: 75,
      status: 'open',
      sector: 'Healthcare',
      openDate: new Date('2024-04-01'),
      closeDate: new Date('2024-04-03'),
      listingDate: null,
      allotmentDate: null,
      registrar: 'KFintech',
      isActive: true,
      gmpValues: [
        { value: 75, days: 5, volume: 1300 },
        { value: 82, days: 4, volume: 1500 },
        { value: 68, days: 3, volume: 1100 },
        { value: 90, days: 2, volume: 1700 },
        { value: 85, days: 1, volume: 1600 },
        { value: 78, days: 0, volume: 1400 },
      ],
      subscriptions: [
        {
          category: 'RETAIL',
          subCategory: 'IND',
          quantity: BigInt('35000'),
          bidCount: 3500,
          ratio: 1.9,
        },
        {
          category: 'QIB',
          subCategory: 'IC',
          quantity: BigInt('80000'),
          bidCount: 40,
          ratio: 2.6,
        },
        {
          category: 'HNI',
          subCategory: 'CO',
          quantity: BigInt('22000'),
          bidCount: 110,
          ratio: 1.4,
        },
      ],
    },
    {
      symbol: 'PHARMAPL',
      name: 'PharmaPro Limited',
      lotSize: 125,
      minPrice: 450,
      maxPrice: 500,
      issueSize: BigInt('950000000'), // 950 Cr
      marketLot: 125,
      status: 'listed',
      sector: 'Pharmaceuticals',
      openDate: new Date('2024-02-05'),
      closeDate: new Date('2024-02-07'),
      listingDate: new Date('2024-02-14'),
      allotmentDate: new Date('2024-02-10'),
      registrar: 'Link Intime',
      isActive: true,
      gmpValues: [
        { value: 42, days: 8, volume: 900 },
        { value: 55, days: 7, volume: 1100 },
        { value: 38, days: 6, volume: 800 },
        { value: 65, days: 5, volume: 1300 },
        { value: 58, days: 4, volume: 1200 },
        { value: 62, days: 3, volume: 1250 },
        { value: 48, days: 2, volume: 950 },
        { value: 70, days: 1, volume: 1400 },
      ],
      subscriptions: [
        {
          category: 'RETAIL',
          subCategory: 'IND',
          quantity: BigInt('28000'),
          bidCount: 2800,
          ratio: 1.7,
        },
        {
          category: 'QIB',
          subCategory: 'FII',
          quantity: BigInt('65000'),
          bidCount: 32,
          ratio: 2.1,
        },
        {
          category: 'QIB',
          subCategory: 'MF',
          quantity: BigInt('45000'),
          bidCount: 22,
          ratio: 1.8,
        },
        {
          category: 'HNI',
          subCategory: 'IND',
          quantity: BigInt('18000'),
          bidCount: 90,
          ratio: 1.1,
        },
      ],
    },
    {
      symbol: 'AUTOTECH',
      name: 'AutoTech Motors',
      lotSize: 80,
      minPrice: 750,
      maxPrice: 850,
      issueSize: BigInt('1800000000'), // 1800 Cr
      marketLot: 80,
      status: 'listed',
      sector: 'Automotive',
      openDate: new Date('2024-01-25'),
      closeDate: new Date('2024-01-27'),
      listingDate: new Date('2024-02-02'),
      allotmentDate: new Date('2024-01-30'),
      registrar: 'Bigshare',
      isActive: true,
      gmpValues: [
        { value: 95, days: 12, volume: 1800 },
        { value: 88, days: 11, volume: 1600 },
        { value: 102, days: 10, volume: 2000 },
        { value: 85, days: 9, volume: 1400 },
        { value: 115, days: 8, volume: 2300 },
        { value: 108, days: 7, volume: 2100 },
      ],
      subscriptions: [
        {
          category: 'RETAIL',
          subCategory: 'IND',
          quantity: BigInt('42000'),
          bidCount: 4200,
          ratio: 3.2,
        },
        {
          category: 'QIB',
          subCategory: 'IC',
          quantity: BigInt('95000'),
          bidCount: 48,
          ratio: 4.1,
        },
        {
          category: 'HNI',
          subCategory: 'CO',
          quantity: BigInt('38000'),
          bidCount: 190,
          ratio: 2.7,
        },
      ],
    },
  ];

  console.log('📊 Creating sample IPOs with comprehensive data...');

  for (const data of ipoData) {
    const { gmpValues, subscriptions, ...ipoInfo } = data;

    console.log(`  🏢 Creating IPO: ${ipoInfo.name}`);

    // Create IPO
    const ipo = await prisma.iPO.create({
      data: ipoInfo,
    });

    console.log(`    ✅ Created IPO: ${ipo.symbol} (${ipo.id})`);

    // Create GMP entries with different timestamps
    console.log(`    💰 Adding ${gmpValues.length} GMP entries...`);
    for (const gmp of gmpValues) {
      const timestamp = new Date(Date.now() - gmp.days * 24 * 60 * 60 * 1000);
      await prisma.gMP.create({
        data: {
          ipoId: ipo.id,
          value: gmp.value,
          percentage: parseFloat(((gmp.value / ipoInfo.maxPrice) * 100).toFixed(2)),
          source: 'market',
          volume: gmp.volume,
          timestamp,
        },
      });
    }

    // Create subscription data with different timestamps
    if (subscriptions.length > 0) {
      console.log(`    📊 Adding ${subscriptions.length} subscription entries...`);
      for (const sub of subscriptions) {
        await prisma.subscriptionData.create({
          data: {
            ipoId: ipo.id,
            category: sub.category,
            subCategory: sub.subCategory,
            quantity: sub.quantity,
            bidCount: sub.bidCount,
            subscriptionRatio: sub.ratio,
            timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    // Create sample allotments for listed IPOs
    if (ipo.status === 'listed') {
      console.log(`    🎯 Adding sample allotment data...`);
      const samplePANs = ['ABCDE1234F', 'FGHIJ5678K', 'KLMNO9012P', 'PQRST3456U', 'UVWXY7890Z'];

      for (let i = 0; i < Math.min(5, samplePANs.length); i++) {
        await prisma.allotmentData.create({
          data: {
            ipoId: ipo.id,
            pan: samplePANs[i],
            applicationNumber: `APP${ipo.symbol}${String(i + 1).padStart(6, '0')}`,
            category: i < 3 ? 'RETAIL' : 'QIB',
            appliedQuantity: Math.floor(Math.random() * 5 + 1) * ipo.lotSize,
            allottedQuantity: Math.floor(Math.random() * 5 + 1) * ipo.lotSize,
            allottedAmount: Math.floor(Math.random() * 5 + 1) * ipo.lotSize * ipo.maxPrice,
            allotmentStatus: 'ALLOTTED',
            timestamp: new Date(ipo.allotmentDate || Date.now()),
          },
        });
      }
    }

    // Calculate and create comprehensive analytics - FIXED VERSION
    console.log(`    📊 Calculating analytics...`);
    const analytics = calculateAnalytics(ipo, gmpValues, subscriptions);
    await prisma.analytics.create({
      data: {
        ipoId: ipo.id,
        symbol: ipo.symbol,
        date: new Date(),
        ...analytics,
      },
    });

    console.log(`    ✅ Completed IPO: ${ipo.symbol}\n`);
  }

  // Create sample users and watchlists
  console.log('👤 Creating sample users and data...');

  const users = [
    {
      email: 'demo@ipotracker.com',
      name: 'Demo User',
      role: 'user',
    },
    {
      email: 'investor@example.com',
      name: 'Active Investor',
      role: 'user',
    },
    {
      email: 'admin@ipotracker.com',
      name: 'Admin User',
      role: 'admin',
    },
  ];

  for (const userData of users) {
    const user = await prisma.user.create({
      data: userData,
    });

    // Add some IPOs to user's watchlist
    const allIPOs = await prisma.iPO.findMany({ take: 3 });
    for (const ipo of allIPOs) {
      await prisma.userWatchlist.create({
        data: {
          userId: user.id,
          ipoId: ipo.id,
          notes: `Watching ${ipo.name} for potential investment`,
        },
      });
    }

    // Create sample alerts
    await prisma.userAlert.create({
      data: {
        userId: user.id,
        alertType: 'gmp_change',
        triggerType: 'above',
        triggerValue: 50,
        message: `Alert when GMP goes above ₹50`,
        symbol: 'TECHCORP',
      },
    });

    console.log(`  ✅ Created user: ${user.name} with watchlist and alerts`);
  }

  // Create system config entries
  console.log('⚙️ Creating system configuration...');
  const configEntries = [
    {
      key: 'market_hours_start',
      value: '09:15',
      description: 'Market opening time',
      category: 'market_config',
    },
    {
      key: 'market_hours_end',
      value: '15:30',
      description: 'Market closing time',
      category: 'market_config',
    },
    {
      key: 'gmp_refresh_interval',
      value: '30',
      description: 'GMP data refresh interval in seconds',
      category: 'api_config',
    },
  ];

  for (const config of configEntries) {
    await prisma.systemConfig.create({
      data: config,
    });
  }

  // Create market status
  console.log('📊 Creating market status...');
  await prisma.marketStatus.create({
    data: {
      exchange: 'NSE',
      isOpen: true,
      openTime: new Date(),
      closeTime: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours from now
    },
  });

  await prisma.marketStatus.create({
    data: {
      exchange: 'BSE',
      isOpen: true,
      openTime: new Date(),
      closeTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`
📈 Summary:
   • ${ipoData.length} IPOs created with comprehensive data
   • ${users.length} users with watchlists and alerts
   • System configuration entries
   • Market status for NSE and BSE
   • GMP, subscription, and allotment data
   • Analytics and performance metrics
   
🚀 Your IPO platform is ready to use!
  `);
}

// ✅ FIXED Helper function to calculate analytics - ONLY uses valid schema fields
function calculateAnalytics(ipo, gmpValues, subscriptions) {
  const gmpVals = gmpValues.map((g) => g.value);

  // GMP Analytics
  const avgGMP = gmpVals.length > 0 ? gmpVals.reduce((a, b) => a + b, 0) / gmpVals.length : null;
  const maxGMP = gmpVals.length > 0 ? Math.max(...gmpVals) : null;
  const minGMP = gmpVals.length > 0 ? Math.min(...gmpVals) : null;

  // GMP Volatility (standard deviation) - Using volatilityIndex field
  let gmpVolatility = null;
  if (gmpVals.length > 1) {
    const variance =
      gmpVals.reduce((acc, val) => acc + Math.pow(val - avgGMP, 2), 0) / gmpVals.length;
    gmpVolatility = Math.sqrt(variance);
  }

  // Subscription Analytics
  const totalSubs = subscriptions.length;
  const oversubscribedCount = subscriptions.filter((s) => s.ratio > 1).length;

  // ✅ ONLY return fields that exist in your Prisma Analytics model
  return {
    // Basic fields that exist in schema
    totalGMPChanges: gmpValues.length,
    avgGMP: avgGMP ? parseFloat(avgGMP.toFixed(2)) : null,
    maxGMP: maxGMP ? parseFloat(maxGMP.toFixed(2)) : null,
    minGMP: minGMP ? parseFloat(minGMP.toFixed(2)) : null,

    // Use correct field names from schema
    volatilityIndex: gmpVolatility ? parseFloat(gmpVolatility.toFixed(2)) : null, // ✅ This exists
    totalSubscriptions: totalSubs,
    oversubscribedCount: oversubscribedCount,
    listingGain: avgGMP ? parseFloat((avgGMP * 0.8).toFixed(2)) : null, // ✅ This exists
    currentReturn: 0.0, // ✅ This exists
    gmpTrend: avgGMP > 50 ? 'bullish' : avgGMP < 0 ? 'bearish' : 'stable', // ✅ This exists
    gmpVolume: gmpValues.length > 0 ? gmpValues[0].volume : null, // ✅ This exists

    // Remove all the fields that DON'T exist in schema:
    // ❌ gmpVolatility - doesn't exist
    // ❌ overallSubscription - doesn't exist
    // ❌ retailSubscription - doesn't exist
    // ❌ qibSubscription - doesn't exist
    // ❌ hniSubscription - doesn't exist
    // ❌ predictedListingGain - doesn't exist
    // ❌ riskScore - doesn't exist
    // ❌ marketSentiment - doesn't exist
    // ❌ sentimentScore - doesn't exist
  };
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
