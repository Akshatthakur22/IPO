import React, { useState, useEffect, useCallback, useMemo } from 'react';
import IPOCard from './IPOCard';
import { formatCurrency } from '../../utils/helpers';

const IPOList = ({
  initialData = [],
  showFilters = true,
  showSearch = true,
  compact = false,
  showAnalytics = false,
  limit = 20,
  status = 'all',
  autoRefresh = false,
}) => {
  const [ipos, setIpos] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: status,
    sector: '',
    search: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'openDate',
    sortOrder: 'desc',
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchIPOs = useCallback(
    async (reset = false) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          ...filters,
          page: reset ? 1 : page,
          limit,
          includeAnalytics: showAnalytics,
          live: autoRefresh,
        });

        const response = await fetch(`/api/ipos?${params}`);
        const data = await response.json();

        if (data.success) {
          if (reset) {
            setIpos(data.data);
            setPage(1);
          } else {
            setIpos((prev) => [...prev, ...data.data]);
          }

          setHasMore(data.pagination.hasNextPage);
          setTotalCount(data.pagination.totalCount);
        } else {
          setError(data.error || 'Failed to fetch IPOs');
        }
      } catch (err) {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [filters, page, limit, showAnalytics, autoRefresh]
  );

  useEffect(() => {
    if (initialData.length === 0) {
      fetchIPOs(true);
    }
  }, []);

  useEffect(() => {
    fetchIPOs(true);
  }, [filters]);

  useEffect(() => {
    let interval;
    if (autoRefresh && !loading) {
      interval = setInterval(() => {
        fetchIPOs(true);
      }, 30000); // Refresh every 30 seconds
    }
    return () => clearInterval(interval);
  }, [autoRefresh, loading, fetchIPOs]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
    setTimeout(() => fetchIPOs(), 0);
  };

  const filteredIPOs = useMemo(() => {
    return ipos.filter((ipo) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          ipo.name.toLowerCase().includes(searchLower) ||
          ipo.symbol.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [ipos, filters.search]);

  const sectorOptions = useMemo(() => {
    const sectors = [...new Set(ipos.map((ipo) => ipo.sector).filter(Boolean))];
    return sectors.sort();
  }, [ipos]);

  const statusOptions = [
    { value: 'all', label: 'All IPOs' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'listed', label: 'Listed' },
  ];

  const sortOptions = [
    { value: 'openDate', label: 'Open Date' },
    { value: 'issueSize', label: 'Issue Size' },
    { value: 'maxPrice', label: 'Price' },
    { value: 'name', label: 'Name' },
  ];

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 text-lg mb-4">⚠️ {error}</div>
        <button
          onClick={() => fetchIPOs(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      {(showSearch || showFilters) && (
        <div className="bg-white rounded-lg border p-4 space-y-4">
          {/* Search */}
          {showSearch && (
            <div>
              <input
                type="text"
                placeholder="Search IPOs by name or symbol..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Status Filter */}
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {/* Sector Filter */}
              <select
                value={filters.sector}
                onChange={(e) => handleFilterChange('sector', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sectors</option>
                {sectorOptions.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>

              {/* Price Range */}
              <input
                type="number"
                placeholder="Min Price"
                value={filters.minPrice}
                onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="Max Price"
                value={filters.maxPrice}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Sort */}
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort by {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Filters Summary */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing {filteredIPOs.length} of {totalCount} IPOs
              {autoRefresh && <span className="ml-2 text-green-600">• Live Updates</span>}
            </span>

            {/* Clear Filters */}
            {(filters.search ||
              filters.sector ||
              filters.minPrice ||
              filters.maxPrice ||
              filters.status !== 'all') && (
              <button
                onClick={() =>
                  setFilters({
                    status: 'all',
                    sector: '',
                    search: '',
                    minPrice: '',
                    maxPrice: '',
                    sortBy: 'openDate',
                    sortOrder: 'desc',
                  })
                }
                className="text-blue-600 hover:text-blue-800"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* IPO Grid */}
      {filteredIPOs.length > 0 ? (
        <div
          className={`grid gap-6 ${
            compact
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
          }`}
        >
          {filteredIPOs.map((ipo) => (
            <IPOCard key={ipo.id} ipo={ipo} compact={compact} showAnalytics={showAnalytics} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {loading ? 'Loading IPOs...' : 'No IPOs Found'}
          </h3>
          <p className="text-gray-600">
            {loading
              ? 'Please wait while we fetch the latest IPO data'
              : 'Try adjusting your filters or check back later'}
          </p>
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && filteredIPOs.length > 0 && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Load More IPOs
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="text-center py-4">
          <div className="inline-flex items-center text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
            Loading...
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {filteredIPOs.length > 0 && showAnalytics && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Quick Stats</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total IPOs:</span>
              <div className="font-semibold text-lg">{filteredIPOs.length}</div>
            </div>
            <div>
              <span className="text-gray-500">Open IPOs:</span>
              <div className="font-semibold text-lg text-green-600">
                {filteredIPOs.filter((ipo) => ipo.status === 'open').length}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Total Issue Size:</span>
              <div className="font-semibold text-lg">
                {formatCurrency(
                  filteredIPOs.reduce(
                    (sum, ipo) => sum + parseInt(ipo.issueSize || 0) / 10000000,
                    0
                  )
                )}{' '}
                Cr
              </div>
            </div>
            <div>
              <span className="text-gray-500">Avg GMP:</span>
              <div className="font-semibold text-lg text-blue-600">
                ₹
                {Math.round(
                  filteredIPOs
                    .filter((ipo) => ipo.currentMetrics?.gmp?.value)
                    .reduce((sum, ipo) => sum + ipo.currentMetrics.gmp.value, 0) /
                    filteredIPOs.filter((ipo) => ipo.currentMetrics?.gmp?.value).length || 0
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IPOList;
