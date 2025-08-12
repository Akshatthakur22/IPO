import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const AnalyticsChart = ({
  data = [],
  type = "line",
  title,
  height = 300,
  showLegend = true,
  showGrid = true,
  animate = true,
  colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"],
  timeRange = "7d",
}) => {
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState([]);

  useEffect(() => {
    if (data.length > 0) {
      setChartData(processData(data));
      setSelectedMetrics(getAvailableMetrics(data));
    }
  }, [data, timeRange]);

  const processData = (rawData) => {
    return rawData
      .map((item) => ({
        ...item,
        date: formatDate(item.timestamp || item.date),
        timestamp: new Date(item.timestamp || item.date).getTime(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  const getAvailableMetrics = (data) => {
    if (!data.length) return [];
    const sample = data[0];
    return Object.keys(sample).filter(
      (key) =>
        typeof sample[key] === "number" && !["timestamp", "id"].includes(key)
    );
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    if (timeRange === "1d")
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    if (timeRange === "7d")
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="bg-white p-3 border rounded-lg shadow-lg">
        <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center text-sm">
            <div
              className="w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.dataKey}:</span>
            <span className="font-medium ml-1">
              {formatValue(entry.value, entry.dataKey)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const formatValue = (value, key) => {
    if (
      key.includes("price") ||
      key.includes("gmp") ||
      key.includes("amount")
    ) {
      return `₹${value.toLocaleString()}`;
    }
    if (key.includes("percentage") || key.includes("ratio")) {
      return `${value.toFixed(2)}%`;
    }
    if (key.includes("volume") || key.includes("quantity")) {
      return value.toLocaleString();
    }
    return value.toFixed(2);
  };

  const MetricToggle = ({ metric, isSelected, onToggle }) => (
    <button
      onClick={() => onToggle(metric)}
      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
        isSelected
          ? "bg-blue-100 text-blue-800 border-blue-300"
          : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"
      }`}
    >
      {metric}
    </button>
  );

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    switch (type) {
      case "area":
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map((metric, index) => (
              <Area
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.3}
                strokeWidth={2}
                animationDuration={animate ? 1000 : 0}
              />
            ))}
          </AreaChart>
        );

      case "bar":
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map((metric, index) => (
              <Bar
                key={metric}
                dataKey={metric}
                fill={colors[index % colors.length]}
                radius={[2, 2, 0, 0]}
                animationDuration={animate ? 1000 : 0}
              />
            ))}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}
            {selectedMetrics.map((metric, index) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={animate ? 1000 : 0}
              />
            ))}
          </LineChart>
        );
    }
  };

  const availableMetrics = getAvailableMetrics(data);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="bg-white rounded-lg border p-6">
        {title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        )}
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-lg font-medium">No Data Available</p>
          <p className="text-sm">Chart data will appear when available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        {title && (
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        )}
        <div className="flex items-center space-x-2">
          {/* Chart Type Selector */}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
          </select>
        </div>
      </div>

      {/* Metric Toggles */}
      {availableMetrics.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {availableMetrics.map((metric) => (
            <MetricToggle
              key={metric}
              metric={metric}
              isSelected={selectedMetrics.includes(metric)}
              onToggle={(metric) => {
                setSelectedMetrics((prev) =>
                  prev.includes(metric)
                    ? prev.filter((m) => m !== metric)
                    : [...prev, metric]
                );
              }}
            />
          ))}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>

      {/* Chart Stats */}
      {selectedMetrics.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {selectedMetrics.map((metric, index) => {
              const values = chartData
                .map((d) => d[metric])
                .filter((v) => v != null);
              const latest = values[values.length - 1];
              const change =
                values.length > 1
                  ? ((latest - values[values.length - 2]) /
                      values[values.length - 2]) *
                    100
                  : 0;

              return (
                <div key={metric} className="text-center">
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-1"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {metric}
                  </div>
                  <div className="font-semibold text-gray-900">
                    {formatValue(latest, metric)}
                  </div>
                  {change !== 0 && (
                    <div
                      className={`text-xs ${change > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(1)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Specialized chart components
export const GMPChart = ({ ipoId, symbol, timeRange = "7d" }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGMPData = async () => {
      try {
        const endpoint = ipoId ? `/api/gmp/${ipoId}` : `/api/gmp`;
        const params = new URLSearchParams({
          ...(symbol && { symbol }),
          timeRange,
          includeStats: "true",
          includeTrends: "true",
        });

        const response = await fetch(`${endpoint}?${params}`);
        const result = await response.json();

        if (result.success) {
          setData(result.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch GMP data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGMPData();
  }, [ipoId, symbol, timeRange]);

  if (loading)
    return <div className="h-64 bg-gray-200 animate-pulse rounded" />;

  return (
    <AnalyticsChart
      data={data}
      type="line"
      title="Grey Market Premium Trend"
      colors={["#10B981", "#F59E0B"]}
      timeRange={timeRange}
    />
  );
};

export const SubscriptionChart = ({ symbol, timeRange = "7d" }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscriptionData = async () => {
      try {
        const params = new URLSearchParams({
          symbol,
          timeRange,
          includeStats: "true",
          groupBy: "daily",
        });

        const response = await fetch(`/api/subscription/${symbol}?${params}`);
        const result = await response.json();

        if (result.success) {
          setData(result.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch subscription data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (symbol) fetchSubscriptionData();
  }, [symbol, timeRange]);

  if (loading)
    return <div className="h-64 bg-gray-200 animate-pulse rounded" />;

  return (
    <AnalyticsChart
      data={data}
      type="area"
      title="Subscription Trend"
      colors={["#3B82F6", "#8B5CF6", "#F59E0B"]}
      timeRange={timeRange}
    />
  );
};

export default AnalyticsChart;
