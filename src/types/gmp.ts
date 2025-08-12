// GMP (Grey Market Premium) Type Definitions
// Grey Market Premium represents the premium/discount at which IPO shares trade
// in the unofficial market before official listing

export interface GMP {
  id: string;
  ipoId: string;
  value: number; // Premium/discount in rupees
  percentage: number; // Premium/discount as percentage
  volume?: number | null; // Trading volume
  bidPrice?: number | null; // Buyer's price
  askPrice?: number | null; // Seller's price
  timestamp: string; // ISO date string
  source: string; // Data source (e.g., 'manual', 'api', 'live_service')
  metadata?: string | null; // Additional JSON metadata
  createdAt?: string; // Record creation timestamp
  updatedAt?: string; // Record update timestamp
}

// Extended GMP interface with computed fields
export interface GMPWithAnalytics extends GMP {
  spread?: number; // Difference between ask and bid price
  age?: number; // Milliseconds since timestamp
  trend?: GMPTrend; // Market trend indicator
  isLive?: boolean; // Whether data is from live source
  history?: GMPHistoryPoint[]; // Historical data points
  ipo?: {
    symbol: string;
    name: string;
    maxPrice?: number;
    minPrice?: number;
    status?: string;
  };
}

// GMP trend types
export type GMPTrend = "bullish" | "bearish" | "stable";

// GMP source types
export type GMPSource =
  | "manual"
  | "api"
  | "live_service"
  | "scraper"
  | "broker"
  | "market_maker";

// GMP history point
export interface GMPHistoryPoint {
  value: number;
  volume?: number;
  timestamp: string;
  source?: string;
}

// GMP statistics interface
export interface GMPStats {
  count: number;
  latest: GMP | null;
  average: number;
  highest: number;
  lowest: number;
  totalVolume: number;
  trend: GMPTrend;
  volatility: number;
  sources: string[];
}

// GMP filter options
export interface GMPFilters {
  ipoId?: string;
  symbol?: string;
  source?: GMPSource;
  timeRange?: number; // Days
  minValue?: number;
  maxValue?: number;
  live?: boolean;
}

// GMP API response
export interface GMPResponse {
  success: boolean;
  data: GMP[];
  statistics?: GMPStats;
  metadata: {
    ipoId?: string;
    symbol?: string;
    timeRange: number;
    totalCount: number;
    live: boolean;
  };
  timestamp: string;
}

// GMP live tracker response
export interface GMPLiveResponse {
  success: boolean;
  data: GMPWithAnalytics[];
  metadata: {
    count: number;
    serverTime: number;
    clientId?: string;
  };
  service: {
    isRunning: boolean;
    lastUpdate?: string;
  };
  timestamp: string;
}

// GMP update payload for WebSocket
export interface GMPUpdatePayload {
  type: "gmp_update";
  ipoId: string;
  symbol: string;
  value: number;
  percentage: number;
  volume?: number;
  timestamp: number;
  source: string;
  previousValue?: number;
}

// GMP calculation helpers
export interface GMPCalculation {
  value: number; // Actual GMP value
  percentage: number; // GMP percentage
  listingGain?: number; // Expected listing gain
  investmentReturn?: number; // Return on investment
  riskLevel: "low" | "medium" | "high";
}

// GMP alert configuration
export interface GMPAlert {
  id: string;
  userId: string;
  ipoId: string;
  symbol: string;
  triggerType: "above" | "below" | "change";
  triggerValue: number;
  isActive: boolean;
  message?: string;
  createdAt: string;
}

// GMP subscription for real-time updates
export interface GMPSubscription {
  id: string;
  clientId: string;
  ipoIds: string[];
  symbols: string[];
  preferences: {
    updateInterval: number; // milliseconds
    includeHistory: boolean;
    includeTrends: boolean;
    minSignificantChange: number; // minimum change to notify
  };
  createdAt: number;
  isActive: boolean;
}

// Utility types
export type GMPValue = Pick<GMP, "value" | "percentage" | "timestamp">;
export type GMPIdentifier = Pick<GMP, "id" | "ipoId">;
export type GMPPricing = Pick<GMP, "bidPrice" | "askPrice" | "spread">;

// Constants
export const GMP_TRENDS = {
  BULLISH: "bullish",
  BEARISH: "bearish",
  STABLE: "stable",
} as const;

export const GMP_SOURCES = {
  MANUAL: "manual",
  API: "api",
  LIVE_SERVICE: "live_service",
  SCRAPER: "scraper",
  BROKER: "broker",
  MARKET_MAKER: "market_maker",
} as const;

// Helper function types
export type GMPComparator = (a: GMP, b: GMP) => number;
export type GMPValidator = (gmp: Partial<GMP>) => boolean;
export type GMPTransformer<T> = (gmp: GMP) => T;

// Error types
export interface GMPError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface GMPValidationError extends GMPError {
  field: string;
  value: unknown;
  constraint: string;
}
