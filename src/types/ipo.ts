// IPO (Initial Public Offering) Type Definitions
// Comprehensive type definitions for IPO data structures and operations

export interface IPO {
  id: string;
  symbol: string; // Stock symbol (e.g., "TATAMOTORS")
  name: string; // Company name
  companyId?: string; // Reference to company table
  status: IPOStatus;
  sector?: string | null;
  industry?: string | null;

  // Pricing information
  minPrice: number; // Minimum issue price
  maxPrice: number; // Maximum issue price
  finalPrice?: number | null; // Final issue price
  listingPrice?: number | null; // Actual listing price
  currentPrice?: number | null; // Current market price

  // Size and lot information
  issueSize: bigint; // Total issue size in rupees
  lotSize: number; // Minimum lot size
  marketLot: number; // Market lot for retail investors

  // Important dates
  openDate: string; // IPO opening date (ISO string)
  closeDate: string; // IPO closing date (ISO string)
  listingDate?: string | null; // Expected/actual listing date
  allotmentDate?: string | null; // Allotment finalization date
  refundDate?: string | null; // Refund initiation date

  // Participants and intermediaries
  leadManager?: string | null; // Lead manager/book runner
  registrar?: string | null; // Registrar and transfer agent

  // Company financials (optional)
  faceValue?: number | null; // Face value per share
  bookValue?: number | null; // Book value per share
  marketCap?: bigint | null; // Market capitalization
  peRatio?: number | null; // Price to earnings ratio
  roe?: number | null; // Return on equity

  // IPO specific details
  reservationDetails?: string | null; // JSON string with category-wise reservation
  aboutCompany?: string | null; // Company description
  objectives?: string | null; // Objects of the issue
  risks?: string | null; // Risk factors

  // Metadata
  isActive: boolean; // Whether IPO is currently active
  createdAt: string; // Record creation timestamp
  updatedAt: string; // Record update timestamp

  // External links and documents
  prospectusUrl?: string | null; // Red herring prospectus URL
  applicationFormUrl?: string | null; // Application form URL
  exchangeUrl?: string | null; // Exchange listing URL
}

// IPO status enumeration
export type IPOStatus =
  | "upcoming" // IPO announced but not yet open
  | "open" // IPO currently accepting applications
  | "closed" // IPO closed but not yet listed
  | "listed" // IPO shares are trading on exchange
  | "withdrawn" // IPO withdrawn by company
  | "cancelled"; // IPO cancelled

// Extended IPO interface with analytics and current metrics
export interface IPOWithAnalytics extends IPO {
  currentMetrics?: {
    gmp?: {
      value: number;
      percentage: number;
      trend: "bullish" | "bearish" | "stable";
      timestamp: string;
    };
    subscription?: {
      overall: number;
      retail: number;
      qib: number;
      hni: number;
      timestamp: string;
    };
    allotment?: {
      totalApplications: number;
      allottedApplications: number;
      allotmentRate: number;
    };
  };

  // Computed fields
  daysRemaining?: number; // Days until close/listing
  investmentRequired?: {
    minimum: number; // Min investment (lotSize * minPrice)
    maximum: number; // Max investment (lotSize * maxPrice)
  };

  // Performance metrics (for listed IPOs)
  performance?: {
    listingGain: number; // Percentage gain on listing
    currentReturn: number; // Current return from issue price
    highestPrice: number; // Highest price since listing
    lowestPrice: number; // Lowest price since listing
  };
}

// IPO category-wise details
export interface IPOReservation {
  category: "RETAIL" | "QIB" | "HNI" | "EMPLOYEE" | "SHAREHOLDER";
  percentage: number; // Reservation percentage
  amount: bigint; // Reserved amount in rupees
  minimumBidLot: number;
  maximumBidLot: number;
}

// IPO timeline interface
export interface IPOTimeline {
  ipoId: string;
  events: IPOTimelineEvent[];
}

export interface IPOTimelineEvent {
  date: string; // ISO date string
  event: IPOEventType;
  status: "scheduled" | "completed" | "delayed" | "cancelled";
  description?: string;
  source?: string;
}

export type IPOEventType =
  | "announcement"
  | "prospectus_filed"
  | "price_band_fixed"
  | "bidding_opens"
  | "bidding_closes"
  | "allotment_finalized"
  | "refund_initiated"
  | "shares_credited"
  | "listing_date"
  | "trading_starts";

// IPO search and filter options
export interface IPOFilters {
  status?: IPOStatus | IPOStatus[];
  sector?: string;
  minPrice?: number;
  maxPrice?: number;
  minIssueSize?: number;
  maxIssueSize?: number;
  openDateFrom?: string;
  openDateTo?: string;
  listingDateFrom?: string;
  listingDateTo?: string;
  registrar?: string;
  leadManager?: string;
  includeAnalytics?: boolean;
  sortBy?: IPOSortField;
  sortOrder?: "asc" | "desc";
}

export type IPOSortField =
  | "openDate"
  | "closeDate"
  | "listingDate"
  | "issueSize"
  | "minPrice"
  | "maxPrice"
  | "name"
  | "symbol"
  | "createdAt";

