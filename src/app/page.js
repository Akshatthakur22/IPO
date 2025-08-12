'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import IPOCard from './components/IPOCard';
import SearchBar from './components/SearchBar';
import LiveGMPTracker from './components/LiveGMPTracker';
import AnalyticsChart from './components/AnalyticsChart';
import { formatCurrency } from '../utils/helpers';

const HomePage = () => {
  const [featuredIPOs, setFeaturedIPOs] = useState([]);
  const [marketStats, setMarketStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heroLoading, setHeroLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    try {
      const [iposRes, analyticsRes] = await Promise.allSettled([
        fetch('/api/ipos?status=open&limit=8&includeAnalytics=true'),
        fetch('/api/analytics?timeRange=7&metrics=all'),
      ]);

      if (iposRes.status === 'fulfilled') {
        const iposData = await iposRes.value.json();
        if (iposData.success) {
          setFeaturedIPOs(iposData.data);
        }
      }

      if (analyticsRes.status === 'fulfilled') {
        const analyticsData = await analyticsRes.value.json();
        if (analyticsData.success) {
          setMarketStats(analyticsData.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setHeroLoading(true);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleGetStarted = () => {
    router.push('/dashboard');
  };

  const Hero = () => (
    <section className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 text-white overflow-hidden">
      <div className="absolute inset-0 bg-black opacity-20"></div>
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Track IPOs Like a{' '}
            <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              Pro
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Get real-time GMP data, subscription status, allotment results, and market analytics for
            Indian stock market IPOs. All in one platform.
          </p>

          {/* Hero Search */}
          <div className="max-w-2xl mx-auto mb-8">
            <SearchBar
              placeholder="Search IPOs by name, symbol, or sector..."
              onSearch={handleSearch}
              size="large"
              className="shadow-2xl"
            />
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <button
              onClick={handleGetStarted}
              disabled={heroLoading}
              className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg disabled:opacity-50"
            >
              {heroLoading ? 'Loading...' : 'Get Started Free'}
            </button>
            <Link
              href="/ipos"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-colors"
            >
              Explore IPOs
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-2xl font-bold">{marketStats?.summary?.totalIPOs || '500+'}</div>
              <div className="text-blue-200 text-sm">IPOs Tracked</div>
            </div>
            <div>
              <div className="text-2xl font-bold">99.9%</div>
              <div className="text-blue-200 text-sm">Uptime</div>
            </div>
            <div>
              <div className="text-2xl font-bold">Real-time</div>
              <div className="text-blue-200 text-sm">Data Updates</div>
            </div>
            <div>
              <div className="text-2xl font-bold">24/7</div>
              <div className="text-blue-200 text-sm">Monitoring</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const FeaturesSection = () => (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything You Need to Track IPOs
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Comprehensive tools and real-time data to make informed IPO investment decisions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: '💰',
              title: 'Live GMP Tracking',
              description:
                'Real-time Grey Market Premium data with historical trends and predictions',
              color: 'bg-green-50 text-green-600',
            },
            {
              icon: '📊',
              title: 'Subscription Status',
              description: 'Category-wise subscription data with oversubscription analysis',
              color: 'bg-blue-50 text-blue-600',
            },
            {
              icon: '🎯',
              title: 'Allotment Checker',
              description: 'Check IPO allotment status with PAN number and get instant results',
              color: 'bg-purple-50 text-purple-600',
            },
            {
              icon: '📈',
              title: 'Market Analytics',
              description: 'Advanced analytics with ML-powered insights and market sentiment',
              color: 'bg-orange-50 text-orange-600',
            },
            {
              icon: '🔔',
              title: 'Smart Alerts',
              description:
                'Custom notifications for GMP changes, subscription milestones, and more',
              color: 'bg-red-50 text-red-600',
            },
            {
              icon: '📱',
              title: 'Mobile Ready',
              description: 'Responsive design with PWA support for on-the-go IPO tracking',
              color: 'bg-indigo-50 text-indigo-600',
            },
          ].map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow"
            >
              <div
                className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4`}
              >
                <span className="text-2xl">{feature.icon}</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const LiveDataSection = () => (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Live Market Data</h2>
          <p className="text-xl text-gray-600">Real-time updates from the IPO market</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Market Stats */}
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Overview</h3>
            {marketStats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {marketStats.summary?.activeIPOs || 0}
                  </div>
                  <div className="text-sm text-gray-600">Active IPOs</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    ₹{marketStats.summary?.avgGMP || 0}
                  </div>
                  <div className="text-sm text-gray-600">Avg GMP</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {marketStats.performance?.positive || 0}
                  </div>
                  <div className="text-sm text-gray-600">Positive Returns</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 capitalize">
                    {marketStats.summary?.marketSentiment || 'neutral'}
                  </div>
                  <div className="text-sm text-gray-600">Market Sentiment</div>
                </div>
              </div>
            ) : (
              <div className="animate-pulse space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-4">
                    <div className="h-16 bg-gray-200 rounded-lg"></div>
                    <div className="h-16 bg-gray-200 rounded-lg"></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live GMP */}
          <div>
            <LiveGMPTracker
              symbols={
                featuredIPOs && Array.isArray(featuredIPOs)
                  ? featuredIPOs.slice(0, 3).map((ipo) => ipo.symbol)
                  : []
              }
              compact={true}
              autoRefresh={true}
            />
          </div>
        </div>
      </div>
    </section>
  );
  const FeaturedIPOs = () => (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Featured IPOs</h2>
            <p className="text-xl text-gray-600">Currently open and upcoming IPO opportunities</p>
          </div>
          <Link
            href="/ipos"
            className="hidden md:flex items-center text-blue-600 hover:text-blue-700 font-medium"
          >
            View All IPOs
            <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg border p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : featuredIPOs.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredIPOs.slice(0, 4).map((ipo) => (
                <IPOCard key={ipo.id} ipo={ipo} compact={true} showAnalytics={true} />
              ))}
            </div>
            <div className="text-center mt-8 md:hidden">
              <Link
                href="/ipos"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                View All IPOs
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏢</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Active IPOs</h3>
            <p className="text-gray-600">Check back soon for new IPO opportunities</p>
          </div>
        )}
      </div>
    </section>
  );

  const CTASection = () => (
    <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
      <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Start Tracking IPOs?</h2>
        <p className="text-xl text-blue-100 mb-8">
          Join thousands of investors who trust our platform for real-time IPO insights
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <button
            onClick={handleGetStarted}
            className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg"
          >
            Start Free Dashboard
          </button>
          <Link
            href="/about"
            className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-colors"
          >
            Learn More
          </Link>
        </div>

        <div className="mt-12 text-blue-200 text-sm">
          No registration required • Free forever • Real-time data
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              IPO Tracker
            </Link>

            <div className="hidden md:flex items-center space-x-8">
              <Link href="/ipos" className="text-gray-700 hover:text-blue-600 font-medium">
                IPOs
              </Link>
              <Link href="/analytics" className="text-gray-700 hover:text-blue-600 font-medium">
                Analytics
              </Link>
              <Link href="/allotment" className="text-gray-700 hover:text-blue-600 font-medium">
                Allotment
              </Link>
              <Link href="/about" className="text-gray-700 hover:text-blue-600 font-medium">
                About
              </Link>
              <Link
                href="/dashboard"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Dashboard
              </Link>
            </div>

            <button className="md:hidden p-2 text-gray-600">☰</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <Hero />

      {/* Features */}
      <FeaturesSection />

      {/* Live Data */}
      <LiveDataSection />

      {/* Featured IPOs */}
      <FeaturedIPOs />

      {/* CTA */}
      <CTASection />

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">IPO Tracker</h3>
              <p className="text-gray-400">
                Your trusted platform for real-time IPO data and market insights.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Features</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/live-gmp" className="hover:text-white">
                    Live GMP
                  </Link>
                </li>
                <li>
                  <Link href="/subscription" className="hover:text-white">
                    Subscription Data
                  </Link>
                </li>
                <li>
                  <Link href="/allotment" className="hover:text-white">
                    Allotment Checker
                  </Link>
                </li>
                <li>
                  <Link href="/analytics" className="hover:text-white">
                    Market Analytics
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/about" className="hover:text-white">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  📧
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  🐦
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  📱
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 IPO Tracker. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
