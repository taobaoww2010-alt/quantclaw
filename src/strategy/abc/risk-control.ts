import type {
  BasePosition,
  FloatPosition,
  FloatTrade,
  StrategyParams,
  OrderSide,
} from "./types.js";
import { DEFAULT_STRATEGY_PARAMS } from "./types.js";

export interface RiskCheckResult {
  allowed: boolean;
  action?: "stop_loss" | "take_profit" | "pause" | "forced_rest" | "close_all";
  reason?: string;
  details?: Record<string, unknown>;
}

export interface RiskMetrics {
  totalEquity: number;
  floatCash: number;
  basePositionValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  weeklyPnl: number;
  weeklyWinRate: number;
  dailyWinRate: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

export class RiskController {
  private params: StrategyParams;
  private initialCapital: number;
  private capitalRecovered = false;
  private forcedRestUntil?: Date;
  private consecutiveStopLoss = 0;
  private weeklyTradeHistory: { pnl: number; time: string }[] = [];

  constructor(initialCapital: number, params?: Partial<StrategyParams>) {
    this.initialCapital = initialCapital;
    this.params = { ...DEFAULT_STRATEGY_PARAMS, ...params };
  }

  setForcedRest(days: number): void {
    this.forcedRestUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  clearForcedRest(): void {
    this.forcedRestUntil = undefined;
  }

  isInForcedRest(): boolean {
    if (!this.forcedRestUntil) {
      return false;
    }
    return new Date() < this.forcedRestUntil;
  }

  getForcedRestDaysRemaining(): number {
    if (!this.forcedRestUntil) {
      return 0;
    }
    const remaining = this.forcedRestUntil.getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }

  checkForcedRest(): RiskCheckResult {
    if (this.isInForcedRest()) {
      return {
        allowed: false,
        action: "forced_rest",
        reason: `强制休息中，还需 ${this.getForcedRestDaysRemaining()} 天`,
        details: { restUntil: this.forcedRestUntil?.toISOString() },
      };
    }
    return { allowed: true };
  }

  checkBasePositionRisk(basePosition: BasePosition, currentPrice: number): RiskCheckResult {
    if (basePosition.closed) {
      return { allowed: true };
    }

    const pnlPct = (currentPrice - basePosition.avgPrice) / basePosition.avgPrice;

    if (pnlPct <= -this.params.baseStopLoss) {
      return {
        allowed: false,
        action: "stop_loss",
        reason: `底仓亏损达到 ${(this.params.baseStopLoss * 100).toFixed(1)}%，触发止损`,
        details: { pnlPct, threshold: -this.params.baseStopLoss },
      };
    }

    if (pnlPct >= this.params.baseTakeProfit) {
      return {
        allowed: false,
        action: "take_profit",
        reason: `底仓盈利达到 ${(this.params.baseTakeProfit * 100).toFixed(1)}%，触发止盈`,
        details: { pnlPct, threshold: this.params.baseTakeProfit },
      };
    }

    return { allowed: true };
  }

  checkFloatPositionRisk(floatPosition: FloatPosition, currentPrice: number): RiskCheckResult {
    if (floatPosition.closed) {
      return { allowed: true };
    }

    const pnlPct = (currentPrice - floatPosition.avgPrice) / floatPosition.avgPrice;

    if (pnlPct <= -this.params.floatStopLoss) {
      return {
        allowed: false,
        action: "stop_loss",
        reason: `浮仓亏损达到 ${(this.params.floatStopLoss * 100).toFixed(1)}%，触发止损`,
        details: {
          positionId: floatPosition.id,
          pnlPct,
          threshold: -this.params.floatStopLoss,
        },
      };
    }

    if (pnlPct >= this.params.floatTakeProfit) {
      return {
        allowed: false,
        action: "take_profit",
        reason: `浮仓盈利达到 ${(this.params.floatTakeProfit * 100).toFixed(1)}%，触发止盈`,
        details: {
          positionId: floatPosition.id,
          pnlPct,
          threshold: this.params.floatTakeProfit,
        },
      };
    }

    return { allowed: true };
  }

  checkPriceDropPause(entryPrice: number, currentPrice: number): RiskCheckResult {
    const dropPct = (entryPrice - currentPrice) / entryPrice;

    if (dropPct >= this.params.priceDropForPause) {
      return {
        allowed: false,
        action: "pause",
        reason: `买入后价格跌破成本 ${(this.params.priceDropForPause * 100).toFixed(1)}%，暂停买入`,
        details: { dropPct, threshold: this.params.priceDropForPause },
      };
    }

    return { allowed: true };
  }

  checkWeeklyRisk(metrics: RiskMetrics): RiskCheckResult {
    const weeklyLoss = metrics.weeklyPnl;
    const weeklyLossRatio = weeklyLoss / metrics.totalEquity;

    if (weeklyLossRatio <= -this.params.accountWeeklyStopLoss) {
      this.consecutiveStopLoss++;
      return {
        allowed: false,
        action: "forced_rest",
        reason: `账户周亏损达到 ${(this.params.accountWeeklyStopLoss * 100).toFixed(1)}%，强制休息`,
        details: {
          weeklyLossRatio,
          threshold: -this.params.accountWeeklyStopLoss,
          consecutiveCount: this.consecutiveStopLoss,
        },
      };
    }

    const recentTrades = this.getRecentWeeklyTrades();
    if (recentTrades.length >= 3) {
      const wins = recentTrades.filter((t) => t.pnl > 0).length;
      const winRate = wins / recentTrades.length;

      if (winRate < this.params.winRateThreshold) {
        return {
          allowed: false,
          action: "forced_rest",
          reason: `周胜率 ${(winRate * 100).toFixed(1)}% 低于 ${(this.params.winRateThreshold * 100).toFixed(1)}%，强制休息复盘`,
          details: {
            winRate,
            threshold: this.params.winRateThreshold,
            totalTrades: recentTrades.length,
          },
        };
      }
    }

    this.consecutiveStopLoss = 0;
    return { allowed: true };
  }

  checkPositionLimit(
    currentPositions: FloatPosition[],
    currentPrice: number,
    accountValue: number,
  ): RiskCheckResult {
    const totalFloatValue = currentPositions.reduce((sum, p) => sum + p.quantity * currentPrice, 0);
    const totalPositionRatio = totalFloatValue / accountValue;

    if (totalPositionRatio > this.params.maxPositionRatio) {
      return {
        allowed: false,
        action: "pause",
        reason: `总仓位比例 ${(totalPositionRatio * 100).toFixed(1)}% 超过上限 ${(this.params.maxPositionRatio * 100).toFixed(1)}%`,
        details: { totalPositionRatio, threshold: this.params.maxPositionRatio },
      };
    }

    return { allowed: true };
  }

  checkDailyTradeLimit(todayTrades: FloatTrade[]): RiskCheckResult {
    const todayBuyCount = todayTrades.filter((t) => t.side === "buy").length;

    if (todayBuyCount >= this.params.dailyMaxFloatTrades) {
      return {
        allowed: false,
        action: "pause",
        reason: `今日买入 ${todayBuyCount} 手，已达上限 ${this.params.dailyMaxFloatTrades} 手`,
        details: { todayBuyCount, threshold: this.params.dailyMaxFloatTrades },
      };
    }

    return { allowed: true };
  }

  checkSamePriceLimit(trades: FloatTrade[], price: number): RiskCheckResult {
    const samePriceTrades = trades.filter((t) => {
      const priceDiff = Math.abs(t.price - price) / price;
      return priceDiff <= this.params.samePriceRange && t.side === "buy";
    });

    if (samePriceTrades.length >= this.params.samePriceMaxTrades) {
      return {
        allowed: false,
        action: "pause",
        reason: `同一价位附近 (±0.5%) 已买 ${samePriceTrades.length} 手，最多 ${this.params.samePriceMaxTrades} 手`,
        details: {
          samePriceCount: samePriceTrades.length,
          threshold: this.params.samePriceMaxTrades,
        },
      };
    }

    return { allowed: true };
  }

  checkTimeInterval(lastTradeTime: string): RiskCheckResult {
    const lastTime = new Date(lastTradeTime).getTime();
    const now = Date.now();
    const elapsed = now - lastTime;

    if (elapsed < this.params.minTradeInterval) {
      const remainingSeconds = Math.ceil((this.params.minTradeInterval - elapsed) / 1000);
      return {
        allowed: false,
        action: "pause",
        reason: `距离上次交易需等待 ${remainingSeconds} 秒`,
        details: { elapsedMs: elapsed, requiredMs: this.params.minTradeInterval },
      };
    }

    return { allowed: true };
  }

  addTrade(pnl: number, time: string): void {
    this.weeklyTradeHistory.push({ pnl, time });
    this.cleanOldTrades();
  }

  private getRecentWeeklyTrades(): { pnl: number; time: string }[] {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.weeklyTradeHistory.filter((t) => new Date(t.time).getTime() > weekAgo);
  }

  private cleanOldTrades(): void {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.weeklyTradeHistory = this.weeklyTradeHistory.filter(
      (t) => new Date(t.time).getTime() > monthAgo,
    );
  }

  isCapitalRecovered(equity: number): boolean {
    return equity >= this.initialCapital;
  }

  onStopLoss(): void {
    this.consecutiveStopLoss++;
    if (this.consecutiveStopLoss >= 2) {
      this.setForcedRest(3);
    }
  }

  onBasePositionClosed(): void {
    this.setForcedRest(3);
  }

  calculateCommission(price: number, quantity: number, side: OrderSide): number {
    const turnover = price * quantity;
    const baseCommission = turnover * 0.00015;

    let totalCost = baseCommission;
    if (side === "sell") {
      totalCost += turnover * 0.001;
    }

    return Math.max(5, totalCost);
  }

  calculateNetPnl(entryPrice: number, exitPrice: number, quantity: number): number {
    const grossPnl = (exitPrice - entryPrice) * quantity;
    const buyCommission = this.calculateCommission(entryPrice, quantity, "buy");
    const sellCommission = this.calculateCommission(exitPrice, quantity, "sell");
    return grossPnl - buyCommission - sellCommission;
  }

  getParams(): StrategyParams {
    return { ...this.params };
  }

  updateParams(updates: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...updates };
  }
}

export const createRiskController = (initialCapital: number, params?: Partial<StrategyParams>) =>
  new RiskController(initialCapital, params);
