// Subscription Type Definitions
// IPO subscription data structures for tracking bidding and application details

export interface SubscriptionData {
  id: string;
  ipoId: string;
  category: SubscriptionCategory;
  subCategory?: string | null; // Additional category subdivision
  quantity: bigint; // Total quantity bid
  bidCount: number; // Number of bids/applications
  subscriptionRatio: number; // Times oversubscribed (e.g., 2.5x)
  timestamp: string; // ISO date string
  metadata?: string | null; // Additional JSON metadata
  createdAt?: string; // Record creation timestamp
  updatedAt?: string; // Record update timestamp
}

// Subscription categories as per SEBI guidelines
export type SubscriptionCategory =
  | "RETAIL" // Retail Individual Investors (up to ₹2 lakh)
  | "QIB" // Qualified Institutional Buyers
  | "HNI" // High Net Worth Individuals (above ₹2 lakh)
  | "EMPLOYEE" // Employee quota
  | "SHAREHOLDER" // Existing shareholder quota
  | "OVERALL"; // Overall subscription across all categories

// Extended subscription interface with analytics
export interface SubscriptionWithAnalytics extends SubscriptionData {
  ipo?: {
    symbol: string;
    name: string;
    status: string;
    issueSize: bigint;
    lotSize: number;
    maxPrice: number;
    closeDate?: string;
  };

  // Computed analytics
  percentageOfIssue?: number; // Percentage of total issue size
  averageBidSize?: number; // Average bid amount per application
  trend?: SubscriptionTrend; // Subscription trend
  velocity?: number; // Subscription rate per hour
  projection?: number; // Projected final subscription ratio

  // Category comparisons
  relativeToPrevious?: number; // Change from previous reading
  categoryRank?: number; // Rank among categories
  isOversubscribed: boolean; // Whether ratio > 1.0
}

// Subscription trend types
export type SubscriptionTrend =
  | "increasing"
  | "decreasing"
  | "stable"
  | "accelerating"
  | "decelerating";

// Subscription statistics interface
export interface SubscriptionStats {
  count: number;
  current: SubscriptionData | null;
  peak: number; // Highest subscription ratio
  average: number; // Average subscription ratio
  totalQuantity: bigint;
  totalBids: number;
  oversubscribed: number; // Count of oversubscribed categories
  categories: string[];
  byCategory: Record<SubscriptionCategory, CategoryStats>;
  isOversubscribed: boolean;
  subscriptionVelocity: number; // Subscription rate per hour
  projectedFinal?: number; // Projected final subscription
}

// Category-specific statistics
export interface CategoryStats {
  count: number;
  latestRatio: number;
  totalQuantity: bigint;
  totalBids: number;
  averageRatio: number;
  peakRatio: number;
  trend: SubscriptionTrend;
  isOversubscribed: boolean;
  allocationPercentage?: number; // Percentage of total issue allocated
}

// Subscription filter options
export interface SubscriptionFilters {
  ipoId?: string;
  symbol?: string;
  category?: SubscriptionCategory;
  timeRange?: number; // Days
  minRatio?: number;
  maxRatio?: number;
  oversubscribedOnly?: boolean;
  includeStats?: boolean;
  groupBy?: "category" | "hourly" | "daily";
}

// Subscription API response
export interface SubscriptionResponse {
  success: boolean;
  data: SubscriptionData[];
  statistics?: SubscriptionStats;
  metadata: {
    ipoId?: string;
    symbol?: string;
    category?: SubscriptionCategory;
    timeRange: number;
    totalCount: number;
    includeStats: boolean;
    groupBy?: string;
  };
  timestamp: string;
}

