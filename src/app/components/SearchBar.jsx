import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { debounce } from "lodash";

const SearchBar = ({
  placeholder = "Search IPOs by name, symbol, or sector...",
  showSuggestions = true,
  showFilters = false,
  onSearch,
  onFilter,
  className = "",
  size = "medium",
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestionList, setShowSuggestionList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  const [showQuickFilters, setShowQuickFilters] = useState(false);

  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    // Load recent searches from localStorage
    const recent = JSON.parse(localStorage.getItem("ipoSearchHistory") || "[]");
    setRecentSearches(recent.slice(0, 5));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestionList(false);
        setShowQuickFilters(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(
    debounce(async (searchQuery) => {
      if (searchQuery.length < 2) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(
          `/api/ipos/search?q=${encodeURIComponent(searchQuery)}&suggestions=true&limit=8`
        );
        const data = await response.json();

        if (data.success) {
          setSuggestions(data.suggestions || []);
        }
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);

    if (showSuggestions) {
      setShowSuggestionList(value.length > 0);
      fetchSuggestions(value);
    }
  };

  const handleInputFocus = () => {
    if (query.length > 0 && showSuggestions) {
      setShowSuggestionList(true);
    } else if (recentSearches.length > 0) {
      setShowSuggestionList(true);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestionList) return;

    const totalItems = suggestions.length + (recentSearches.length > 0 ? 1 : 0);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          handleSearch();
        }
        break;
      case "Escape":
        setShowSuggestionList(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSearch = (searchQuery = query) => {
    if (!searchQuery.trim()) return;

    // Save to recent searches
    const newRecent = [
      searchQuery,
      ...recentSearches.filter((item) => item !== searchQuery),
    ].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem("ipoSearchHistory", JSON.stringify(newRecent));

    setShowSuggestionList(false);

    if (onSearch) {
      onSearch(searchQuery);
    } else {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    const searchValue = suggestion.value || suggestion;
    setQuery(searchValue);
    handleSearch(searchValue);
  };

  const clearSearch = () => {
    setQuery("");
    setSuggestions([]);
    setShowSuggestionList(false);
    searchRef.current?.focus();
  };

  const getSizeClasses = () => {
    switch (size) {
      case "small":
        return "px-3 py-2 text-sm";
      case "large":
        return "px-4 py-3 text-lg";
      default:
        return "px-4 py-2.5";
    }
  };

  const QuickFilters = () => (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => onFilter?.({ status: "open" })}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
        >
          <span>🟢</span>
          <span>Open IPOs</span>
        </button>
        <button
          onClick={() => onFilter?.({ status: "upcoming" })}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
        >
          <span>📅</span>
          <span>Upcoming</span>
        </button>
        <button
          onClick={() => onFilter?.({ minGMP: 50 })}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100"
        >
          <span>💰</span>
          <span>High GMP</span>
        </button>
        <button
          onClick={() => onFilter?.({ subscriptionMin: 2 })}
          className="flex items-center space-x-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100"
        >
          <span>📊</span>
          <span>Oversubscribed</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`
            block w-full pl-10 pr-12 border border-gray-300 rounded-lg 
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            placeholder-gray-500 ${getSizeClasses()}
          `}
          autoComplete="off"
        />

        {/* Clear Button */}
        {query && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-8 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}

        {/* Filter Toggle */}
        {showFilters && (
          <button
            onClick={() => setShowQuickFilters(!showQuickFilters)}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 ${
              showQuickFilters ? "text-blue-600" : ""
            }`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Filters */}
      {showQuickFilters && <QuickFilters />}

      {/* Suggestions Dropdown */}
      {showSuggestionList && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-center text-gray-500">
              <div className="inline-flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
                Searching...
              </div>
            </div>
          )}

          {/* Recent Searches */}
          {!loading && query.length === 0 && recentSearches.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Recent Searches
              </div>
              {recentSearches.map((recent, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(recent)}
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  <svg
                    className="h-4 w-4 text-gray-400 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {recent}
                </button>
              ))}
            </div>
          )}

          {/* Search Suggestions */}
          {!loading && suggestions.length > 0 && (
            <div className="p-2">
              {query.length > 0 && (
                <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Suggestions
                </div>
              )}
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-100 rounded ${
                    selectedIndex === index
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700"
                  }`}
                >
                  <div className="flex items-center">
                    <div className="mr-3">
                      {suggestion.type === "symbol" && "🏢"}
                      {suggestion.type === "name" && "📄"}
                      {suggestion.type === "sector" && "🏭"}
                      {suggestion.type === "registrar" && "📋"}
                    </div>
                    <div>
                      <div className="font-medium">
                        {suggestion.display || suggestion.value}
                      </div>
                      {suggestion.category && (
                        <div className="text-xs text-gray-500">
                          {suggestion.category}
                        </div>
                      )}
                    </div>
                  </div>
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && query.length > 0 && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-500">
              <div className="text-2xl mb-2">🔍</div>
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs">
                Try different keywords or check spelling
              </p>
            </div>
          )}

          {/* Search All Results */}
          {!loading && query.length > 0 && (
            <div className="border-t p-2">
              <button
                onClick={() => handleSearch()}
                className="w-full flex items-center px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded font-medium"
              >
                <svg
                  className="h-4 w-4 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Search for "{query}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Specialized search components
export const QuickSearch = ({ onSelect }) => (
  <SearchBar
    placeholder="Quick IPO search..."
    size="small"
    onSearch={onSelect}
    showSuggestions={true}
    showFilters={false}
  />
);

export const AdvancedSearch = ({ onSearch, onFilter }) => (
  <SearchBar
    placeholder="Search IPOs with filters..."
    size="large"
    onSearch={onSearch}
    onFilter={onFilter}
    showSuggestions={true}
    showFilters={true}
  />
);

export const HeaderSearch = () => (
  <SearchBar
    placeholder="Search IPOs..."
    className="max-w-md"
    showSuggestions={true}
    showFilters={false}
  />
);

export default SearchBar;
