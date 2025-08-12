// Validation Utilities
// Comprehensive validation functions for forms, data, and business logic

import {
  VALIDATION_RULES,
  IPO_STATUS,
  SUBSCRIPTION_CATEGORIES,
} from "./constants.js";

/**
 * Basic Data Type Validators
 */

// Check if value is empty or null
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

// Check if value is a valid string
export const isString = (value, options = {}) => {
  const { minLength = 0, maxLength = Infinity, allowEmpty = true } = options;

  if (typeof value !== "string") return false;
  if (!allowEmpty && isEmpty(value)) return false;

  return value.length >= minLength && value.length <= maxLength;
};

// Check if value is a valid number
export const isNumber = (value, options = {}) => {
  const { min = -Infinity, max = Infinity, integer = false } = options;

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || typeof num !== "number") return false;
  if (integer && !Number.isInteger(num)) return false;

  return num >= min && num <= max;
};

// Check if value is a valid date
export const isDate = (value, options = {}) => {
  const { minDate, maxDate, allowPast = true, allowFuture = true } = options;

  let date;
  try {
    date = typeof value === "string" ? new Date(value) : value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  } catch {
    return false;
  }

  const now = new Date();
  if (!allowPast && date < now) return false;
  if (!allowFuture && date > now) return false;
  if (minDate && date < new Date(minDate)) return false;
  if (maxDate && date > new Date(maxDate)) return false;

  return true;
};

// Check if value is a valid array
export const isArray = (value, options = {}) => {
  const { minLength = 0, maxLength = Infinity } = options;

  if (!Array.isArray(value)) return false;
  return value.length >= minLength && value.length <= maxLength;
};

/**
 * Format-Specific Validators
 */

// Validate email address
export const isValidEmail = (email) => {
  if (!isString(email, { allowEmpty: false })) return false;
  return VALIDATION_RULES.EMAIL.test(email.toLowerCase().trim());
};

// Validate PAN number
export const isValidPAN = (pan) => {
  if (!isString(pan, { allowEmpty: false })) return false;
  const cleanPAN = pan.toUpperCase().trim();
  return VALIDATION_RULES.PAN.test(cleanPAN);
};

// Validate phone number (Indian format)
export const isValidPhone = (phone) => {
  if (!isString(phone, { allowEmpty: false })) return false;
  const cleanPhone = phone.replace(/\D/g, "");
  return VALIDATION_RULES.PHONE.test(cleanPhone);
};

// Validate stock symbol
export const isValidSymbol = (symbol) => {
  if (!isString(symbol, { allowEmpty: false, minLength: 1, maxLength: 20 }))
    return false;
  return VALIDATION_RULES.SYMBOL.test(symbol.toUpperCase().trim());
};

// Validate password
export const isValidPassword = (password, options = {}) => {
  const rules = { ...VALIDATION_RULES.PASSWORD, ...options };

  if (!isString(password, { minLength: rules.MIN_LENGTH, allowEmpty: false })) {
    return { valid: false, errors: ["Password too short"] };
  }

  const errors = [];

  if (rules.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push("Password must contain uppercase letter");
  }

  if (rules.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push("Password must contain lowercase letter");
  }

  if (rules.REQUIRE_NUMBERS && !/\d/.test(password)) {
    errors.push("Password must contain number");
  }

  if (rules.REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain special character");
  }

  return { valid: errors.length === 0, errors };
};