// Live subscription response
export interface SubscriptionLiveResponse {
  success: boolean;
  data: SubscriptionWithAnalytics[];
  statistics?: SubscriptionStats;
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

// Subscription update payload for WebSocket
export interface SubscriptionUpdatePayload {
  type: "subscription_update";
  ipoId: string;
  symbol: string;
  category: SubscriptionCategory;
  subscriptionRatio: number;
  quantity: string; // BigInt as string
  bidCount: number;
  timestamp: number;
  previousRatio?: number;
}

// Subscription meter configuration
export interface SubscriptionMeterConfig {
  showCategories: boolean;
  showDetails: boolean;
  animated: boolean;
  compact: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // milliseconds
}

// Subscription milestone interface
export interface SubscriptionMilestone {
  ratio: number; // Subscription ratio milestone (e.g., 1.0, 2.0, 5.0)
  timestamp: string; // When milestone was reached
  category: SubscriptionCategory;
  duration: number; // Time taken to reach from previous milestone (minutes)
}

// Subscription projection interface
export interface SubscriptionProjection {
  ipoId: string;
  category: SubscriptionCategory;
  currentRatio: number;
  projectedFinalRatio: number;
  confidence: number; // 0-1 confidence score
  timeRemaining: number; // Hours until IPO closes
  factors: {
    velocity: number; // Current subscription velocity
    acceleration: number; // Change in velocity
    timeOfDay: "morning" | "afternoon" | "evening";
    dayOfWeek: string;
    marketSentiment: number;
  };
  methodology: "linear" | "exponential" | "sigmoid" | "ml_model";
  lastUpdated: string;
}

// Subscription alert configuration
export interface SubscriptionAlert {
  id: string;
  userId: string;
  ipoId: string;
  symbol: string;
  category: SubscriptionCategory;
  triggerType: "ratio_above" | "ratio_below" | "oversubscribed" | "milestone";
  triggerValue: number;
  isActive: boolean;
  message?: string;
  createdAt: string;
}

// Subscription comparison interface
export interface SubscriptionComparison {
  primary: SubscriptionWithAnalytics;
  comparisons: SubscriptionWithAnalytics[];
  metrics: {
    ratios: Array<{
      symbol: string;
      category: string;
      ratio: number;
      rank: number;
    }>;
    velocity: Array<{
      symbol: string;
      velocity: number;
      trend: SubscriptionTrend;
    }>;
    milestones: Array<{
      symbol: string;
      milestonesReached: number;
      latestMilestone: number;
    }>;
  };
  timestamp: string;
}

// Subscription history for charts
export interface SubscriptionHistoryPoint {
  timestamp: string;
  subscriptionRatio: number;
  quantity: string; // BigInt as string
  bidCount: number;
  category: SubscriptionCategory;
  change?: number; // Change from previous point
}

// Grouped subscription data
export interface GroupedSubscriptionData {
  timestamp: string;
  subscriptionRatio: number;
  totalQuantity: string; // BigInt as string
  totalBids: number;
  recordCount: number;
  categories?: Record<SubscriptionCategory, number>;
}

// Subscription analytics interface
export interface SubscriptionAnalytics {
  ipoId: string;
  overall: {
    currentRatio: number;
    peakRatio: number;
    velocity: number; // Subscriptions per hour
    acceleration: number; // Change in velocity
    projectedFinal: number;
    timeToOversubscription?: number; // Hours (if not yet oversubscribed)
  };
  categories: Record<
    SubscriptionCategory,
    {
      currentRatio: number;
      trend: SubscriptionTrend;
      velocity: number;
      contribution: number; // Percentage contribution to overall
      rank: number; // Rank among categories
    }
  >;
  milestones: SubscriptionMilestone[];
  patterns: {
    peakHours: number[]; // Hours of day with highest activity
    weekdayEffect: Record<string, number>; // Day of week impact
    lastHourPush: number; // Typical last-hour subscription boost
  };
  lastCalculated: string;
}

// Subscription tracking preferences
export interface SubscriptionTrackingPrefs {
  userId: string;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
  categories: SubscriptionCategory[]; // Categories to track
  showProjections: boolean;
  showMilestones: boolean;
  alertOnOversubscription: boolean;
  alertOnMilestones: boolean;
  preferredView: "table" | "meter" | "chart";
}

// Create/Update subscription payload
export interface CreateSubscriptionPayload {
  ipoId: string;
  category: SubscriptionCategory;
  subCategory?: string;
  quantity: string; // BigInt as string
  bidCount: number;
  subscriptionRatio: number;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSubscriptionPayload
  extends Partial<CreateSubscriptionPayload> {
  id: string;
}

// Bulk subscription update
export interface BulkSubscriptionUpdate {
  ipoId: string;
  subscriptions: Array<{
    category: SubscriptionCategory;
    subCategory?: string;
    quantity: string;
    bidCount: number;
    subscriptionRatio: number;
    metadata?: Record<string, unknown>;
  }>;
  timestamp?: string;
}

// Utility types
export type SubscriptionValue = Pick<
  SubscriptionData,
  "subscriptionRatio" | "quantity" | "bidCount"
>;
export type SubscriptionIdentifier = Pick<
  SubscriptionData,
  "id" | "ipoId" | "category"
>;
export type SubscriptionSummary = Pick<
  SubscriptionData,
  "category" | "subscriptionRatio" | "timestamp"
>;

// Constants
export const SUBSCRIPTION_CATEGORIES = {
  RETAIL: "RETAIL",
  QIB: "QIB",
  HNI: "HNI",
  EMPLOYEE: "EMPLOYEE",
  SHAREHOLDER: "SHAREHOLDER",
  OVERALL: "OVERALL",
} as const;

export const SUBSCRIPTION_TRENDS = {
  INCREASING: "increasing",
  DECREASING: "decreasing",
  STABLE: "stable",
  ACCELERATING: "accelerating",
  DECELERATING: "decelerating",
} as const;

export const SUBSCRIPTION_MILESTONES = [
  0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0,
] as const;

// Category display configuration
export const CATEGORY_CONFIG = {
  RETAIL: {
    displayName: "Retail",
    color: "bg-blue-500",
    description: "Individual investors (up to ₹2 lakh)",
    allocation: 35, // Typical allocation percentage
  },
  QIB: {
    displayName: "QIB",
    color: "bg-green-500",
    description: "Qualified Institutional Buyers",
    allocation: 50,
  },
  HNI: {
    displayName: "HNI",
    color: "bg-purple-500",
    description: "High Net Worth Individuals (above ₹2 lakh)",
    allocation: 15,
  },
  EMPLOYEE: {
    displayName: "Employee",
    color: "bg-orange-500",
    description: "Employee reservation",
    allocation: 0, // Variable
  },
  SHAREHOLDER: {
    displayName: "Shareholder",
    color: "bg-pink-500",
    description: "Existing shareholder reservation",
    allocation: 0, // Variable
  },
  OVERALL: {
    displayName: "Overall",
    color: "bg-gray-500",
    description: "Combined all categories",
    allocation: 100,
  },
} as const;

// Helper function types
export type SubscriptionComparator = (
  a: SubscriptionData,
  b: SubscriptionData
) => number;
export type SubscriptionValidator = (
  subscription: Partial<SubscriptionData>
) => boolean;
export type SubscriptionTransformer<T> = (subscription: SubscriptionData) => T;
export type SubscriptionPredicate = (subscription: SubscriptionData) => boolean;

// Error types
export interface SubscriptionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface SubscriptionValidationError extends SubscriptionError {
  field: string;
  value: unknown;
  constraint: string;
}

// Webhook payload for subscription updates
export interface SubscriptionWebhookPayload {
  event:
    | "subscription.updated"
    | "subscription.oversubscribed"
    | "subscription.milestone";
  data: {
    subscription: SubscriptionData;
    milestone?: SubscriptionMilestone;
    previousRatio?: number;
  };
  timestamp: string;
}
