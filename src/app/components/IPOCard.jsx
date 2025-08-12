import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency, formatDate, calculateDaysRemaining } from '../../utils/helpers';

const IPOCard = ({ ipo, showAnalytics = false, compact = false }) => {
  const [gmpData, setGmpData] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showAnalytics && ipo.id) {
      fetchLiveData();
    }
  }, [ipo.id, showAnalytics]);

  const fetchLiveData = async () => {
    setLoading(true);
    try {
      const [gmpRes, subRes] = await Promise.all([
        fetch(`/api/gmp/${ipo.id}?live=true&limit=1`),
        fetch(`/api/subscription/${ipo.symbol}?live=true&includeStats=true`),
      ]);

      if (gmpRes.ok) setGmpData(await gmpRes.json());
      if (subRes.ok) setSubscriptionData(await subRes.json());
    } catch (error) {
      console.error('Failed to fetch live data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      upcoming: 'bg-blue-100 text-blue-800',
      open: 'bg-green-100 text-green-800',
      closed: 'bg-orange-100 text-orange-800',
      listed: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getGMPColor = (value) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const daysRemaining = calculateDaysRemaining(ipo.status, ipo.openDate, ipo.closeDate);
  const currentGMP = gmpData?.data?.[0] || ipo.currentMetrics?.gmp;
  const currentSub = subscriptionData?.statistics || ipo.currentMetrics?.subscription;
  const isOversubscribed = currentSub?.overallSubscription > 1;

  if (compact) {
    return (
      <div className="bg-white rounded-lg border hover:shadow-md transition-shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <Link
            href={`/ipos/${ipo.id}`}
            className="font-semibold text-gray-900 hover:text-blue-600"
          >
            {ipo.symbol}
          </Link>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ipo.status)}`}
          >
            {ipo.status}
          </span>
        </div>

        <div className="text-sm text-gray-600 mb-2">{ipo.name}</div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Price:</span>
            <div className="font-medium">
              ₹{ipo.minPrice}-{ipo.maxPrice}
            </div>
          </div>
          {currentGMP && (
            <div>
              <span className="text-gray-500">GMP:</span>
              <div className={`font-medium ${getGMPColor(currentGMP.value)}`}>
                ₹{currentGMP.value} ({currentGMP.percentage}%)
              </div>
            </div>
          )}
        </div>

        {daysRemaining !== null && (
          <div className="mt-2 text-xs text-gray-500">
            {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Closed'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border hover:shadow-lg transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <Link
              href={`/ipos/${ipo.id}`}
              className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
            >
              {ipo.symbol}
            </Link>
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{ipo.name}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(ipo.status)}`}
          >
            {ipo.status.toUpperCase()}
          </span>
        </div>

        {/* Price Range */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">Price Band</span>
            <div className="text-lg font-semibold text-gray-900">
              ₹{ipo.minPrice} - ₹{ipo.maxPrice}
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-500">Lot Size</span>
            <div className="text-lg font-semibold text-gray-900">{ipo.lotSize}</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4 bg-gray-50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Open</div>
            <div className="text-sm font-medium text-gray-900">{formatDate(ipo.openDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Close</div>
            <div className="text-sm font-medium text-gray-900">{formatDate(ipo.closeDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Listing</div>
            <div className="text-sm font-medium text-gray-900">
              {ipo.listingDate ? formatDate(ipo.listingDate) : 'TBD'}
            </div>
          </div>
        </div>

        {daysRemaining !== null && (
          <div className="text-center mt-3">
            <div
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                daysRemaining > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {daysRemaining > 0
                ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
                : 'IPO Closed'}
            </div>
          </div>
        )}
      </div>

      {/* Analytics Section */}
      {showAnalytics && (
        <div className="p-6 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
            </div>
          )}

          {/* GMP Data */}
          {currentGMP && !loading && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Grey Market Premium</span>
                <button
                  onClick={fetchLiveData}
                  className="text-xs text-blue-600 hover:text-blue-800"
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xl font-bold ${getGMPColor(currentGMP.value)}`}>
                    ₹{currentGMP.value}
                  </div>
                  <div className={`text-sm ${getGMPColor(currentGMP.value)}`}>
                    {currentGMP.percentage > 0 ? '+' : ''}
                    {currentGMP.percentage}%
                  </div>
                </div>
                {currentGMP.volume && (
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Volume</div>
                    <div className="text-sm font-medium">{currentGMP.volume}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subscription Data */}
          {currentSub && !loading && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Subscription Status</span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isOversubscribed
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {isOversubscribed ? 'Oversubscribed' : 'Undersubscribed'}
                </span>
              </div>
              <div className="text-xl font-bold text-gray-900 mb-2">
                {currentSub.overallSubscription || currentSub.overall}x
              </div>

              {currentSub.byCategory && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(currentSub.byCategory).map(([category, data]) => (
                    <div key={category} className="text-center">
                      <div className="text-gray-500">{category}</div>
                      <div className="font-medium">{data.latestRatio || data.avgRatio}x</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Investment Calculator */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Investment Required</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Min Investment:</span>
                <div className="font-semibold text-gray-900">
                  {formatCurrency(ipo.lotSize * ipo.minPrice)}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Max Investment:</span>
                <div className="font-semibold text-gray-900">
                  {formatCurrency(ipo.lotSize * ipo.maxPrice)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {ipo.registrar && `Registrar: ${ipo.registrar}`}
          </div>
          <div className="flex space-x-2">
            <Link
              href={`/ipos/${ipo.id}`}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              View Details
            </Link>
            {ipo.status === 'open' && (
              <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                Apply Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IPOCard;