// Validate URL
export const isValidURL = (url) => {
  if (!isString(url, { allowEmpty: false })) return false;

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * IPO-Specific Validators
 */

// Validate IPO data
export const validateIPO = (ipoData) => {
  const errors = [];

  // Required fields
  if (!isString(ipoData.symbol, { allowEmpty: false, maxLength: 20 })) {
    errors.push("Symbol is required and must be valid");
  }

  if (!isString(ipoData.name, { allowEmpty: false, maxLength: 200 })) {
    errors.push("Company name is required");
  }

  if (!Object.values(IPO_STATUS).includes(ipoData.status)) {
    errors.push("Invalid IPO status");
  }

  // Price validation
  if (!isNumber(ipoData.minPrice, { min: 0.01, max: 100000 })) {
    errors.push("Minimum price must be a valid positive number");
  }

  if (!isNumber(ipoData.maxPrice, { min: 0.01, max: 100000 })) {
    errors.push("Maximum price must be a valid positive number");
  }

  if (
    ipoData.minPrice &&
    ipoData.maxPrice &&
    ipoData.minPrice >= ipoData.maxPrice
  ) {
    errors.push("Maximum price must be greater than minimum price");
  }

  // Issue size validation
  if (!isNumber(ipoData.issueSize, { min: 1000000 })) {
    // Min 10 lakh
    errors.push("Issue size must be at least ₹10 lakh");
  }

  if (!isNumber(ipoData.lotSize, { min: 1, integer: true })) {
    errors.push("Lot size must be a positive integer");
  }

  // Date validation
  if (!isDate(ipoData.openDate)) {
    errors.push("Open date must be a valid date");
  }

  if (!isDate(ipoData.closeDate)) {
    errors.push("Close date must be a valid date");
  }

  if (ipoData.openDate && ipoData.closeDate) {
    const openDate = new Date(ipoData.openDate);
    const closeDate = new Date(ipoData.closeDate);

    if (closeDate <= openDate) {
      errors.push("Close date must be after open date");
    }

    const diffDays = (closeDate - openDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 10) {
      errors.push("IPO duration cannot exceed 10 days");
    }
  }

  // Optional field validation
  if (
    ipoData.listingDate &&
    !isDate(ipoData.listingDate, { minDate: ipoData.closeDate })
  ) {
    errors.push("Listing date must be after close date");
  }

  if (ipoData.sector && !isString(ipoData.sector, { maxLength: 100 })) {
    errors.push("Sector must be a valid string");
  }

  return { valid: errors.length === 0, errors };
};

// Validate GMP data
export const validateGMP = (gmpData) => {
  const errors = [];

  if (!isString(gmpData.ipoId, { allowEmpty: false })) {
    errors.push("IPO ID is required");
  }

  if (!isNumber(gmpData.value, { min: -10000, max: 10000 })) {
    errors.push("GMP value must be between -₹10,000 and ₹10,000");
  }

  if (
    gmpData.percentage !== undefined &&
    !isNumber(gmpData.percentage, { min: -1000, max: 1000 })
  ) {
    errors.push("GMP percentage must be between -1000% and 1000%");
  }

  if (
    gmpData.volume !== undefined &&
    gmpData.volume !== null &&
    !isNumber(gmpData.volume, { min: 0, integer: true })
  ) {
    errors.push("Volume must be a non-negative integer");
  }

  if (
    gmpData.bidPrice !== undefined &&
    gmpData.bidPrice !== null &&
    !isNumber(gmpData.bidPrice, { min: 0 })
  ) {
    errors.push("Bid price must be non-negative");
  }

  if (
    gmpData.askPrice !== undefined &&
    gmpData.askPrice !== null &&
    !isNumber(gmpData.askPrice, { min: 0 })
  ) {
    errors.push("Ask price must be non-negative");
  }

  if (
    gmpData.bidPrice &&
    gmpData.askPrice &&
    gmpData.bidPrice >= gmpData.askPrice
  ) {
    errors.push("Ask price must be greater than bid price");
  }

  if (!isString(gmpData.source, { allowEmpty: false, maxLength: 50 })) {
    errors.push("Source is required");
  }

  return { valid: errors.length === 0, errors };
};

// Validate subscription data
export const validateSubscription = (subscriptionData) => {
  const errors = [];

  if (!isString(subscriptionData.ipoId, { allowEmpty: false })) {
    errors.push("IPO ID is required");
  }

  if (
    !Object.values(SUBSCRIPTION_CATEGORIES).includes(subscriptionData.category)
  ) {
    errors.push("Invalid subscription category");
  }

  if (!isNumber(subscriptionData.subscriptionRatio, { min: 0, max: 1000 })) {
    errors.push("Subscription ratio must be between 0 and 1000");
  }

  if (!isNumber(subscriptionData.bidCount, { min: 0, integer: true })) {
    errors.push("Bid count must be a non-negative integer");
  }

  // Quantity validation (BigInt or string representation)
  if (subscriptionData.quantity !== undefined) {
    const quantityStr = subscriptionData.quantity.toString();
    if (!/^\d+$/.test(quantityStr) || quantityStr === "0") {
      errors.push("Quantity must be a positive integer");
    }
  }

  return { valid: errors.length === 0, errors };
};

// Validate allotment data
export const validateAllotment = (allotmentData) => {
  const errors = [];

  if (!isValidPAN(allotmentData.pan)) {
    errors.push("Valid PAN number is required");
  }

  if (!isString(allotmentData.ipoId, { allowEmpty: false })) {
    errors.push("IPO ID is required");
  }

  if (
    allotmentData.applicationNumber &&
    !isString(allotmentData.applicationNumber, {
      allowEmpty: false,
      maxLength: 50,
    })
  ) {
    errors.push("Application number must be valid");
  }

  if (
    allotmentData.appliedQuantity !== undefined &&
    !isNumber(allotmentData.appliedQuantity, { min: 1, integer: true })
  ) {
    errors.push("Applied quantity must be a positive integer");
  }

  if (
    allotmentData.allottedQuantity !== undefined &&
    !isNumber(allotmentData.allottedQuantity, { min: 0, integer: true })
  ) {
    errors.push("Allotted quantity must be a non-negative integer");
  }

  if (
    allotmentData.appliedQuantity &&
    allotmentData.allottedQuantity &&
    allotmentData.allottedQuantity > allotmentData.appliedQuantity
  ) {
    errors.push("Allotted quantity cannot exceed applied quantity");
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Form Validators
 */

// Validate search query
export const validateSearchQuery = (query) => {
  if (!isString(query, { allowEmpty: false, minLength: 2, maxLength: 100 })) {
    return { valid: false, errors: ["Search query must be 2-100 characters"] };
  }

  // Check for SQL injection patterns
  const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i;
  if (sqlPatterns.test(query)) {
    return { valid: false, errors: ["Invalid search query"] };
  }

  return { valid: true, errors: [] };
};

// Validate pagination parameters
export const validatePagination = (page, limit) => {
  const errors = [];

  if (!isNumber(page, { min: 1, integer: true })) {
    errors.push("Page must be a positive integer");
  }

  if (!isNumber(limit, { min: 1, max: 100, integer: true })) {
    errors.push("Limit must be between 1 and 100");
  }

  return { valid: errors.length === 0, errors };
};

// Validate filter parameters
export const validateFilters = (filters) => {
  const errors = [];

  if (filters.status && !Object.values(IPO_STATUS).includes(filters.status)) {
    errors.push("Invalid status filter");
  }

  if (filters.minPrice && !isNumber(filters.minPrice, { min: 0 })) {
    errors.push("Minimum price filter must be non-negative");
  }

  if (filters.maxPrice && !isNumber(filters.maxPrice, { min: 0 })) {
    errors.push("Maximum price filter must be non-negative");
  }

  if (
    filters.minPrice &&
    filters.maxPrice &&
    filters.minPrice >= filters.maxPrice
  ) {
    errors.push("Maximum price must be greater than minimum price");
  }

  if (
    filters.timeRange &&
    !isNumber(filters.timeRange, { min: 1, max: 365, integer: true })
  ) {
    errors.push("Time range must be between 1 and 365 days");
  }

  return { valid: errors.length === 0, errors };
};

/**
 * File Upload Validators
 */

// Validate file upload
export const validateFileUpload = (file, options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB
    allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"],
  } = options;

  const errors = [];

  if (!file) {
    errors.push("File is required");
    return { valid: false, errors };
  }

  if (file.size > maxSize) {
    errors.push(
      `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`
    );
  }

  if (!allowedTypes.includes(file.type)) {
    errors.push(
      `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`
    );
  }

  const extension = "." + file.name.split(".").pop().toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    errors.push(
      `File extension not allowed. Allowed extensions: ${allowedExtensions.join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Security Validators
 */

// Validate input for XSS
export const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;

  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

// Validate CSRF token
export const isValidCSRFToken = (token, expectedToken) => {
  if (
    !isString(token, { allowEmpty: false }) ||
    !isString(expectedToken, { allowEmpty: false })
  ) {
    return false;
  }

  return token === expectedToken;
};

// Check for SQL injection patterns
export const hasSQLInjection = (input) => {
  if (typeof input !== "string") return false;

  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(\b(OR|AND)\s+\w+\s*=\s*\w+)/i,
    /('|(\\x27)|(\\x2D\\x2D)|(\;)|(\%27))/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\\x27)|(\')|((\%3B)|(;)))/i,
  ];

  return patterns.some((pattern) => pattern.test(input));
};

/**
 * Business Logic Validators
 */

// Validate IPO application eligibility
export const validateIPOEligibility = (ipoData, userData) => {
  const errors = [];

  if (ipoData.status !== IPO_STATUS.OPEN) {
    errors.push("IPO is not currently open for applications");
  }

  const now = new Date();
  const closeDate = new Date(ipoData.closeDate);
  if (closeDate <= now) {
    errors.push("IPO application period has ended");
  }

  if (!userData.isEligible) {
    errors.push("User is not eligible for IPO applications");
  }

  if (!userData.kycCompleted) {
    errors.push("KYC verification required for IPO applications");
  }

  return { valid: errors.length === 0, errors };
};

// Validate investment amount
export const validateInvestmentAmount = (
  amount,
  ipoData,
  category = "RETAIL"
) => {
  const errors = [];

  if (!isNumber(amount, { min: 0 })) {
    errors.push("Investment amount must be a positive number");
    return { valid: false, errors };
  }

  const minInvestment = ipoData.lotSize * ipoData.minPrice;
  const maxInvestment = ipoData.lotSize * ipoData.maxPrice;

  if (amount < minInvestment) {
    errors.push(`Minimum investment is ₹${minInvestment.toLocaleString()}`);
  }

  // Category-specific limits
  const categoryLimits = {
    RETAIL: 200000, // ₹2 lakh
    HNI: Infinity,
    QIB: Infinity,
  };

  if (category === "RETAIL" && amount > categoryLimits.RETAIL) {
    errors.push("Retail investors can invest maximum ₹2 lakh");
  }

  // Check lot size multiples
  if (amount % (ipoData.lotSize * ipoData.minPrice) !== 0) {
    errors.push("Investment must be in multiples of lot size");
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Composite Validators
 */

// Validate complete form data
export const validateFormData = (formData, schema) => {
  const errors = {};
  let isValid = true;

  for (const [field, rules] of Object.entries(schema)) {
    const value = formData[field];
    const fieldErrors = [];

    // Required validation
    if (rules.required && isEmpty(value)) {
      fieldErrors.push(`${field} is required`);
    }

    // Type validation
    if (!isEmpty(value)) {
      if (
        rules.type === "string" &&
        !isString(value, rules.stringOptions || {})
      ) {
        fieldErrors.push(`${field} must be a valid string`);
      }

      if (
        rules.type === "number" &&
        !isNumber(value, rules.numberOptions || {})
      ) {
        fieldErrors.push(`${field} must be a valid number`);
      }

      if (rules.type === "email" && !isValidEmail(value)) {
        fieldErrors.push(`${field} must be a valid email address`);
      }

      if (rules.type === "date" && !isDate(value, rules.dateOptions || {})) {
        fieldErrors.push(`${field} must be a valid date`);
      }

      // Custom validation
      if (rules.custom && typeof rules.custom === "function") {
        const customResult = rules.custom(value);
        if (customResult !== true) {
          fieldErrors.push(customResult);
        }
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
      isValid = false;
    }
  }

  return { valid: isValid, errors };
};

/**
 * Export all validators
 */
export const validators = {
  // Basic types
  isEmpty,
  isString,
  isNumber,
  isDate,
  isArray,

  // Format specific
  isValidEmail,
  isValidPAN,
  isValidPhone,
  isValidSymbol,
  isValidPassword,
  isValidURL,

  // IPO specific
  validateIPO,
  validateGMP,
  validateSubscription,
  validateAllotment,

  // Form validators
  validateSearchQuery,
  validatePagination,
  validateFilters,

  // File upload
  validateFileUpload,

  // Security
  sanitizeInput,
  isValidCSRFToken,
  hasSQLInjection,

  // Business logic
  validateIPOEligibility,
  validateInvestmentAmount,

  // Composite
  validateFormData,
};

export default validators;
