// Application Constants
// Centralized configuration and constant values for the IPO Tracker application

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || "/api",
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  CACHE_DURATION: {
    SHORT: 60, // 1 minute
    MEDIUM: 300, // 5 minutes
    LONG: 1800, // 30 minutes
    DAILY: 86400, // 24 hours
  },
};

// IPO Status Constants
export const IPO_STATUS = {
  UPCOMING: "upcoming",
  OPEN: "open",
  CLOSED: "closed",
  LISTED: "listed",
  WITHDRAWN: "withdrawn",
  CANCELLED: "cancelled",
};

export const IPO_STATUS_LABELS = {
  [IPO_STATUS.UPCOMING]: "Upcoming",
  [IPO_STATUS.OPEN]: "Open",
  [IPO_STATUS.CLOSED]: "Closed",
  [IPO_STATUS.LISTED]: "Listed",
  [IPO_STATUS.WITHDRAWN]: "Withdrawn",
  [IPO_STATUS.CANCELLED]: "Cancelled",
};

export const IPO_STATUS_COLORS = {
  [IPO_STATUS.UPCOMING]: "bg-blue-100 text-blue-800",
  [IPO_STATUS.OPEN]: "bg-green-100 text-green-800",
  [IPO_STATUS.CLOSED]: "bg-orange-100 text-orange-800",
  [IPO_STATUS.LISTED]: "bg-purple-100 text-purple-800",
  [IPO_STATUS.WITHDRAWN]: "bg-red-100 text-red-800",
  [IPO_STATUS.CANCELLED]: "bg-gray-100 text-gray-800",
};

// Subscription Categories
export const SUBSCRIPTION_CATEGORIES = {
  RETAIL: "RETAIL",
  QIB: "QIB",
  HNI: "HNI",
  EMPLOYEE: "EMPLOYEE",
  SHAREHOLDER: "SHAREHOLDER",
  OVERALL: "OVERALL",
};

export const SUBSCRIPTION_CATEGORY_CONFIG = {
  [SUBSCRIPTION_CATEGORIES.RETAIL]: {
    displayName: "Retail",
    color: "bg-blue-500",
    textColor: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Individual investors (up to ₹2 lakh)",
    allocation: 35,
    icon: "👤",
  },
  [SUBSCRIPTION_CATEGORIES.QIB]: {
    displayName: "QIB",
    color: "bg-green-500",
    textColor: "text-green-600",
    bgColor: "bg-green-50",
    description: "Qualified Institutional Buyers",
    allocation: 50,
    icon: "🏛️",
  },
  [SUBSCRIPTION_CATEGORIES.HNI]: {
    displayName: "HNI",
    color: "bg-purple-500",
    textColor: "text-purple-600",
    bgColor: "bg-purple-50",
    description: "High Net Worth Individuals (above ₹2 lakh)",
    allocation: 15,
    icon: "💎",
  },
  [SUBSCRIPTION_CATEGORIES.EMPLOYEE]: {
    displayName: "Employee",
    color: "bg-orange-500",
    textColor: "text-orange-600",
    bgColor: "bg-orange-50",
    description: "Employee reservation",
    allocation: 0,
    icon: "👔",
  },
  [SUBSCRIPTION_CATEGORIES.SHAREHOLDER]: {
    displayName: "Shareholder",
    color: "bg-pink-500",
    textColor: "text-pink-600",
    bgColor: "bg-pink-50",
    description: "Existing shareholder reservation",
    allocation: 0,
    icon: "📈",
  },
  [SUBSCRIPTION_CATEGORIES.OVERALL]: {
    displayName: "Overall",
    color: "bg-gray-500",
    textColor: "text-gray-600",
    bgColor: "bg-gray-50",
    description: "Combined all categories",
    allocation: 100,
    icon: "📊",
  },
};

// GMP Trends
export const GMP_TRENDS = {
  BULLISH: "bullish",
  BEARISH: "bearish",
  STABLE: "stable",
};

