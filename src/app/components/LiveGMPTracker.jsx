import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDate } from '../../utils/helpers';

const LiveGMPTracker = ({
  ipoId,
  symbol,
  symbols = [],
  autoRefresh = true,
  refreshInterval = 30000,
  showChart = true,
  compact = false,
}) => {
  const [gmpData, setGmpData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchGMPData();

    if (autoRefresh) {
      startAutoRefresh();
      // Optionally start WebSocket for real-time updates
      // startWebSocket();
    }

    return () => {
      stopAutoRefresh();
      closeWebSocket();
    };
  }, [ipoId, symbol, symbols, autoRefresh]);

  const fetchGMPData = async () => {
    try {
      setError(null);

      const params = new URLSearchParams({
        live: 'true',
        includeHistory: showChart.toString(),
        includeTrends: 'true',
        ...(ipoId && { ipoId }),
        ...(symbol && { symbol }),
        ...(symbols.length > 0 && { symbols: symbols.join(',') }),
      });

      const response = await fetch(`/api/gmp/live?${params}`);
      const data = await response.json();

      if (data.success) {
        setGmpData(data.data);
        setLastUpdate(Date.now());
        setIsConnected(data.service?.isRunning || false);
      } else {
        setError(data.error || 'Failed to fetch GMP data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const startAutoRefresh = () => {
    intervalRef.current = setInterval(fetchGMPData, refreshInterval);
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startWebSocket = () => {
    // WebSocket implementation for real-time updates
    try {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/gmp`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        // Subscribe to GMP updates
        wsRef.current.send(
          JSON.stringify({
            type: 'subscribe',
            channel: 'gmp',
            symbols: symbols.length > 0 ? symbols : [symbol],
          })
        );
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'gmp_update') {
          updateGMPData(data.payload);
        }
      };

      wsRef.current.onclose = () => setIsConnected(false);
      wsRef.current.onerror = () => setIsConnected(false);
    } catch (err) {
      console.error('WebSocket connection failed:', err);
    }
  };

  const closeWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const updateGMPData = (newData) => {
    setGmpData((prev) => {
      const updated = prev.map((item) =>
        item.ipoId === newData.ipoId ? { ...item, ...newData } : item
      );
      return updated;
    });
    setLastUpdate(Date.now());
  };

  const getGMPColor = (value) => {
    if (value > 50) return 'text-green-600';
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-gray-600';
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'bullish':
        return '📈';
      case 'bearish':
        return '📉';
      default:
        return '➖';
    }
  };

  const ConnectionStatus = () => (
    <div className="flex items-center text-xs">
      <div className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
        {isConnected ? 'Live' : 'Offline'}
      </span>
    </div>
  );

  if (loading && gmpData.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
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
            onClick={fetchGMPData}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Live GMP</h3>
          <ConnectionStatus />
        </div>

        <div className="space-y-2">
          {gmpData.slice(0, 3).map((item, index) => (
            <div key={item.ipoId || index} className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{item.ipo?.symbol}</span>
              <div className="flex items-center space-x-2">
                <span className={`font-semibold ${getGMPColor(item.value)}`}>₹{item.value}</span>
                <span className={`text-xs ${getGMPColor(item.value)}`}>
                  ({item.percentage > 0 ? '+' : ''}
                  {item.percentage}%)
                </span>
                <span className="text-xs">{getTrendIcon(item.trend)}</span>
              </div>
            </div>
          ))}
        </div>

        {lastUpdate && (
          <div className="text-xs text-gray-500 mt-3 text-center">
            Updated {new Date(lastUpdate).toLocaleTimeString()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Live GMP Tracker</h3>
          <div className="flex items-center space-x-4">
            <ConnectionStatus />
            <button
              onClick={fetchGMPData}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              title="Refresh"
            >
              <div className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>⟳</div>
            </button>
          </div>
        </div>
      </div>

      {/* GMP Data */}
      <div className="p-6">
        {gmpData.length > 0 ? (
          <div className="space-y-4">
            {gmpData.map((item, index) => (
              <div
                key={item.ipoId || index}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                {/* IPO Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.ipo?.symbol}</h4>
                    <p className="text-sm text-gray-600">{item.ipo?.name}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${getGMPColor(item.value)}`}>
                      ₹{item.value}
                    </div>
                    <div className={`text-sm ${getGMPColor(item.value)}`}>
                      {item.percentage > 0 ? '+' : ''}
                      {item.percentage}%
                    </div>
                  </div>
                </div>

                {/* GMP Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Volume:</span>
                    <div className="font-medium">{item.volume?.toLocaleString() || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Spread:</span>
                    <div className="font-medium">{item.spread ? `₹${item.spread}` : 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Trend:</span>
                    <div className="font-medium flex items-center">
                      {getTrendIcon(item.trend)} {item.trend}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Age:</span>
                    <div className="font-medium">
                      {item.age ? Math.round(item.age / 60000) + 'm' : 'Live'}
                    </div>
                  </div>
                </div>

                {/* Price Points */}
                {(item.bidPrice || item.askPrice) && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {item.bidPrice && (
                        <div>
                          <span className="text-gray-500">Bid Price:</span>
                          <div className="font-medium text-green-600">₹{item.bidPrice}</div>
                        </div>
                      )}
                      {item.askPrice && (
                        <div>
                          <span className="text-gray-500">Ask Price:</span>
                          <div className="font-medium text-red-600">₹{item.askPrice}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mini Chart */}
                {showChart && item.history && item.history.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs text-gray-500 mb-2">Recent Trend</div>
                    <div className="flex items-end space-x-1 h-8">
                      {item.history.slice(-10).map((point, idx) => (
                        <div
                          key={idx}
                          className={`flex-1 min-w-0 rounded-t ${getGMPColor(point.value).replace('text-', 'bg-').replace('-600', '-200').replace('-500', '-200')}`}
                          style={{
                            height: `${Math.max(10, (point.value / Math.max(...item.history.map((h) => h.value))) * 100)}%`,
                          }}
                          title={`₹${point.value} at ${formatDate(point.timestamp)}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-lg font-medium">No GMP Data Available</p>
            <p className="text-sm">Live GMP data will appear when available</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {lastUpdate && (
        <div className="bg-gray-50 px-6 py-3 border-t text-center text-sm text-gray-600">
          Last updated: {new Date(lastUpdate).toLocaleString()}
          {autoRefresh && (
            <span className="ml-2">• Auto-refresh every {refreshInterval / 1000}s</span>
          )}
        </div>
      )}
    </div>
  );
};

// Specialized components
export const SingleGMPTracker = ({ ipoId, symbol }) => (
  <LiveGMPTracker ipoId={ipoId} symbol={symbol} compact={true} showChart={false} />
);

export const MultiGMPTracker = ({ symbols }) => (
  <LiveGMPTracker symbols={symbols} autoRefresh={true} showChart={true} />
);

export default LiveGMPTracker;
