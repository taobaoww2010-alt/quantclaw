import { Type } from "@sinclair/typebox";

export const ABCStrategyParamsSchema = Type.Object({
  symbol: Type.String({ description: "股票代码" }),
  capital: Type.Number({ minimum: 10000, description: "初始资金" }),
  mode: Type.Union([Type.Literal("backtest"), Type.Literal("paper"), Type.Literal("live")], {
    description: "运行模式",
  }),
});

export type ABCStrategyParams = {
  symbol: string;
  capital: number;
  mode: "backtest" | "paper" | "live";
};

export const PositionTypeSchema = Type.Union([Type.Literal("base"), Type.Literal("float")]);
export type PositionType = "base" | "float";

export const OrderSideSchema = Type.Union([Type.Literal("buy"), Type.Literal("sell")]);
export type OrderSide = "buy" | "sell";

export const OrderStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("filled"),
  Type.Literal("cancelled"),
  Type.Literal("rejected"),
]);
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export interface BasePosition {
  id: string;
  symbol: string;
  type: "base";
  quantity: number;
  avgPrice: number;
  entryDate: string;
  strategy: string;
  stopLoss: number;
  takeProfit: number;
  closed: boolean;
  closeDate?: string;
  closePrice?: number;
  pnl?: number;
}

export interface FloatPosition {
  id: string;
  symbol: string;
  type: "float";
  quantity: number;
  avgPrice: number;
  entryTime: string;
  lastTradeTime: string;
  trades: FloatTrade[];
  stopLoss: number;
  takeProfit: number;
  closed: boolean;
  closeTime?: string;
  closePrice?: number;
  pnl?: number;
}

export interface FloatTrade {
  id: string;
  side: OrderSide;
  price: number;
  quantity: number;
  time: string;
  commission: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  filledAt?: string;
  filledPrice?: number;
  filledQuantity?: number;
  cancelledAt?: string;
  reason?: string;
  commission?: number;
}

export interface StockFundamental {
  code: string;
  name: string;
  shareholderCount: number;
  floatMarketCap: number;
  avgHoldingPerAccount: number;
}

export interface StockMarketData {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  avgTurnoverRate20: number;
  avgAmount20: number;
  high20: number;
  low20: number;
  position: number;
}

export interface Level2Data {
  timestamp: number;
  bidPrices: number[];
  bidVolumes: number[];
  askPrices: number[];
  askVolumes: number[];
  weibi: number;
  weinei: number;
}

export interface MarketSnapshot {
  timestamp: string;
  openPrice: number;
  open?: number;
  currentPrice: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  weibi: number;
  weinei: number;
  bid1Volume: number;
  bid2Volume: number;
  bid3Volume: number;
  ask1Volume: number;
  ask2Volume: number;
  ask3Volume: number;
}

export interface AuctionData {
  timestamp: string;
  matchedVolume: number;
  unmatchedBuyVolume: number;
  unmatchedSellVolume: number;
  price: number;
}

export interface StrategyState {
  phase: "idle" | "watching" | "base_built" | "trading";
  basePosition?: BasePosition;
  floatPositions: FloatPosition[];
  orders: Order[];
  todayTrades: FloatTrade[];
  lastBaseTradeTime?: string;
  consecutiveNoTradeDays: number;
  forcedRestDays: number;
  weeklyStats: WeeklyStats;
}

export interface WeeklyStats {
  weekStart: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  accountValueStart: number;
}

export interface StockSelectionCriteria {
  shareholderCountMin: number;
  avgHoldingValueMax: number;
  turnoverRateMin: number;
  turnoverRateMax: number;
  amountMin: number;
  volatilityMin: number;
  excludeQuant: boolean;
}

export const DEFAULT_SELECTION_CRITERIA: StockSelectionCriteria = {
  shareholderCountMin: 100000,
  avgHoldingValueMax: 50000,
  turnoverRateMin: 0.05,
  turnoverRateMax: 0.15,
  amountMin: 200000000,
  volatilityMin: 1.2,
  excludeQuant: true,
};

export const DEFAULT_STRATEGY_PARAMS = {
  weibiBuyRange: { min: 0.4, max: 0.6 },
  weibiSellRange: { min: -0.4, max: 0.6 },
  pilingMultiple: 2.5,
  thinVolumeRatio: 0.5,
  panicDropRate: 0.02,
  panicDropPeriod: 30,
  greedRiseRate: 0.02,
  greedRisePeriod: 30,
  auctionVolumeThresholdHigh: 0.05,
  auctionVolumeThresholdLow: 0.02,
  pricePositionLow: 0.3,
  pricePositionHigh: 0.7,
  floatTakeProfit: 0.05,
  floatStopLoss: 0.065,
  baseStopLoss: 0.1,
  baseTakeProfit: 0.1,
  accountWeeklyStopLoss: 0.065,
  winRateThreshold: 0.6,
  minTradeInterval: 15 * 60 * 1000,
  samePriceMaxTrades: 3,
  samePriceRange: 0.005,
  dailyMaxFloatTrades: 5,
  basePositionRatio: 0.1,
  maxPositionRatio: 0.45,
  positionSizePerTrade: 100,
  priceDropForPause: 0.03,
  baseHoldMaxDays: 30,
  shareholderCountMin: 100000,
};

export type StrategyParams = typeof DEFAULT_STRATEGY_PARAMS;

export interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  winRate: number;
  profitLossRatio: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  finalEquity: number;
  equityCurve: { date: string; equity: number }[];
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  pnl: number;
  pnlPct: number;
}

export interface StrategyConfig {
  symbol: string;
  capital: number;
  mode: "backtest" | "paper" | "live";
}
