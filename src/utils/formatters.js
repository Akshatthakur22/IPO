// Utility Functions for Data Formatting and Conversion
// Centralized formatting utilities for consistent data display across the application

import { CURRENCY, DATE_FORMATS, BREAKPOINTS } from "./constants.js";

/**
 * Currency Formatting Utilities
 */

// Format currency with Indian locale and rupee symbol
export const formatCurrency = (amount, options = {}) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return options.fallback || "₹--";
  }

  const {
    locale = CURRENCY.LOCALE,
    currency = CURRENCY.CODE,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    compact = false,
    showSymbol = true,
    fallback = "₹--",
  } = options;

  try {
    const numAmount =
      typeof amount === "string" ? parseFloat(amount) : Number(amount);

    if (compact) {
      return formatCompactCurrency(numAmount, options);
    }

    const formatted = new Intl.NumberFormat(locale, {
      style: showSymbol ? "currency" : "decimal",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(numAmount);

    return formatted;
  } catch (error) {
    console.warn("Currency formatting error:", error);
    return fallback;
  }
};

// Format large numbers in compact form (e.g., 1.2Cr, 500K)
export const formatCompactCurrency = (amount, options = {}) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return options.fallback || "₹--";
  }

  const { showSymbol = true, precision = 1 } = options;
  const numAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount);
  const symbol = showSymbol ? "₹" : "";

  if (numAmount >= 10000000) {
    // 1 Crore
    const crores = numAmount / 10000000;
    return `${symbol}${crores.toFixed(precision)}Cr`;
  } else if (numAmount >= 100000) {
    // 1 Lakh
    const lakhs = numAmount / 100000;
    return `${symbol}${lakhs.toFixed(precision)}L`;
  } else if (numAmount >= 1000) {
    // 1 Thousand
    const thousands = numAmount / 1000;
    return `${symbol}${thousands.toFixed(precision)}K`;
  } else {
    return `${symbol}${numAmount.toLocaleString("en-IN")}`;
  }
};

// Format percentage values
export const formatPercentage = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return options.fallback || "--%";
  }

  const { precision = 2, showSign = false, fallback = "--%" } = options;

  try {
    const numValue =
      typeof value === "string" ? parseFloat(value) : Number(value);
    const sign = showSign && numValue > 0 ? "+" : "";
    return `${sign}${numValue.toFixed(precision)}%`;
  } catch (error) {
    console.warn("Percentage formatting error:", error);
    return fallback;
  }
};

// Format subscription ratios (e.g., 2.5x, 10.2x)
export const formatSubscriptionRatio = (ratio, options = {}) => {
  if (ratio === null || ratio === undefined || isNaN(ratio)) {
    return options.fallback || "--x";
  }

  const { precision = 1, fallback = "--x" } = options;

  try {
    const numRatio =
      typeof ratio === "string" ? parseFloat(ratio) : Number(ratio);
    return `${numRatio.toFixed(precision)}x`;
  } catch (error) {
    console.warn("Subscription ratio formatting error:", error);
    return fallback;
  }
};

/**
 * Date and Time Formatting Utilities
 */

// Format date with various options
export const formatDate = (
  date,
  format = DATE_FORMATS.DISPLAY,
  options = {}
) => {
  if (!date) return options.fallback || "--";

  const {
    locale = "en-IN",
    timezone = "Asia/Kolkata",
    fallback = "--",
  } = options;

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return fallback;
    }

    switch (format) {
      case "relative":
        return formatRelativeTime(dateObj, options);
      case DATE_FORMATS.DISPLAY:
        return dateObj.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: timezone,
        });
      case DATE_FORMATS.DISPLAY_WITH_TIME:
        return dateObj.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        });
      case DATE_FORMATS.API:
        return dateObj.toISOString().split("T")[0];
      case DATE_FORMATS.API_WITH_TIME:
        return dateObj.toISOString();
      default:
        return dateObj.toLocaleDateString(locale, { timeZone: timezone });
    }
  } catch (error) {
    console.warn("Date formatting error:", error);
    return fallback;
  }
};