export const GMP_TREND_CONFIG = {
  [GMP_TRENDS.BULLISH]: {
    label: "Bullish",
    color: "text-green-600",
    bgColor: "bg-green-50",
    icon: "📈",
    description: "Upward trending",
  },
  [GMP_TRENDS.BEARISH]: {
    label: "Bearish",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: "📉",
    description: "Downward trending",
  },
  [GMP_TRENDS.STABLE]: {
    label: "Stable",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    icon: "➖",
    description: "No significant change",
  },
};

// Data Sources
export const DATA_SOURCES = {
  MANUAL: "manual",
  API: "api",
  LIVE_SERVICE: "live_service",
  SCRAPER: "scraper",
  BROKER: "broker",
  MARKET_MAKER: "market_maker",
  NSE: "nse",
  BSE: "bse",
};

// Chart Types
export const CHART_TYPES = {
  LINE: "line",
  AREA: "area",
  BAR: "bar",
  CANDLESTICK: "candlestick",
  SCATTER: "scatter",
};

// Time Ranges
export const TIME_RANGES = {
  "1H": { value: 1, unit: "hour", label: "1 Hour" },
  "6H": { value: 6, unit: "hour", label: "6 Hours" },
  "1D": { value: 1, unit: "day", label: "1 Day" },
  "3D": { value: 3, unit: "day", label: "3 Days" },
  "1W": { value: 7, unit: "day", label: "1 Week" },
  "2W": { value: 14, unit: "day", label: "2 Weeks" },
  "1M": { value: 30, unit: "day", label: "1 Month" },
  "3M": { value: 90, unit: "day", label: "3 Months" },
  "6M": { value: 180, unit: "day", label: "6 Months" },
  "1Y": { value: 365, unit: "day", label: "1 Year" },
};

// User Roles
export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

export const USER_PERMISSIONS = {
  [USER_ROLES.USER]: ["read"],
  [USER_ROLES.ADMIN]: ["read", "write", "manage"],
  [USER_ROLES.SUPER_ADMIN]: ["read", "write", "manage", "admin"],
};

// Notification Types
export const NOTIFICATION_TYPES = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  GMP_ALERT: "gmp_alert",
  SUBSCRIPTION_ALERT: "subscription_alert",
  ALLOTMENT_ALERT: "allotment_alert",
  LISTING_ALERT: "listing_alert",
};

export const NOTIFICATION_ICONS = {
  [NOTIFICATION_TYPES.INFO]: "ℹ️",
  [NOTIFICATION_TYPES.SUCCESS]: "✅",
  [NOTIFICATION_TYPES.WARNING]: "⚠️",
  [NOTIFICATION_TYPES.ERROR]: "❌",
  [NOTIFICATION_TYPES.GMP_ALERT]: "💰",
  [NOTIFICATION_TYPES.SUBSCRIPTION_ALERT]: "📊",
  [NOTIFICATION_TYPES.ALLOTMENT_ALERT]: "🎯",
  [NOTIFICATION_TYPES.LISTING_ALERT]: "📈",
};

// Allotment Status
export const ALLOTMENT_STATUS = {
  ALLOTTED: "ALLOTTED",
  NOT_ALLOTTED: "NOT_ALLOTTED",
  REFUND: "REFUND",
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
};

export const ALLOTMENT_STATUS_CONFIG = {
  [ALLOTMENT_STATUS.ALLOTTED]: {
    label: "Allotted",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "✅",
  },
  [ALLOTMENT_STATUS.NOT_ALLOTTED]: {
    label: "Not Allotted",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "❌",
  },
  [ALLOTMENT_STATUS.REFUND]: {
    label: "Refund",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: "💰",
  },
  [ALLOTMENT_STATUS.PENDING]: {
    label: "Pending",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    icon: "⏳",
  },
  [ALLOTMENT_STATUS.PARTIAL]: {
    label: "Partial",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "🔄",
  },
};

// Market Sentiment
export const MARKET_SENTIMENT = {
  VERY_NEGATIVE: "very_negative",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  POSITIVE: "positive",
  VERY_POSITIVE: "very_positive",
};

