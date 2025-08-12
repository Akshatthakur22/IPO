import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatCurrency, formatDate } from '../../utils/helpers';

const RealTimeUpdates = ({
  symbols = [],
  types = ['gmp', 'subscription'],
  updateInterval = 15000,
  maxUpdates = 50,
  showNotifications = true,
  compact = false,
  autoScroll = true,
}) => {
  const [updates, setUpdates] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({ total: 0, gmp: 0, subscription: 0 });

  const wsRef = useRef(null);
  const updatesRef = useRef(null);
  const notificationRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => disconnectWebSocket();
  }, [symbols, types]);

  useEffect(() => {
    if (autoScroll && updatesRef.current) {
      updatesRef.current.scrollTop = 0;
    }
  }, [updates, autoScroll]);

  const connectWebSocket = useCallback(() => {
    try {
      const wsUrl =
        process.env.NODE_ENV === 'production'
          ? `wss://${window.location.host}/ws/live`
          : `ws://localhost:3001/ws/live`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        // Subscribe to updates
        wsRef.current.send(
          JSON.stringify({
            type: 'subscribe',
            channels: types,
            symbols: symbols.length > 0 ? symbols : ['all'],
          })
        );
      };

      wsRef.current.onmessage = (event) => {
        if (isPaused) return;

        const data = JSON.parse(event.data);
        handleRealtimeUpdate(data);
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        // Attempt reconnection after delay
        setTimeout(connectWebSocket, 5000);
      };

      wsRef.current.onerror = () => {
        setIsConnected(false);
      };
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setIsConnected(false);
    }
  }, [symbols, types, isPaused]);

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleRealtimeUpdate = (data) => {
    const update = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: data.type,
      symbol: data.symbol,
      data: data.payload,
      change: calculateChange(data),
    };

    setUpdates((prev) => {
      const newUpdates = [update, ...prev].slice(0, maxUpdates);
      return newUpdates;
    });

    setStats((prev) => ({
      total: prev.total + 1,
      [data.type]: (prev[data.type] || 0) + 1,
    }));

    // Show notification if enabled
    if (showNotifications && isSignificantUpdate(update)) {
      showNotification(update);
    }
  };

  const calculateChange = (data) => {
    if (data.type === 'gmp' && data.payload.previousValue) {
      const current = data.payload.value;
      const previous = data.payload.previousValue;
      const change = current - previous;
      const changePercent = ((change / previous) * 100).toFixed(2);
      return { value: change, percent: changePercent };
    }
    return null;
  };

  const isSignificantUpdate = (update) => {
    if (update.type === 'gmp' && update.change) {
      return Math.abs(update.change.value) > 10; // GMP change > ₹10
    }
    if (update.type === 'subscription' && update.data.subscriptionRatio) {
      return update.data.subscriptionRatio > 1; // Oversubscribed
    }
    return false;
  };

  const showNotification = (update) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const notification = new Notification(`${update.symbol} Update`, {
        body: getNotificationText(update),
        icon: '/favicon.ico',
        tag: update.symbol,
      });

      setTimeout(() => notification.close(), 5000);
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const getNotificationText = (update) => {
    if (update.type === 'gmp') {
      return `GMP: ₹${update.data.value} (${update.data.percentage}%)`;
    }
    if (update.type === 'subscription') {
      return `Subscription: ${update.data.subscriptionRatio}x`;
    }
    return 'New update available';
  };

  const getUpdateIcon = (type) => {
    const icons = {
      gmp: '💰',
      subscription: '📊',
      allotment: '🎯',
      listing: '📈',
      news: '📰',
    };
    return icons[type] || '📱';
  };

  const getChangeColor = (change) => {
    if (!change) return 'text-gray-600';
    return change.value > 0 ? 'text-green-600' : 'text-red-600';
  };

  const filteredUpdates = updates.filter((update) => filter === 'all' || update.type === filter);

  const ConnectionStatus = () => (
    <div className={`flex items-center text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
      <div
        className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
      />
      {isConnected ? 'Live' : 'Disconnected'}
    </div>
  );

  if (compact) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Live Updates</h3>
          <div className="flex items-center space-x-2">
            <ConnectionStatus />
            <span className="text-xs text-gray-500">{stats.total}</span>
          </div>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto" ref={updatesRef}>
          {filteredUpdates.slice(0, 5).map((update) => (
            <div key={update.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <span>{getUpdateIcon(update.type)}</span>
                <span className="font-medium text-gray-700">{update.symbol}</span>
              </div>
              <div className="text-right">
                {update.type === 'gmp' && (
                  <div className={`font-semibold ${getChangeColor(update.change)}`}>
                    ₹{update.data.value}
                  </div>
                )}
                {update.type === 'subscription' && (
                  <div className="font-semibold text-blue-600">
                    {update.data.subscriptionRatio}x
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {new Date(update.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">Real-Time Updates</h3>
            <ConnectionStatus />
          </div>

          <div className="flex items-center space-x-3">
            {/* Stats */}
            <div className="text-sm text-gray-600">{stats.total} updates</div>

            {/* Controls */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1 text-xs rounded-full ${
                isPaused ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}
            >
              {isPaused ? 'Paused' : 'Live'}
            </button>

            <button
              onClick={() => setUpdates([])}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b bg-gray-50">
        <div className="flex items-center space-x-2">
          {['all', ...types].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                filter === type
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              {type !== 'all' && stats[type] > 0 && (
                <span className="ml-1 text-xs">({stats[type]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Updates Feed */}
      <div className="max-h-96 overflow-y-auto" ref={updatesRef}>
        {filteredUpdates.length > 0 ? (
          <div className="divide-y">
            {filteredUpdates.map((update) => (
              <div key={update.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="text-xl">{getUpdateIcon(update.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-900">{update.symbol}</span>
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                          {update.type}
                        </span>
                      </div>

                      {/* Update Details */}
                      <div className="mt-2 text-sm">
                        {update.type === 'gmp' && (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-4">
                              <span>
                                GMP: <span className="font-semibold">₹{update.data.value}</span>
                              </span>
                              <span>
                                Premium:{' '}
                                <span className="font-semibold">{update.data.percentage}%</span>
                              </span>
                              {update.data.volume && (
                                <span>
                                  Volume:{' '}
                                  <span className="font-semibold">{update.data.volume}</span>
                                </span>
                              )}
                            </div>
                            {update.change && (
                              <div className={`text-xs ${getChangeColor(update.change)}`}>
                                Change: {update.change.value > 0 ? '+' : ''}₹{update.change.value}(
                                {update.change.value > 0 ? '+' : ''}
                                {update.change.percent}%)
                              </div>
                            )}
                          </div>
                        )}

                        {update.type === 'subscription' && (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-4">
                              <span>
                                Ratio:{' '}
                                <span className="font-semibold">
                                  {update.data.subscriptionRatio}x
                                </span>
                              </span>
                              <span>
                                Category:{' '}
                                <span className="font-semibold">{update.data.category}</span>
                              </span>
                            </div>
                            {update.data.quantity && (
                              <div className="text-xs text-gray-600">
                                Quantity: {Number(update.data.quantity).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-xs text-gray-500">
                    <div>{formatDate(update.timestamp)}</div>
                    <div>{new Date(update.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            <div className="text-4xl mb-2">📡</div>
            <p className="text-lg font-medium">
              {isPaused ? 'Updates Paused' : 'Waiting for Updates'}
            </p>
            <p className="text-sm">
              {isPaused
                ? 'Click "Live" to resume receiving updates'
                : 'Real-time data will appear here'}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {filteredUpdates.length > 0 && (
        <div className="bg-gray-50 px-6 py-3 border-t text-center text-xs text-gray-600">
          Showing {filteredUpdates.length} of {updates.length} updates
          {isConnected && !isPaused && (
            <span className="ml-2">• Updates every {updateInterval / 1000}s</span>
          )}
        </div>
      )}
    </div>
  );
};

// Specialized components
export const GMPUpdates = ({ symbols }) => (
  <RealTimeUpdates symbols={symbols} types={['gmp']} compact={true} maxUpdates={20} />
);

export const SubscriptionUpdates = ({ symbols }) => (
  <RealTimeUpdates symbols={symbols} types={['subscription']} compact={true} maxUpdates={15} />
);

export const AllUpdates = ({ symbols }) => (
  <RealTimeUpdates
    symbols={symbols}
    types={['gmp', 'subscription', 'allotment', 'listing']}
    showNotifications={true}
    autoScroll={true}
  />
);

export default RealTimeUpdates;