// Format relative time (e.g., "2 hours ago", "in 3 days")
export const formatRelativeTime = (date, options = {}) => {
  if (!date) return options.fallback || "--";

  const { fallback = "--", locale = "en" } = options;

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diffMs = dateObj.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (Math.abs(diffMinutes) < 1) {
      return "Just now";
    } else if (Math.abs(diffMinutes) < 60) {
      return diffMinutes > 0
        ? `in ${diffMinutes}m`
        : `${Math.abs(diffMinutes)}m ago`;
    } else if (Math.abs(diffHours) < 24) {
      return diffHours > 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
    } else if (Math.abs(diffDays) < 7) {
      return diffDays > 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
    } else {
      return formatDate(date, DATE_FORMATS.DISPLAY, options);
    }
  } catch (error) {
    console.warn("Relative time formatting error:", error);
    return fallback;
  }
};

// Calculate and format days remaining
export const calculateDaysRemaining = (
  status,
  openDate,
  closeDate,
  listingDate
) => {
  const now = new Date();

  try {
    switch (status) {
      case "upcoming":
        if (openDate) {
          const open = new Date(openDate);
          const days = Math.ceil((open.getTime() - now.getTime()) / 86400000);
          return days > 0 ? days : 0;
        }
        break;
      case "open":
        if (closeDate) {
          const close = new Date(closeDate);
          const days = Math.ceil((close.getTime() - now.getTime()) / 86400000);
          return days > 0 ? days : 0;
        }
        break;
      case "closed":
        if (listingDate) {
          const listing = new Date(listingDate);
          const days = Math.ceil(
            (listing.getTime() - now.getTime()) / 86400000
          );
          return days > 0 ? days : null;
        }
        break;
      default:
        return null;
    }
  } catch (error) {
    console.warn("Days calculation error:", error);
    return null;
  }

  return null;
};

/**
 * Number Formatting Utilities
 */

// Format large numbers with Indian numbering system
export const formatNumber = (number, options = {}) => {
  if (number === null || number === undefined || isNaN(number)) {
    return options.fallback || "--";
  }

  const {
    locale = "en-IN",
    compact = false,
    precision = 0,
    fallback = "--",
  } = options;

  try {
    const numValue =
      typeof number === "string" ? parseFloat(number) : Number(number);

    if (compact) {
      return formatCompactNumber(numValue, options);
    }

    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(numValue);
  } catch (error) {
    console.warn("Number formatting error:", error);
    return fallback;
  }
};

// Format numbers in compact form (e.g., 1.2M, 500K)
export const formatCompactNumber = (number, options = {}) => {
  if (number === null || number === undefined || isNaN(number)) {
    return options.fallback || "--";
  }

  const { precision = 1 } = options;
  const numValue =
    typeof number === "string" ? parseFloat(number) : Number(number);

  if (numValue >= 10000000) {
    // 1 Crore
    return `${(numValue / 10000000).toFixed(precision)}Cr`;
  } else if (numValue >= 100000) {
    // 1 Lakh
    return `${(numValue / 100000).toFixed(precision)}L`;
  } else if (numValue >= 1000) {
    // 1 Thousand
    return `${(numValue / 1000).toFixed(precision)}K`;
  } else {
    return numValue.toLocaleString("en-IN");
  }
};

// Format volume numbers
export const formatVolume = (volume, options = {}) => {
  if (volume === null || volume === undefined || isNaN(volume)) {
    return options.fallback || "--";
  }

  return formatCompactNumber(volume, { precision: 1, ...options });
};

/**
 * Text Formatting Utilities
 */

// Truncate text with ellipsis
export const truncateText = (text, maxLength = 100, options = {}) => {
  if (!text || typeof text !== "string") {
    return options.fallback || "";
  }

  const { suffix = "...", fallback = "" } = options;

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
};

// Capitalize first letter of each word
export const capitalizeWords = (text) => {
  if (!text || typeof text !== "string") return "";

  return text.replace(/\b\w/g, (char) => char.toUpperCase());
};