export const SENTIMENT_CONFIG = {
  [MARKET_SENTIMENT.VERY_NEGATIVE]: {
    label: "Very Negative",
    color: "text-red-700",
    bgColor: "bg-red-100",
    score: -2,
    icon: "📉📉",
  },
  [MARKET_SENTIMENT.NEGATIVE]: {
    label: "Negative",
    color: "text-red-600",
    bgColor: "bg-red-50",
    score: -1,
    icon: "📉",
  },
  [MARKET_SENTIMENT.NEUTRAL]: {
    label: "Neutral",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    score: 0,
    icon: "➖",
  },
  [MARKET_SENTIMENT.POSITIVE]: {
    label: "Positive",
    color: "text-green-600",
    bgColor: "bg-green-50",
    score: 1,
    icon: "📈",
  },
  [MARKET_SENTIMENT.VERY_POSITIVE]: {
    label: "Very Positive",
    color: "text-green-700",
    bgColor: "bg-green-100",
    score: 2,
    icon: "📈📈",
  },
};

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
};

// File Upload
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp", ".pdf"],
};

// WebSocket Events
export const WS_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
  GMP_UPDATE: "gmp_update",
  SUBSCRIPTION_UPDATE: "subscription_update",
  ALLOTMENT_UPDATE: "allotment_update",
  LISTING_UPDATE: "listing_update",
  ERROR: "error",
};

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "ipo_tracker_auth_token",
  REFRESH_TOKEN: "ipo_tracker_refresh_token",
  USER_PREFERENCES: "ipo_tracker_user_prefs",
  THEME: "ipo_tracker_theme",
  SEARCH_HISTORY: "ipo_tracker_search_history",
  WATCHLIST: "ipo_tracker_watchlist",
  DASHBOARD_CONFIG: "ipo_tracker_dashboard_config",
};

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  NETWORK_ERROR: "NETWORK_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
  WEBSOCKET_ERROR: "WEBSOCKET_ERROR",
};

// Success Messages
export const SUCCESS_MESSAGES = {
  IPO_CREATED: "IPO created successfully",
  IPO_UPDATED: "IPO updated successfully",
  IPO_DELETED: "IPO deleted successfully",
  GMP_ADDED: "GMP data added successfully",
  SUBSCRIPTION_UPDATED: "Subscription data updated successfully",
  ALLOTMENT_CHECKED: "Allotment status retrieved successfully",
  ALERT_CREATED: "Alert created successfully",
  WATCHLIST_ADDED: "Added to watchlist successfully",
  PREFERENCES_SAVED: "Preferences saved successfully",
};

// Error Messages
export const ERROR_MESSAGES = {
  GENERIC: "An unexpected error occurred. Please try again.",
  NETWORK: "Network error. Please check your connection.",
  VALIDATION: "Please check your input and try again.",
  AUTHENTICATION: "Please log in to continue.",
  AUTHORIZATION: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  RATE_LIMIT: "Too many requests. Please try again later.",
  SERVICE_DOWN: "Service is temporarily unavailable. Please try again later.",
};

// Feature Flags
export const FEATURES = {
  LIVE_TRACKING: process.env.NEXT_PUBLIC_ENABLE_LIVE_TRACKING === "true",
  WEBSOCKETS: process.env.NEXT_PUBLIC_ENABLE_WEBSOCKETS === "true",
  PREDICTIONS: process.env.NEXT_PUBLIC_ENABLE_PREDICTIONS === "true",
  ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true",
  NOTIFICATIONS: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === "true",
  DARK_MODE: process.env.NEXT_PUBLIC_ENABLE_DARK_MODE === "true",
};

// URL Patterns
export const URL_PATTERNS = {
  IPO_DETAIL: "/ipos/:id",
  IPO_LIST: "/ipos",
  DASHBOARD: "/dashboard",
  LIVE_TRACKING: "/dashboard/live",
  ANALYTICS: "/dashboard/analytics",
  ALLOTMENT: "/dashboard/allotments",
  WATCHLIST: "/dashboard/watchlist",
  SETTINGS: "/dashboard/settings",
};

// Currency Configuration
export const CURRENCY = {
  SYMBOL: "₹",
  CODE: "INR",
  LOCALE: "en-IN",
  DECIMAL_PLACES: 2,
};

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: "MMM DD, YYYY",
  DISPLAY_WITH_TIME: "MMM DD, YYYY HH:mm",
  API: "YYYY-MM-DD",
  API_WITH_TIME: "YYYY-MM-DDTHH:mm:ss.SSSZ",
  RELATIVE: "relative", // "2 hours ago", "yesterday", etc.
};

