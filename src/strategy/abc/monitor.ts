import { EventEmitter } from "node:events";
import type { BasePosition, FloatPosition, StrategyState } from "./types.js";
import type { RiskMetrics } from "./risk-control.js";

export interface MonitorConfig {
  checkInterval: number;
  alertThresholds: {
    positionLoss: number;
    dailyLoss: number;
    weeklyLoss: number;
    noTradeDays: number;
  };
}

export interface MonitorAlert {
  type: "warning" | "danger" | "info";
  timestamp: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PortfolioSummary {
  timestamp: string;
  equity: number;
  cash: number;
  marketValue: number;
  basePosition?: {
    symbol: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPct: number;
  };
  floatPositions: Array<{
    id: string;
    symbol: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPct: number;
    unrealizedPnl: number;
  }>;
  todayTrades: number;
  todayPnl: number;
  weeklyPnl: number;
  weeklyWinRate: number;
}

export class StrategyMonitor extends EventEmitter {
  private config: MonitorConfig;
  private alerts: MonitorAlert[] = [];
  private monitorInterval?: NodeJS.Timeout;
  private lastEquity?: number;
  private peakEquity: number = 0;
  private dailyStartEquity?: number;
  private weeklyStartEquity?: number;
  private weeklyStartDate: string = "";
  private todayTradeCount = 0;
  private todayPnl = 0;
  private lastTradeDate: string = "";

  constructor(config: Partial<MonitorConfig> = {}) {
    super();
    this.config = {
      checkInterval: config.checkInterval || 60000,
      alertThresholds: {
        positionLoss: config.alertThresholds?.positionLoss || 0.08,
        dailyLoss: config.alertThresholds?.dailyLoss || 0.03,
        weeklyLoss: config.alertThresholds?.weeklyLoss || 0.06,
        noTradeDays: config.alertThresholds?.noTradeDays || 5,
        ...config.alertThresholds,
      },
    };

    this.initWeeklyStart();
  }

  private initWeeklyStart(): void {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    this.weeklyStartDate = monday.toISOString().split("T")[0];
  }

  start(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.monitorInterval = setInterval(() => {
      this.checkAllConditions();
    }, this.config.checkInterval);

    console.log(`[Monitor] 启动监控，间隔 ${this.config.checkInterval / 1000}秒`);
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    console.log("[Monitor] 已停止");
  }

  recordEquity(equity: number): void {
    if (this.lastEquity !== undefined) {
      const change = equity - this.lastEquity;
      if (change < 0) {
        this.todayPnl += change;
      }
    }

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    this.lastEquity = equity;
  }

  recordTrade(symbol: string, side: "buy" | "sell", price: number, quantity: number, pnl: number): void {
    const today = new Date().toISOString().split("T")[0];

    if (today !== this.lastTradeDate) {
      this.todayTradeCount = 0;
      this.todayPnl = 0;
      this.lastTradeDate = today;
    }

    this.todayTradeCount++;

    if (side === "sell") {
      this.todayPnl += pnl;
    }

    this.emit("trade", { symbol, side, price, quantity, pnl, timestamp: new Date().toISOString() });
  }

  recordDayStart(equity: number): void {
    this.dailyStartEquity = equity;
    this.todayTradeCount = 0;
    this.todayPnl = 0;

    const today = new Date().toISOString().split("T")[0];
    if (today !== this.weeklyStartDate) {
      this.initWeeklyStart();
      this.weeklyStartEquity = equity;
    }
  }

  getPortfolioSummary(
    state: StrategyState,
    currentPrices: Map<string, number>,
    cash: number,
  ): PortfolioSummary {
    const equity = this.lastEquity || cash;
    let marketValue = 0;
    let basePosition;
    const floatPositions: PortfolioSummary["floatPositions"] = [];

    if (state.basePosition && !state.basePosition.closed) {
      const currentPrice = currentPrices.get(state.basePosition.symbol) || state.basePosition.avgPrice;
      basePosition = {
        symbol: state.basePosition.symbol,
        quantity: state.basePosition.quantity,
        avgPrice: state.basePosition.avgPrice,
        currentPrice,
        pnl: (currentPrice - state.basePosition.avgPrice) * state.basePosition.quantity,
        pnlPct: ((currentPrice - state.basePosition.avgPrice) / state.basePosition.avgPrice) * 100,
      };
      marketValue += currentPrice * state.basePosition.quantity;
    }

    for (const pos of state.floatPositions) {
      if (!pos.closed) {
        const currentPrice = currentPrices.get(pos.symbol) || pos.avgPrice;
        const unrealizedPnl = (currentPrice - pos.avgPrice) * pos.quantity;
        floatPositions.push({
          id: pos.id,
          symbol: pos.symbol,
          quantity: pos.quantity,
          avgPrice: pos.avgPrice,
          currentPrice,
          pnl: unrealizedPnl,
          pnlPct: ((currentPrice - pos.avgPrice) / pos.avgPrice) * 100,
          unrealizedPnl,
        });
        marketValue += currentPrice * pos.quantity;
      }
    }

    const weeklyPnl = this.weeklyStartEquity ? equity - this.weeklyStartEquity : 0;
    const weeklyWinRate = this.calculateWeeklyWinRate(state);

    return {
      timestamp: new Date().toISOString(),
      equity,
      cash,
      marketValue,
      basePosition,
      floatPositions,
      todayTrades: this.todayTradeCount,
      todayPnl: this.todayPnl,
      weeklyPnl,
      weeklyWinRate,
    };
  }