// IPO API response types
export interface IPOResponse {
  success: boolean;
  data: IPO[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  summary?: IPOSummary;
  filters?: IPOFilters;
  timestamp: string;
}

export interface IPOSummary {
  totalIPOs: number;
  activeIPOs: number;
  upcomingIPOs: number;
  openIPOs: number;
  closedIPOs: number;
  listedIPOs: number;
  totalIssueSize: bigint;
  avgIssueSize: number;
  avgGMP: number;
  oversubscribedCount: number;
}

// IPO search suggestions
export interface IPOSearchSuggestion {
  type: "symbol" | "name" | "sector" | "registrar";
  value: string;
  display: string;
  category?: string;
  highlight?: string;
}

export interface IPOSearchResponse {
  success: boolean;
  suggestions: IPOSearchSuggestion[];
  total: number;
  query: string;
  timestamp: string;
}

// IPO creation and update payloads
export interface CreateIPOPayload {
  symbol: string;
  name: string;
  status: IPOStatus;
  minPrice: number;
  maxPrice: number;
  issueSize: string; // String to handle bigint serialization
  lotSize: number;
  openDate: string;
  closeDate: string;
  listingDate?: string;
  sector?: string;
  industry?: string;
  registrar?: string;
  leadManager?: string;
  aboutCompany?: string;
  objectives?: string;
  risks?: string;
  reservationDetails?: IPOReservation[];
  isActive?: boolean;
}

export interface UpdateIPOPayload extends Partial<CreateIPOPayload> {
  id: string;
  finalPrice?: number;
  listingPrice?: number;
  currentPrice?: number;
  allotmentDate?: string;
  refundDate?: string;
}

// IPO analytics interfaces
export interface IPOAnalytics {
  ipoId: string;
  gmpAnalytics?: {
    current: number;
    average: number;
    highest: number;
    lowest: number;
    trend: "bullish" | "bearish" | "stable";
    volatility: number;
    history: Array<{ value: number; timestamp: string }>;
  };
  subscriptionAnalytics?: {
    overall: number;
    categories: Record<string, number>;
    trend: "increasing" | "decreasing" | "stable";
    velocity: number; // Subscription per hour
    projection: number; // Final projected subscription
  };
  performanceAnalytics?: {
    listingGain: number;
    currentReturn: number;
    maxGain: number;
    maxLoss: number;
    volatilityIndex: number;
    beta: number;
  };
  marketSentiment?: {
    score: number; // -1 to 1
    label:
      | "very_negative"
      | "negative"
      | "neutral"
      | "positive"
      | "very_positive";
    confidence: number;
  };
  lastCalculated: string;
}

// IPO watchlist interface
export interface IPOWatchlist {
  id: string;
  userId: string;
  ipoId: string;
  notes?: string;
  alertPreferences?: {
    gmpChange: boolean;
    subscriptionMilestones: boolean;
    statusUpdates: boolean;
    priceUpdates: boolean;
  };
  addedAt: string;
}

// IPO comparison interface
export interface IPOComparison {
  ipos: IPOWithAnalytics[];
  metrics: {
    gmp: Array<{ ipoId: string; value: number; percentage: number }>;
    subscription: Array<{
      ipoId: string;
      overall: number;
      categories: Record<string, number>;
    }>;
    issueSize: Array<{ ipoId: string; size: number; rank: number }>;
    performance: Array<{
      ipoId: string;
      listingGain: number;
      currentReturn: number;
    }>;
  };
  timestamp: string;
}

// IPO document interface
export interface IPODocument {
  id: string;
  ipoId: string;
  type:
    | "prospectus"
    | "application_form"
    | "addendum"
    | "corrigendum"
    | "notice";
  title: string;
  description?: string;
  url: string;
  fileSize?: number;
  uploadedAt: string;
  isActive: boolean;
}

// Utility types
export type IPOIdentifier = Pick<IPO, "id" | "symbol">;
export type IPOBasicInfo = Pick<IPO, "id" | "symbol" | "name" | "status">;
export type IPOPricing = Pick<
  IPO,
  "minPrice" | "maxPrice" | "finalPrice" | "listingPrice"
>;
export type IPODates = Pick<
  IPO,
  "openDate" | "closeDate" | "listingDate" | "allotmentDate"
>;

// Constants
export const IPO_STATUSES = {
  UPCOMING: "upcoming",
  OPEN: "open",
  CLOSED: "closed",
  LISTED: "listed",
  WITHDRAWN: "withdrawn",
  CANCELLED: "cancelled",
} as const;

export const IPO_CATEGORIES = {
  RETAIL: "RETAIL",
  QIB: "QIB",
  HNI: "HNI",
  EMPLOYEE: "EMPLOYEE",
  SHAREHOLDER: "SHAREHOLDER",
} as const;

export const IPO_SORT_FIELDS = {
  OPEN_DATE: "openDate",
  CLOSE_DATE: "closeDate",
  LISTING_DATE: "listingDate",
  ISSUE_SIZE: "issueSize",
  MIN_PRICE: "minPrice",
  MAX_PRICE: "maxPrice",
  NAME: "name",
  SYMBOL: "symbol",
  CREATED_AT: "createdAt",
} as const;

// Helper function types
export type IPOComparator = (a: IPO, b: IPO) => number;
export type IPOValidator = (ipo: Partial<IPO>) => boolean;
export type IPOTransformer<T> = (ipo: IPO) => T;
export type IPOPredicate = (ipo: IPO) => boolean;

// Error types
export interface IPOError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface IPOValidationError extends IPOError {
  field: string;
  value: unknown;
  constraint: string;
}

// Webhook payload for IPO updates
export interface IPOWebhookPayload {
  event: "ipo.created" | "ipo.updated" | "ipo.status_changed" | "ipo.listed";
  data: {
    ipo: IPO;
    changes?: Partial<IPO>;
    previousStatus?: IPOStatus;
  };
  timestamp: string;
}
