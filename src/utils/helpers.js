// Helper Utilities
// General purpose utility functions for common operations across the application

/**
 * Core Functions (needed by your components)
 */

// Format currency (Indian Rupees)
export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '₹--';
  if (typeof amount === 'string') amount = parseFloat(amount);
  return `₹${amount.toLocaleString('en-IN')}`;
};

// Format date (Indian format)
export const formatDate = (date) => {
  if (!date) return '--';
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return '--';

  return dateObj.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Calculate days remaining based on IPO status
export const calculateDaysRemaining = (status, openDate, closeDate) => {
  const now = new Date();

  if (status === 'upcoming' && openDate) {
    const days = Math.ceil((new Date(openDate) - now) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }

  if (status === 'open' && closeDate) {
    const days = Math.ceil((new Date(closeDate) - now) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }

  return null;
};

// Format percentage
export const formatPercentage = (value, decimals = 2) => {
  if (!value && value !== 0) return '--';
  return `${value.toFixed(decimals)}%`;
};

// Get status color classes for styling
export const getStatusColor = (status) => {
  const colors = {
    upcoming: 'text-blue-600 bg-blue-50 border-blue-200',
    open: 'text-green-600 bg-green-50 border-green-200',
    closed: 'text-orange-600 bg-orange-50 border-orange-200',
    listed: 'text-purple-600 bg-purple-50 border-purple-200',
    cancelled: 'text-red-600 bg-red-50 border-red-200',
  };
  return colors[status] || 'text-gray-600 bg-gray-50 border-gray-200';
};

// Format GMP value
export const formatGMP = (gmp) => {
  if (!gmp && gmp !== 0) return '--';
  const sign = gmp > 0 ? '+' : '';
  return `${sign}₹${gmp}`;
};

/**
 * Constants (inline definitions to avoid import issues)
 */
export const IPO_STATUS = {
  UPCOMING: 'upcoming',
  OPEN: 'open',
  CLOSED: 'closed',
  LISTED: 'listed',
  CANCELLED: 'cancelled',
};

export const TIME_RANGES = {
  '1D': { value: 1, unit: 'day', label: '1 Day' },
  '1W': { value: 7, unit: 'day', label: '1 Week' },
  '1M': { value: 30, unit: 'day', label: '1 Month' },
  '3M': { value: 90, unit: 'day', label: '3 Months' },
  '6M': { value: 180, unit: 'day', label: '6 Months' },
  '1Y': { value: 365, unit: 'day', label: '1 Year' },
};

export const CONSTANTS = {
  API_BASE_URL: '/api',
  WS_BASE_URL: '/ws',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  REFRESH_INTERVAL: 30 * 1000, // 30 seconds
};

/**
 * Array Utilities
 */

// Remove duplicates from array
export const uniqueArray = (array, key = null) => {
  if (!Array.isArray(array)) return [];

  if (key) {
    const seen = new Set();
    return array.filter((item) => {
      const keyValue = typeof key === 'function' ? key(item) : item[key];
      if (seen.has(keyValue)) return false;
      seen.add(keyValue);
      return true;
    });
  }

  return [...new Set(array)];
};

// Group array by key
export const groupBy = (array, key) => {
  if (!Array.isArray(array)) return {};

  return array.reduce((groups, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
};

// Sort array by multiple fields
export const sortBy = (array, fields) => {
  if (!Array.isArray(array) || !Array.isArray(fields)) return array;

  return [...array].sort((a, b) => {
    for (const field of fields) {
      const { key, order = 'asc' } = typeof field === 'string' ? { key: field } : field;

      let aVal = typeof key === 'function' ? key(a) : a[key];
      let bVal = typeof key === 'function' ? key(b) : b[key];

      // Handle null/undefined values
      if (aVal == null && bVal == null) continue;
      if (aVal == null) return order === 'asc' ? 1 : -1;
      if (bVal == null) return order === 'asc' ? -1 : 1;

      // Handle different data types
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
};

// Chunk array into smaller arrays
export const chunkArray = (array, size) => {
  if (!Array.isArray(array) || size <= 0) return [];

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Flatten nested arrays
export const flattenArray = (array, depth = 1) => {
  if (!Array.isArray(array)) return [];
  return depth > 0 ? array.flat(depth) : array.slice();
};

/**
 * Object Utilities
 */

// Deep clone object
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
};

// Check if value is object
export const isObject = (obj) => {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
};

// Get nested object value safely
export const getNestedValue = (obj, path, defaultValue = null) => {
  if (!isObject(obj) || !path) return defaultValue;

  const keys = Array.isArray(path) ? path : path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return defaultValue;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
};

// Pick specific keys from object
export const pick = (obj, keys) => {
  if (!isObject(obj) || !Array.isArray(keys)) return {};

  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

// Omit specific keys from object
export const omit = (obj, keys) => {
  if (!isObject(obj) || !Array.isArray(keys)) return obj;

  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

/**
 * String Utilities
 */

// Generate random string
export const generateId = (
  length = 10,
  chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Convert string to kebab-case
export const toKebabCase = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

// Convert string to camelCase
export const toCamelCase = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
};

/**
 * Number Utilities
 */

// Clamp number between min and max
export const clamp = (num, min, max) => {
  return Math.min(Math.max(num, min), max);
};

// Round to specific decimal places
export const roundTo = (num, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

// Calculate percentage
export const calculatePercentage = (value, total, decimals = 2) => {
  if (total === 0) return 0;
  return roundTo((value / total) * 100, decimals);
};

// Calculate percentage change
export const calculatePercentageChange = (oldValue, newValue, decimals = 2) => {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return roundTo(((newValue - oldValue) / oldValue) * 100, decimals);
};

/**
 * Date Utilities
 */

// Add days to date
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Check if date is today
export const isToday = (date) => {
  const today = new Date();
  const compareDate = new Date(date);
  return compareDate.toDateString() === today.toDateString();
};

// Check if date is in past
export const isPast = (date) => {
  return new Date(date) < new Date();
};

// Check if date is in future
export const isFuture = (date) => {
  return new Date(date) > new Date();
};

// Get days difference between dates
export const daysDifference = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(date2) - new Date(date1)) / oneDay);
};

/**
 * Async Utilities
 */

// Delay execution
export const delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Debounce function
export const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
};

/**
 * Storage Utilities
 */

// Safe localStorage operations
export const storage = {
  get: (key, defaultValue = null) => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set: (key, value) => {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove: (key) => {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * IPO-Specific Helpers
 */

// Calculate IPO investment amount
export const calculateInvestmentAmount = (lotSize, price, lots = 1) => {
  return lotSize * price * lots;
};

// Calculate IPO listing gains
export const calculateListingGains = (issuePrice, listingPrice, quantity) => {
  const gainPerShare = listingPrice - issuePrice;
  const totalGain = gainPerShare * quantity;
  const percentage = (gainPerShare / issuePrice) * 100;

  return {
    gainPerShare: roundTo(gainPerShare, 2),
    totalGain: roundTo(totalGain, 2),
    percentage: roundTo(percentage, 2),
  };
};

// Check IPO application eligibility
export const checkIPOEligibility = (ipo, userCategory = 'RETAIL') => {
  if (!ipo) return { eligible: false, reason: 'IPO not found' };

  if (ipo.status !== IPO_STATUS.OPEN) {
    return { eligible: false, reason: 'IPO is not open for applications' };
  }

  if (isPast(ipo.closeDate)) {
    return { eligible: false, reason: 'IPO application period has ended' };
  }

  const now = new Date();
  const openDate = new Date(ipo.openDate);

  if (isFuture(openDate)) {
    return { eligible: false, reason: 'IPO has not opened yet' };
  }

  return { eligible: true, reason: 'Eligible for application' };
};

// Calculate GMP metrics
export const calculateGMPMetrics = (gmpData) => {
  if (!Array.isArray(gmpData) || gmpData.length === 0) {
    return { current: 0, average: 0, trend: 'stable', volatility: 0 };
  }

  const values = gmpData.map((g) => g.value);
  const latest = gmpData[0];

  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const volatility = Math.sqrt(variance);

  // Calculate trend
  let trend = 'stable';
  if (gmpData.length >= 3) {
    const recent = values.slice(0, Math.ceil(values.length / 3));
    const older = values.slice(-Math.ceil(values.length / 3));

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = calculatePercentageChange(olderAvg, recentAvg);

    if (change > 15) trend = 'bullish';
    else if (change < -15) trend = 'bearish';
  }

  return {
    current: latest.value,
    average: roundTo(average, 2),
    highest: Math.max(...values),
    lowest: Math.min(...values),
    trend,
    volatility: roundTo(volatility, 2),
  };
};

/**
 * Error Handling Utilities
 */

// Safe JSON parse
export const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

// Safe function execution
export const safeExecute = (fn, defaultValue = null, ...args) => {
  try {
    return fn(...args);
  } catch (error) {
    console.warn('Safe execution failed:', error);
    return defaultValue;
  }
};

/**
 * Validation Helpers (inline to avoid import issues)
 */

// Email validation
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone validation (Indian format)
export const isValidPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
};

// PAN validation (Indian format)
export const isValidPAN = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan.toUpperCase());
};

/**
 * Export all helpers as a combined object
 */
export const helpers = {
  // Core functions
  formatCurrency,
  formatDate,
  calculateDaysRemaining,
  formatPercentage,
  getStatusColor,
  formatGMP,

  // Array utilities
  uniqueArray,
  groupBy,
  sortBy,
  chunkArray,
  flattenArray,

  // Object utilities
  deepClone,
  isObject,
  getNestedValue,
  pick,
  omit,

  // String utilities
  generateId,
  toKebabCase,
  toCamelCase,

  // Number utilities
  clamp,
  roundTo,
  calculatePercentage,
  calculatePercentageChange,

  // Date utilities
  addDays,
  isToday,
  isPast,
  isFuture,
  daysDifference,

  // Async utilities
  delay,
  debounce,

  // Storage utilities
  storage,

  // IPO-specific helpers
  calculateInvestmentAmount,
  calculateListingGains,
  checkIPOEligibility,
  calculateGMPMetrics,

  // Error handling
  safeJsonParse,
  safeExecute,

  // Validation
  isValidEmail,
  isValidPhone,
  isValidPAN,
};

// Default export
export default helpers;