  private calculateWeeklyWinRate(state: StrategyState): number {
    const trades = state.weeklyStats;
    if (trades.totalTrades === 0) return 0;
    return (trades.winningTrades / trades.totalTrades) * 100;
  }

  private checkAllConditions(): void {
    const alerts = this.performChecks();
    for (const alert of alerts) {
      this.addAlert(alert);
      this.emit("alert", alert);
    }
  }

  private performChecks(): MonitorAlert[] {
    const alerts: MonitorAlert[] = [];
    const now = new Date().toISOString();

    if (this.dailyStartEquity && this.lastEquity) {
      const dailyLoss = (this.dailyStartEquity - this.lastEquity) / this.dailyStartEquity;

      if (dailyLoss >= this.config.alertThresholds.dailyLoss) {
        alerts.push({
          type: "danger",
          timestamp: now,
          title: "日亏损超限",
          message: `当日亏损 ${(dailyLoss * 100).toFixed(2)}%，超过阈值 ${(this.config.alertThresholds.dailyLoss * 100).toFixed(1)}%`,
        });
      }
    }

    if (this.weeklyStartEquity && this.lastEquity) {
      const weeklyLoss = (this.weeklyStartEquity - this.lastEquity) / this.weeklyStartEquity;

      if (weeklyLoss >= this.config.alertThresholds.weeklyLoss) {
        alerts.push({
          type: "danger",
          timestamp: now,
          title: "周亏损超限",
          message: `本周亏损 ${(weeklyLoss * 100).toFixed(2)}%，超过阈值 ${(this.config.alertThresholds.weeklyLoss * 100).toFixed(1)}%`,
        });
      }
    }

    if (this.peakEquity > 0 && this.lastEquity) {
      const drawdown = (this.peakEquity - this.lastEquity) / this.peakEquity;

      if (drawdown >= 0.15) {
        alerts.push({
          type: "warning",
          timestamp: now,
          title: "回撤过大",
          message: `当前回撤 ${(drawdown * 100).toFixed(2)}%`,
        });
      }
    }

    return alerts;
  }

  addAlert(alert: MonitorAlert): void {
    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  getAlerts(type?: MonitorAlert["type"]): MonitorAlert[] {
    if (type) {
      return this.alerts.filter((a) => a.type === type);
    }
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts = [];
  }

  getMetrics(state: StrategyState, equity: number): RiskMetrics {
    const dailyLoss = this.dailyStartEquity
      ? (this.dailyStartEquity - equity) / this.dailyStartEquity
      : 0;
    const weeklyLoss = this.weeklyStartEquity
      ? (this.weeklyStartEquity - equity) / this.weeklyStartEquity
      : 0;
    const drawdown = this.peakEquity > 0 ? (this.peakEquity - equity) / this.peakEquity : 0;

    return {
      totalEquity: equity,
      floatCash: 0,
      basePositionValue: 0,
      totalUnrealizedPnl: 0,
      totalRealizedPnl: this.todayPnl,
      weeklyPnl: weeklyLoss,
      weeklyWinRate: this.calculateWeeklyWinRate(state),
      dailyWinRate: this.todayTradeCount > 0 ? (this.todayPnl > 0 ? 1 : 0) : 0,
      currentDrawdown: drawdown,
      maxDrawdown: drawdown,
    };
  }

  printSummary(summary: PortfolioSummary): void {
    console.log("\n========== 账户概览 ==========");
    console.log(`时间: ${summary.timestamp}`);
    console.log(`总资产: ¥${summary.equity.toFixed(2)}`);
    console.log(`现金: ¥${summary.cash.toFixed(2)}`);
    console.log(`市值: ¥${summary.marketValue.toFixed(2)}`);

    if (summary.basePosition) {
      console.log("\n--- 底仓 ---");
      console.log(
        `${summary.basePosition.symbol}: ${summary.basePosition.quantity}股 @ ¥${summary.basePosition.avgPrice.toFixed(2)}`,
      );
      console.log(
        `当前: ¥${summary.basePosition.currentPrice.toFixed(2)} (${summary.basePosition.pnl >= 0 ? "+" : ""}${summary.basePosition.pnlPct.toFixed(2)}%)`,
      );
    }

    if (summary.floatPositions.length > 0) {
      console.log("\n--- 浮仓 ---");
      for (const pos of summary.floatPositions) {
        console.log(
          `${pos.symbol}: ${pos.quantity}股 @ ¥${pos.avgPrice.toFixed(2)} -> ¥${pos.currentPrice.toFixed(2)}`,
        );
        console.log(
          `盈亏: ${pos.unrealizedPnl >= 0 ? "+" : ""}¥${pos.unrealizedPnl.toFixed(2)} (${pos.pnlPct >= 0 ? "+" : ""}${pos.pnlPct.toFixed(2)}%)`,
        );
      }
    }

    console.log("\n--- 今日统计 ---");
    console.log(`交易次数: ${summary.todayTrades}`);
    console.log(`当日盈亏: ${summary.todayPnl >= 0 ? "+" : ""}¥${summary.todayPnl.toFixed(2)}`);
    console.log(`本周盈亏: ${summary.weeklyPnl >= 0 ? "+" : ""}¥${summary.weeklyPnl.toFixed(2)}`);
    console.log(`周胜率: ${summary.weeklyWinRate.toFixed(1)}%`);
    console.log("================================\n");
  }
}

export const createMonitor = (config?: Partial<MonitorConfig>) => new StrategyMonitor(config);