// Convert to title case
export const toTitleCase = (text) => {
  if (!text || typeof text !== "string") return "";

  return text.toLowerCase().replace(/\b\w+/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
};

// Format IPO symbol for display
export const formatSymbol = (symbol) => {
  if (!symbol || typeof symbol !== "string") return "";
  return symbol.toUpperCase().trim();
};

/**
 * Status and Badge Formatting
 */

// Format IPO status for display
export const formatIPOStatus = (status) => {
  if (!status) return "";

  const statusMap = {
    upcoming: "Upcoming",
    open: "Open",
    closed: "Closed",
    listed: "Listed",
    withdrawn: "Withdrawn",
    cancelled: "Cancelled",
  };

  return statusMap[status.toLowerCase()] || capitalizeWords(status);
};

// Format subscription category for display
export const formatCategory = (category) => {
  if (!category) return "";

  const categoryMap = {
    RETAIL: "Retail",
    QIB: "QIB",
    HNI: "HNI",
    EMPLOYEE: "Employee",
    SHAREHOLDER: "Shareholder",
    OVERALL: "Overall",
  };

  return categoryMap[category.toUpperCase()] || capitalizeWords(category);
};

/**
 * Data Validation and Sanitization
 */

// Sanitize and format PAN number
export const formatPAN = (pan) => {
  if (!pan || typeof pan !== "string") return "";
  return pan
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 10);
};

// Format phone number
export const formatPhone = (phone) => {
  if (!phone || typeof phone !== "string") return "";
  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{5})(\d{5})/, "$1-$2");
  }

  return cleaned;
};

// Format email for display
export const formatEmail = (email) => {
  if (!email || typeof email !== "string") return "";
  return email.toLowerCase().trim();
};

/**
 * Chart and Analytics Formatting
 */

// Format chart data points
export const formatChartValue = (value, type = "number", options = {}) => {
  switch (type) {
    case "currency":
      return formatCurrency(value, options);
    case "percentage":
      return formatPercentage(value, options);
    case "ratio":
      return formatSubscriptionRatio(value, options);
    case "compact":
      return formatCompactNumber(value, options);
    default:
      return formatNumber(value, options);
  }
};

// Format tooltip content for charts
export const formatTooltip = (data, options = {}) => {
  const { label, value, type = "number" } = data;
  const formattedValue = formatChartValue(value, type, options);

  return `${label}: ${formattedValue}`;
};

/**
 * URL and File Formatting
 */

// Format file size
export const formatFileSize = (bytes, options = {}) => {
  if (bytes === 0 || !bytes) return "0 Bytes";

  const { precision = 2 } = options;
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(precision)) + " " + sizes[i]
  );
};

// Create slug from text
export const createSlug = (text) => {
  if (!text || typeof text !== "string") return "";

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/**
 * Color and Theme Utilities
 */

// Get color based on value and thresholds
export const getValueColor = (value, thresholds = {}) => {
  const { positive = 0, negative = 0, neutral = "gray" } = thresholds;

  if (value > positive) return "green";
  if (value < negative) return "red";
  return neutral;
};

// Get GMP color based on value
export const getGMPColor = (value) => {
  if (value > 50) return "text-green-600";
  if (value > 0) return "text-green-500";
  if (value < 0) return "text-red-500";
  return "text-gray-600";
};

// Get subscription color based on ratio
export const getSubscriptionColor = (ratio) => {
  if (ratio >= 5) return "text-green-600";
  if (ratio >= 2) return "text-blue-600";
  if (ratio >= 1) return "text-yellow-600";
  return "text-red-600";
};

/**
 * Responsive Utilities
 */

// Get responsive class based on screen size
export const getResponsiveClass = (classes = {}) => {
  const { mobile = "", tablet = "", desktop = "" } = classes;
  return `${mobile} md:${tablet} lg:${desktop}`.trim();
};

// Check if screen size matches breakpoint
export const matchesBreakpoint = (width, breakpoint) => {
  return width >= BREAKPOINTS[breakpoint.toUpperCase()];
};

/**
 * Export all formatters
 */
export const formatters = {
  // Currency
  formatCurrency,
  formatCompactCurrency,
  formatPercentage,
  formatSubscriptionRatio,

  // Date/Time
  formatDate,
  formatRelativeTime,
  calculateDaysRemaining,

  // Numbers
  formatNumber,
  formatCompactNumber,
  formatVolume,

  // Text
  truncateText,
  capitalizeWords,
  toTitleCase,
  formatSymbol,

  // Status
  formatIPOStatus,
  formatCategory,

  // Validation
  formatPAN,
  formatPhone,
  formatEmail,

  // Charts
  formatChartValue,
  formatTooltip,

  // Files/URLs
  formatFileSize,
  createSlug,

  // Colors
  getValueColor,
  getGMPColor,
  getSubscriptionColor,

  // Responsive
  getResponsiveClass,
  matchesBreakpoint,
};

export default formatters;