// Breakpoints (matching Tailwind CSS)
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  "2XL": 1536,
};

// Animation Durations
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  VERY_SLOW: 1000,
};

// Analytics Events
export const ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  IPO_VIEW: "ipo_view",
  GMP_CHECK: "gmp_check",
  SUBSCRIPTION_CHECK: "subscription_check",
  ALLOTMENT_CHECK: "allotment_check",
  ALERT_CREATED: "alert_created",
  WATCHLIST_ADD: "watchlist_add",
  SEARCH_PERFORMED: "search_performed",
  FILTER_APPLIED: "filter_applied",
};

// Default User Preferences
export const DEFAULT_PREFERENCES = {
  theme: "light",
  currency: "INR",
  timezone: "Asia/Kolkata",
  language: "en",
  notifications: {
    email: true,
    browser: true,
    sms: false,
  },
  dashboard: {
    autoRefresh: true,
    refreshInterval: 30000,
    showAnalytics: true,
    compactMode: false,
  },
  privacy: {
    analytics: true,
    cookies: true,
    dataSharing: false,
  },
};

// Validation Rules
export const VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  PHONE: /^[6-9]\d{9}$/,
  SYMBOL: /^[A-Z0-9]{1,20}$/,
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL: true,
  },
};

// Rate Limiting
export const RATE_LIMITS = {
  API_CALLS_PER_MINUTE: 60,
  SEARCH_REQUESTS_PER_MINUTE: 30,
  ALLOTMENT_CHECKS_PER_HOUR: 10,
  ALERT_CREATIONS_PER_DAY: 50,
};

// Cache Keys
export const CACHE_KEYS = {
  IPO_LIST: "ipo:list",
  IPO_DETAIL: "ipo:detail",
  GMP_DATA: "gmp:data",
  SUBSCRIPTION_DATA: "subscription:data",
  ANALYTICS_DATA: "analytics:data",
  USER_PROFILE: "user:profile",
  SEARCH_RESULTS: "search:results",
  MARKET_STATUS: "market:status",
};

// External APIs
export const EXTERNAL_APIS = {
  NSE: {
    BASE_URL: "https://www.nseindia.com/api",
    TIMEOUT: 10000,
    HEADERS: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  },
  BSE: {
    BASE_URL: "https://api.bseindia.com",
    TIMEOUT: 10000,
  },
};

// Environment Configuration
export const ENV_CONFIG = {
  IS_DEVELOPMENT: process.env.NODE_ENV === "development",
  IS_PRODUCTION: process.env.NODE_ENV === "production",
  IS_TEST: process.env.NODE_ENV === "test",
  API_URL: process.env.NEXT_PUBLIC_API_URL,
  WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  GA_ID: process.env.NEXT_PUBLIC_GA_ID,
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

// Export all constants as a single object for convenience
export const CONSTANTS = {
  API_CONFIG,
  IPO_STATUS,
  IPO_STATUS_LABELS,
  IPO_STATUS_COLORS,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_CATEGORY_CONFIG,
  GMP_TRENDS,
  GMP_TREND_CONFIG,
  DATA_SOURCES,
  CHART_TYPES,
  TIME_RANGES,
  USER_ROLES,
  USER_PERMISSIONS,
  NOTIFICATION_TYPES,
  NOTIFICATION_ICONS,
  ALLOTMENT_STATUS,
  ALLOTMENT_STATUS_CONFIG,
  MARKET_SENTIMENT,
  SENTIMENT_CONFIG,
  PAGINATION,
  FILE_UPLOAD,
  WS_EVENTS,
  STORAGE_KEYS,
  ERROR_CODES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  FEATURES,
  URL_PATTERNS,
  CURRENCY,
  DATE_FORMATS,
  BREAKPOINTS,
  ANIMATION_DURATION,
  ANALYTICS_EVENTS,
  DEFAULT_PREFERENCES,
  VALIDATION_RULES,
  RATE_LIMITS,
  CACHE_KEYS,
  EXTERNAL_APIS,
  ENV_CONFIG,
};

export default CONSTANTS;
