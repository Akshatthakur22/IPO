import React, { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "../utils/helpers";

const SubscriptionMeter = ({
  ipoId,
  symbol,
  data,
  showCategories = true,
  showDetails = true,
  autoRefresh = false,
  refreshInterval = 30000,
  compact = false,
  animated = true,
}) => {
  const [subscriptionData, setSubscriptionData] = useState(data || null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    if (!data && (ipoId || symbol)) {
      fetchSubscriptionData();
    }
  }, [ipoId, symbol, data]);

  useEffect(() => {
    let interval;
    if (autoRefresh && (ipoId || symbol)) {
      interval = setInterval(fetchSubscriptionData, refreshInterval);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, ipoId, symbol, refreshInterval]);

  const fetchSubscriptionData = async () => {
    try {
      setError(null);
      const endpoint = symbol
        ? `/api/subscription/${symbol}`
        : `/api/subscription`;
      const params = new URLSearchParams({
        ...(ipoId && { ipoId }),
        includeStats: "true",
        includeTrends: "true",
        live: autoRefresh.toString(),
      });

      const response = await fetch(`${endpoint}?${params}`);
      const result = await response.json();

      if (result.success) {
        setSubscriptionData(result.statistics || result.data);
        setLastUpdate(Date.now());
      } else {
        setError(result.error || "Failed to fetch subscription data");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const processedData = useMemo(() => {
    if (!subscriptionData) return null;

    const overall =
      subscriptionData.overall || subscriptionData.overallSubscription || 0;
    const categories = subscriptionData.byCategory || {};

    // Standard IPO categories
    const categoryOrder = ["RETAIL", "QIB", "HNI", "EMPLOYEE", "SHAREHOLDER"];

    const processedCategories = categoryOrder
      .map((category) => {
        const categoryData = categories[category] || {};
        return {
          name: category,
          displayName: getCategoryDisplayName(category),
          ratio: categoryData.latestRatio || categoryData.avgRatio || 0,
          color: getCategoryColor(category),
          status:
            categoryData.latestRatio > 1 ? "oversubscribed" : "undersubscribed",
        };
      })
      .filter((cat) => cat.ratio > 0);

    return {
      overall,
      categories: processedCategories,
      isOversubscribed: overall > 1,
      trend: subscriptionData.trend || "stable",
    };
  }, [subscriptionData]);

  const getCategoryDisplayName = (category) => {
    const names = {
      RETAIL: "Retail",
      QIB: "QIB",
      HNI: "HNI",
      EMPLOYEE: "Employee",
      SHAREHOLDER: "Shareholder",
    };
    return names[category] || category;
  };

  const getCategoryColor = (category) => {
    const colors = {
      RETAIL: "bg-blue-500",
      QIB: "bg-green-500",
      HNI: "bg-purple-500",
      EMPLOYEE: "bg-orange-500",
      SHAREHOLDER: "bg-pink-500",
    };
    return colors[category] || "bg-gray-500";
  };

  const getOverallColor = (ratio) => {
    if (ratio >= 5) return "text-green-600";
    if (ratio >= 2) return "text-blue-600";
    if (ratio >= 1) return "text-yellow-600";
    return "text-red-600";
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case "increasing":
        return "📈";
      case "decreasing":
        return "📉";
      default:
        return "➖";
    }
  };

  const ProgressBar = ({ ratio, color, animated = true, height = "h-2" }) => (
    <div className={`${height} bg-gray-200 rounded-full overflow-hidden`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-1000 ease-out ${
          animated ? "animate-pulse" : ""
        }`}
        style={{
          width: `${Math.min(100, Math.max(5, ratio * 20))}%`, // Scale for better visibility
        }}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="text-center text-red-600">
          <div className="text-2xl mb-2">⚠️</div>
          <p className="mb-4">{error}</p>
          <button
            onClick={fetchSubscriptionData}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!processedData) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-lg font-medium">No Subscription Data</p>
          <p className="text-sm">
            Subscription data will appear when available
          </p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Subscription
          </span>
          <span
            className={`text-lg font-bold ${getOverallColor(processedData.overall)}`}
          >
            {processedData.overall.toFixed(1)}x
          </span>
        </div>

        <ProgressBar
          ratio={processedData.overall}
          color={processedData.isOversubscribed ? "bg-green-500" : "bg-red-500"}
          animated={animated}
        />

        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0x</span>
          <span
            className={
              processedData.isOversubscribed ? "text-green-600" : "text-red-600"
            }
          >
            {processedData.isOversubscribed
              ? "Oversubscribed"
              : "Undersubscribed"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Subscription Status
            </h3>
            {processedData.trend !== "stable" && (
              <span className="text-sm">
                {getTrendIcon(processedData.trend)}
              </span>
            )}
          </div>

          <div className="text-right">
            <div
              className={`text-2xl font-bold ${getOverallColor(processedData.overall)}`}
            >
              {processedData.overall.toFixed(2)}x
            </div>
            <div
              className={`text-sm font-medium ${
                processedData.isOversubscribed
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {processedData.isOversubscribed
                ? "Oversubscribed"
                : "Undersubscribed"}
            </div>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-6 py-4 border-b">
        <div className="mb-2">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Overall Subscription</span>
            <span>{processedData.overall.toFixed(2)}x</span>
          </div>
          <ProgressBar
            ratio={processedData.overall}
            color={
              processedData.isOversubscribed ? "bg-green-500" : "bg-red-500"
            }
            height="h-3"
            animated={animated}
          />
        </div>

        {/* Scale Indicators */}
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0x</span>
          <span>1x</span>
          <span>2x</span>
          <span>5x+</span>
        </div>
      </div>

      {/* Category Breakdown */}
      {showCategories && processedData.categories.length > 0 && (
        <div className="px-6 py-4">
          <h4 className="text-sm font-medium text-gray-900 mb-4">
            Category Wise Subscription
          </h4>

          <div className="space-y-3">
            {processedData.categories.map((category) => (
              <div key={category.name} className="flex items-center space-x-3">
                <div className="w-16 text-sm font-medium text-gray-700">
                  {category.displayName}
                </div>

                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{category.ratio.toFixed(2)}x</span>
                    <span
                      className={
                        category.status === "oversubscribed"
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {category.status === "oversubscribed" ? "✓" : "✗"}
                    </span>
                  </div>
                  <ProgressBar
                    ratio={category.ratio}
                    color={category.color}
                    animated={animated}
                  />
                </div>

                <div className="w-12 text-right text-sm font-semibold">
                  {category.ratio.toFixed(1)}x
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Details */}
      {showDetails && subscriptionData && (
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {subscriptionData.totalQuantity && (
              <div>
                <span className="text-gray-500">Total Quantity:</span>
                <div className="font-medium">
                  {Number(subscriptionData.totalQuantity).toLocaleString()}
                </div>
              </div>
            )}
            {subscriptionData.totalBids && (
              <div>
                <span className="text-gray-500">Total Bids:</span>
                <div className="font-medium">
                  {subscriptionData.totalBids.toLocaleString()}
                </div>
              </div>
            )}
            {subscriptionData.categories && (
              <div>
                <span className="text-gray-500">Categories:</span>
                <div className="font-medium">
                  {subscriptionData.categories.length}
                </div>
              </div>
            )}
            {subscriptionData.subscriptionVelocity !== undefined && (
              <div>
                <span className="text-gray-500">Velocity:</span>
                <div className="font-medium">
                  {subscriptionData.subscriptionVelocity.toFixed(2)}/hr
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {lastUpdate && (
        <div className="px-6 py-3 border-t text-center text-xs text-gray-500">
          Last updated: {new Date(lastUpdate).toLocaleString()}
          {autoRefresh && <span className="ml-2">• Auto-refresh enabled</span>}
        </div>
      )}
    </div>
  );
};

// Specialized components
export const SimpleSubscriptionMeter = ({ ratio, isOversubscribed }) => (
  <div className="flex items-center space-x-2">
    <div
      className={`text-lg font-bold ${isOversubscribed ? "text-green-600" : "text-red-600"}`}
    >
      {ratio?.toFixed(1)}x
    </div>
    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${isOversubscribed ? "bg-green-500" : "bg-red-500"}`}
        style={{ width: `${Math.min(100, ratio * 20)}%` }}
      />
    </div>
  </div>
);

export const CategorySubscriptionMeter = ({ categories }) => (
  <div className="space-y-2">
    {categories.map((category) => (
      <div
        key={category.name}
        className="flex items-center justify-between text-sm"
      >
        <span className="font-medium">{category.displayName}</span>
        <div className="flex items-center space-x-2">
          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${category.color}`}
              style={{ width: `${Math.min(100, category.ratio * 20)}%` }}
            />
          </div>
          <span className="w-12 text-right font-semibold">
            {category.ratio.toFixed(1)}x
          </span>
        </div>
      </div>
    ))}
  </div>
);

export default SubscriptionMeter;
