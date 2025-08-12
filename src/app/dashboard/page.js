"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import IPOCard from "../components/IPOCard";
import LiveGMPTracker from "../components/LiveGMPTracker";
import RealTimeUpdates from "../components/RealTimeUpdates";
import AnalyticsChart from "../components/AnalyticsChart";
import { formatCurrency, formatDate } from "../utils/helpers";

const DashboardPage = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();

    // Auto refresh every 2 minutes
    const interval = setInterval(fetchDashboardData, 120000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      setError(null);

      const [iposRes, analyticsRes, liveRes] = await Promise.allSettled([
        fetch("/api/ipos?status=all&limit=6&includeAnalytics=true"),
        fetch("/api/analytics?timeRange=7&metrics=all"),
        fetch("/api/gmp/live?symbols=&includeHistory=false"),
      ]);

      const data = {};

      if (iposRes.status === "fulfilled") {
        const iposData = await iposRes.value.json();
        if (iposData.success) {
          data.ipos = iposData.data;
          data.ipoStats = iposData.summary || {};
        }
      }

      if (analyticsRes.status === "fulfilled") {
        const analyticsData = await analyticsRes.value.json();
        if (analyticsData.success) {
          data.analytics = analyticsData.data;
        }
      }

      if (liveRes.status === "fulfilled") {
        const liveData = await liveRes.value.json();
        if (liveData.success) {
          data.liveGMP = liveData.data;
        }
      }

      setDashboardData(data);
    } catch (err) {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const QuickStats = () => {
    if (!dashboardData?.analytics) return null;

    const stats = [
      {
        title: "Active IPOs",
        value: dashboardData.analytics.ipoMarket?.activeIPOs || 0,
        change: "+2",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        icon: "🏢",
      },
      {
        title: "Avg GMP",
        value: `₹${dashboardData.analytics.gmpTrends?.average || 0}`,
        change:
          dashboardData.analytics.gmpTrends?.trend === "increasing"
            ? "+5%"
            : "0%",
        color: "text-green-600",
        bgColor: "bg-green-50",
        icon: "💰",
      },
      {
        title: "Oversubscribed",
        value: dashboardData.analytics.subscriptionTrends?.oversubscribed || 0,
        change: `${dashboardData.analytics.subscriptionTrends?.trend || "stable"}`,
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        icon: "📊",
      },
      {
        title: "Market Sentiment",
        value: dashboardData.analytics.summary?.marketSentiment || "neutral",
        change: "stable",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        icon: "📈",
      },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
                <p className={`text-sm mt-1 ${stat.color}`}>
                  {stat.change} from last week
                </p>
              </div>
              <div className={`${stat.bgColor} p-3 rounded-full`}>
                <span className="text-2xl">{stat.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ActiveIPOs = () => (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center justify-between p-6 border-b">
        <h2 className="text-lg font-semibold text-gray-900">Active IPOs</h2>
        <Link
          href="/dashboard/ipos"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View All →
        </Link>
      </div>

      <div className="p-6">
        {dashboardData?.ipos?.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dashboardData.ipos.slice(0, 4).map((ipo) => (
              <IPOCard
                key={ipo.id}
                ipo={ipo}
                compact={true}
                showAnalytics={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🏢</div>
            <p>No active IPOs found</p>
          </div>
        )}
      </div>
    </div>
  );

  const QuickActions = () => (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Quick Actions
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/dashboard/live"
          className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
        >
          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white mr-3">
            📈
          </div>
          <div>
            <p className="font-medium text-gray-900">Live Tracking</p>
            <p className="text-sm text-gray-600">
              Real-time GMP & subscription
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard/allotments"
          className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white mr-3">
            🎯
          </div>
          <div>
            <p className="font-medium text-gray-900">Check Allotment</p>
            <p className="text-sm text-gray-600">View allotment status</p>
          </div>
        </Link>

        <Link
          href="/dashboard/watchlist"
          className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white mr-3">
            ⭐
          </div>
          <div>
            <p className="font-medium text-gray-900">Watchlist</p>
            <p className="text-sm text-gray-600">Track favorite IPOs</p>
          </div>
        </Link>

        <Link
          href="/dashboard/analytics"
          className="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
        >
          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white mr-3">
            📊
          </div>
          <div>
            <p className="font-medium text-gray-900">Analytics</p>
            <p className="text-sm text-gray-600">Market insights</p>
          </div>
        </Link>
      </div>
    </div>
  );

  const RecentActivity = () => (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center justify-between p-6 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <button
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          {refreshing ? "⟳" : "🔄"} Refresh
        </button>
      </div>

      <RealTimeUpdates
        types={["gmp", "subscription"]}
        maxUpdates={10}
        compact={true}
        autoScroll={false}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border p-6 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Dashboard Error
        </h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={() => fetchDashboardData()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Welcome to IPO Dashboard
            </h1>
            <p className="text-blue-100">
              Track live IPO data, analyze market trends, and manage your
              investments
            </p>
          </div>
          <div className="text-4xl">📊</div>
        </div>
      </div>

      {/* Quick Stats */}
      <QuickStats />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active IPOs */}
        <div className="lg:col-span-2">
          <ActiveIPOs />
        </div>

        {/* Quick Actions */}
        <div>
          <QuickActions />
        </div>
      </div>

      {/* Live Data & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live GMP Tracker */}
        <div>
          <LiveGMPTracker
            symbols={
              dashboardData?.ipos?.slice(0, 3).map((ipo) => ipo.symbol) || []
            }
            compact={false}
            showChart={false}
            autoRefresh={true}
          />
        </div>

        {/* Recent Activity */}
        <div>
          <RecentActivity />
        </div>
      </div>

      {/* Market Trends Chart */}
      {dashboardData?.analytics && (
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              Market Trends
            </h3>
          </div>
          <div className="p-6">
            <AnalyticsChart
              data={dashboardData.analytics.chartData || []}
              type="line"
              height={300}
              showLegend={true}
              timeRange="7d"
            />
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">Stay Updated</h3>
            <p className="text-sm text-gray-600">
              Get real-time notifications for important IPO updates
            </p>
          </div>
          <Link
            href="/dashboard/alerts"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Manage Alerts
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
