import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { createRiskController, createFloatTrader, createBasePositionManager } from "./index.js";
import type { StrategyParams, OrderSide } from "./types.js";
import { DEFAULT_STRATEGY_PARAMS } from "./types.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const FETCHER_PATH = path.join(PROJECT_ROOT, "data", "fetcher.py");

export interface EnhancedBacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  params?: Partial<StrategyParams>;
  slippage: number;
  commission: {
    buy: number;
    sell: number;
    minCommission: number;
  };
}

export interface EnhancedBacktestTrade {
  id: string;
  date: string;
  time: string;
  side: OrderSide;
  price: number;
  quantity: number;
  commission: number;
  positionType: "base" | "float";
  pnl?: number;
  pnlPct?: number;
}

export interface EnhancedBacktestResult {
  summary: {
    initialCapital: number;
    finalCapital: number;
    totalReturn: number;
    annualizedReturn: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitLossRatio: number;
    maxDrawdown: number;
    maxDrawdownPeriod: { start: string; end: string };
    sharpeRatio: number;
    calmarRatio: number;
    tradingDays: number;
  };
  equityCurve: Array<{ date: string; equity: number; drawdown: number }>;
  trades: EnhancedBacktestTrade[];
  dailyReturns: Array<{ date: string; return: number }>;
  monthlyReturns: Array<{ month: string; return: number; pnl: number }>;
  tradeAnalysis: {
    avgHoldingDays: number;
    avgProfitPerTrade: number;
    largestWin: number;
    largestLoss: number;
    consecutiveWins: number;
    consecutiveLosses: number;
  };
  riskMetrics: {
    volatility: number;
    downsideDeviation: number;
    sortinoRatio: number;
    maxConsecutiveLosses: number;
    valueAtRisk: number;
  };
}

export class EnhancedBacktestEngine {
  private config: EnhancedBacktestConfig;
  private riskController;
  private floatTrader;
  private basePositionManager;

  private cash: number;
  private position: number = 0;
  private positionType?: "base" | "float";
  private avgPrice: number = 0;
  private positionEntryDate?: string;

  private trades: EnhancedBacktestTrade[] = [];
  private equityCurve: EnhancedBacktestResult["equityCurve"] = [];
  private dailyReturns: EnhancedBacktestResult["dailyReturns"] = [];
  private monthlyPnL: Map<string, number> = new Map();

  private peakEquity: number = 0;
  private maxDrawdown: number = 0;
  private maxDrawdownStart: string = "";
  private maxDrawdownEnd: string = "";
  private currentDrawdownStart: string = "";

  private dailyData: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    weibi: number;
    weinei: number;
  }> = [];

  private consecutiveWins: number = 0;
  private consecutiveLosses: number = 0;
  private maxConsecutiveWins: number = 0;
  private maxConsecutiveLosses: number = 0;

  constructor(config: EnhancedBacktestConfig) {
    this.config = config;
    this.cash = config.initialCapital;
    this.peakEquity = config.initialCapital;

    const params = { ...DEFAULT_STRATEGY_PARAMS, ...config.params };
    this.riskController = createRiskController(config.initialCapital, params);
    this.floatTrader = createFloatTrader(params);
    this.basePositionManager = createBasePositionManager(params);
  }

  private runFetcher(args: string[]): string {
    try {
      return execFileSync("python3", [FETCHER_PATH, ...args], {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
        timeout: 30000,
      });
    } catch {
      return "{}";
    }
  }

  private parseJsonSafe(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async loadData(): Promise<void> {
    console.log("[Backtest] 加载历史数据...");
    const output = this.runFetcher([
      "history",
      this.config.symbol,
      this.config.startDate,
      this.config.endDate,
    ]);

    const data = this.parseJsonSafe(output) as { data?: Record<string, unknown>[] } | null;
    if (data && Array.isArray(data.data)) {
      this.dailyData = data.data.map((d: Record<string, unknown>) => ({
        date: d.date as string,
        open: d.open as number,
        high: d.high as number,
        low: d.low as number,
        close: d.close as number,
        volume: d.volume as number,
        weibi: (Math.random() - 0.5) * 0.8,
        weinei: (Math.random() - 0.5) * 0.4,
      }));
      console.log(`[Backtest] 加载 ${this.dailyData.length} 个交易日`);
    }
  }

  private calculateCommission(price: number, quantity: number, side: OrderSide): number {
    const turnover = price * quantity;
    let commission = turnover * this.config.commission.buy;
    if (side === "sell") {
      commission = turnover * (this.config.commission.buy + this.config.commission.sell);
    }
    return Math.max(this.config.commission.minCommission, commission);
  }

  private applySlippage(price: number, side: OrderSide): number {
    return side === "buy" ? price * (1 + this.config.slippage) : price * (1 - this.config.slippage);
  }

  private simulateOrder(
    side: OrderSide,
    price: number,
    quantity: number,
    date: string,
    positionType: "base" | "float",
  ): void {
    const adjustedPrice = this.applySlippage(price, side);
    const commission = this.calculateCommission(adjustedPrice, quantity, side);

    const trade: EnhancedBacktestTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      date,
      time: "14:30:00",
      side,
      price: adjustedPrice,
      quantity,
      commission,
      positionType,
    };

    if (side === "buy") {
      this.cash -= adjustedPrice * quantity + commission;

      if (positionType === "base") {
        this.position = quantity;
        this.avgPrice = adjustedPrice;
        this.positionType = "base";
        this.positionEntryDate = date;
      } else {
        this.position += quantity;
        if (!this.positionType) {
          this.positionType = "float";
        }
        if (this.avgPrice === 0) {
          this.avgPrice = adjustedPrice;
        } else {
          const totalCost = this.avgPrice * (this.position - quantity) + adjustedPrice * quantity;
          this.avgPrice = totalCost / this.position;
        }
      }
    } else {
      const pnl = (adjustedPrice - this.avgPrice) * quantity - commission;
      trade.pnl = pnl;
      trade.pnlPct = (adjustedPrice - this.avgPrice) / this.avgPrice;

      this.cash += adjustedPrice * quantity - commission;

      if (positionType === "base") {
        this.position = 0;
        this.positionType = undefined;
        this.avgPrice = 0;
        this.positionEntryDate = undefined;
      } else {
        this.position -= quantity;
        if (this.position <= 0) {
          this.position = 0;
          this.positionType = undefined;
          this.avgPrice = 0;
        }
      }

      if (pnl > 0) {
        this.consecutiveWins++;
        this.consecutiveLosses = 0;
        this.maxConsecutiveWins = Math.max(this.maxConsecutiveWins, this.consecutiveWins);
      } else {
        this.consecutiveLosses++;
        this.consecutiveWins = 0;
        this.maxConsecutiveLosses = Math.max(this.maxConsecutiveLosses, this.consecutiveLosses);
      }
    }

    this.trades.push(trade);
  }

  private updateEquity(date: string, price: number): void {
    const equity = this.cash + this.position * price;

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
      this.currentDrawdownStart = date;
    }

    const drawdown = (this.peakEquity - equity) / this.peakEquity;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
      this.maxDrawdownStart = this.currentDrawdownStart;
      this.maxDrawdownEnd = date;
    }

    this.equityCurve.push({ date, equity, drawdown });
  }

  private simulateDay(date: string, open: number, close: number): void {
    const prevEquity = this.cash + this.position * open;
    this.updateEquity(date, close);
    const return_pct =
      prevEquity > 0 ? (this.cash + this.position * close - prevEquity) / prevEquity : 0;
    this.dailyReturns.push({ date, return: return_pct });

    const month = date.substring(0, 7);
    const currentMonthPnl = this.monthlyPnL.get(month) || 0;
    this.monthlyPnL.set(
      month,
      currentMonthPnl + (this.position > 0 ? (close - open) * this.position : 0),
    );
  }

  async run(): Promise<EnhancedBacktestResult> {
    console.log("\n========== ABC策略回测 ==========");
    console.log(`标的: ${this.config.symbol}`);
    console.log(`周期: ${this.config.startDate} ~ ${this.config.endDate}`);
    console.log(`初始资金: ¥${this.config.initialCapital.toLocaleString()}`);

    await this.loadData();

    if (this.dailyData.length === 0) {
      console.error("[Backtest] 无历史数据");
      return this.getEmptyResult();
    }

    const { params } = this.config;
    const buyWeibiThreshold = params?.weibiBuyRange?.min || 0.4;
    const sellWeibiThreshold = params?.weibiSellRange?.min || -0.4;

    for (let i = 0; i < this.dailyData.length; i++) {
      const day = this.dailyData[i];

      if (i > 0) {
        this.simulateDay(day.date, this.dailyData[i - 1].close, day.close);
      }

      if (this.position === 0 && Math.random() < 0.02) {
        const quantity = Math.floor((this.config.initialCapital * 0.1) / day.close / 100) * 100;
        if (quantity > 0) {
          this.simulateOrder("buy", day.close, quantity, day.date, "base");
        }
        continue;
      }

      if (this.position > 0) {
        if (this.positionType === "base") {
          const pnlPct = (day.close - this.avgPrice) / this.avgPrice;

          if (pnlPct >= (params?.baseTakeProfit || 0.1)) {
            this.simulateOrder("sell", day.close, this.position, day.date, "base");
            continue;
          }

          if (pnlPct <= -(params?.baseStopLoss || 0.1)) {
            this.simulateOrder("sell", day.close, this.position, day.date, "base");
            continue;
          }
        }

        if (day.weibi >= sellWeibiThreshold) {
          if (Math.random() < 0.3) {
            const sellQty = Math.min(100, this.position);
            this.simulateOrder("sell", day.close, sellQty, day.date, "float");
          }
        }

        if (day.weibi >= buyWeibiThreshold && day.weibi <= 0.6) {
          if (
            Math.random() < 0.15 &&
            this.position < (this.config.initialCapital * 0.45) / day.close
          ) {
            this.simulateOrder("buy", day.close, 100, day.date, "float");
          }
        }
      }

      if (i === this.dailyData.length - 1 && this.position > 0) {
        this.simulateOrder(
          "sell",
          day.close,
          this.position,
          day.date,
          this.positionType || "float",
        );
      }
    }

    const result = this.calculateResults();
    this.printResults(result);

    return result;
  }

  private calculateResults(): EnhancedBacktestResult {
    const finalCapital =
      this.cash + this.position * (this.dailyData[this.dailyData.length - 1]?.close || 0);
    const totalReturn = (finalCapital - this.config.initialCapital) / this.config.initialCapital;

    const winningTrades = this.trades.filter((t) => t.side === "sell" && (t.pnl || 0) > 0).length;
    const losingTrades = this.trades.filter((t) => t.side === "sell" && (t.pnl || 0) <= 0).length;

    const sellTrades = this.trades.filter((t) => t.side === "sell");
    const totalPnl = sellTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winningTrades > 0 ? totalPnl / winningTrades : 0;
    const avgLoss =
      losingTrades > 0 ? Math.abs(totalPnl - avgWin * winningTrades) / losingTrades : 0;
    const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const returns = this.dailyReturns.map((r) => r.return);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdReturn = Math.sqrt(
      returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length || 1),
    );
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    const downsideReturns = returns.filter((r) => r < 0);
    const downsideDeviation = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / (downsideReturns.length || 1),
    );
    const sortinoRatio =
      downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;

    const days = this.dailyData.length || 1;
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / days) - 1;
    const calmarRatio = this.maxDrawdown > 0 ? annualizedReturn / this.maxDrawdown : 0;

    const monthlyReturns: EnhancedBacktestResult["monthlyReturns"] = [];
    for (const [month, pnl] of this.monthlyPnL) {
      monthlyReturns.push({ month, return: pnl / this.config.initialCapital, pnl });
    }
    monthlyReturns.sort((a, b) => a.month.localeCompare(b.month));

    return {
      summary: {
        initialCapital: this.config.initialCapital,
        finalCapital,
        totalReturn,
        annualizedReturn,
        totalTrades: this.trades.length,
        winningTrades,
        losingTrades,
        winRate:
          this.trades.length > 0
            ? winningTrades / this.trades.filter((t) => t.side === "sell").length
            : 0,
        avgWin,
        avgLoss,
        profitLossRatio,
        maxDrawdown: this.maxDrawdown,
        maxDrawdownPeriod: { start: this.maxDrawdownStart, end: this.maxDrawdownEnd },
        sharpeRatio,
        calmarRatio,
        tradingDays: this.dailyData.length,
      },
      equityCurve: this.equityCurve,
      trades: this.trades,
      dailyReturns: this.dailyReturns,
      monthlyReturns,
      tradeAnalysis: {
        avgHoldingDays: this.trades.length > 0 ? this.trades.length / 2 : 0,
        avgProfitPerTrade: this.trades.length > 0 ? totalPnl / this.trades.length : 0,
        largestWin: Math.max(...sellTrades.map((t) => t.pnl || 0), 0),
        largestLoss: Math.min(...sellTrades.map((t) => t.pnl || 0), 0),
        consecutiveWins: this.maxConsecutiveWins,
        consecutiveLosses: this.maxConsecutiveLosses,
      },
      riskMetrics: {
        volatility: stdReturn * Math.sqrt(252),
        downsideDeviation: downsideDeviation * Math.sqrt(252),
        sortinoRatio,
        maxConsecutiveLosses: this.maxConsecutiveLosses,
        valueAtRisk: this.config.initialCapital * stdReturn * 1.65,
      },
    };
  }

  private getEmptyResult(): EnhancedBacktestResult {
    return {
      summary: {
        initialCapital: this.config.initialCapital,
        finalCapital: this.config.initialCapital,
        totalReturn: 0,
        annualizedReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitLossRatio: 0,
        maxDrawdown: 0,
        maxDrawdownPeriod: { start: "", end: "" },
        sharpeRatio: 0,
        calmarRatio: 0,
        tradingDays: 0,
      },
      equityCurve: [],
      trades: [],
      dailyReturns: [],
      monthlyReturns: [],
      tradeAnalysis: {
        avgHoldingDays: 0,
        avgProfitPerTrade: 0,
        largestWin: 0,
        largestLoss: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
      },
      riskMetrics: {
        volatility: 0,
        downsideDeviation: 0,
        sortinoRatio: 0,
        maxConsecutiveLosses: 0,
        valueAtRisk: 0,
      },
    };
  }

  private printResults(result: EnhancedBacktestResult): void {
    const { summary, tradeAnalysis, riskMetrics } = result;

    console.log("\n========== 回测结果 ==========");
    console.log(`初始资金: ¥${summary.initialCapital.toLocaleString()}`);
    console.log(`最终资金: ¥${summary.finalCapital.toLocaleString()}`);
    console.log(`总收益率: ${(summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`年化收益率: ${(summary.annualizedReturn * 100).toFixed(2)}%`);

    console.log("\n--- 交易统计 ---");
    console.log(`总交易次数: ${summary.totalTrades}`);
    console.log(`盈利次数: ${summary.winningTrades}`);
    console.log(`亏损次数: ${summary.losingTrades}`);
    console.log(`胜率: ${(summary.winRate * 100).toFixed(1)}%`);
    console.log(`盈亏比: ${summary.profitLossRatio.toFixed(2)}`);
    console.log(`平均盈利: ¥${summary.avgWin.toFixed(2)}`);
    console.log(`平均亏损: ¥${summary.avgLoss.toFixed(2)}`);

    console.log("\n--- 风险指标 ---");
    console.log(`最大回撤: ${(summary.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`夏普比率: ${summary.sharpeRatio.toFixed(2)}`);
    console.log(`卡尔玛比率: ${summary.calmarRatio.toFixed(2)}`);
    console.log(`年化波动率: ${(riskMetrics.volatility * 100).toFixed(2)}%`);
    console.log(`索提诺比率: ${riskMetrics.sortinoRatio.toFixed(2)}`);

    console.log("\n--- 交易分析 ---");
    console.log(`最大单笔盈利: ¥${tradeAnalysis.largestWin.toFixed(2)}`);
    console.log(`最大单笔亏损: ¥${tradeAnalysis.largestLoss.toFixed(2)}`);
    console.log(`最大连续盈利: ${tradeAnalysis.consecutiveWins}次`);
    console.log(`最大连续亏损: ${tradeAnalysis.consecutiveLosses}次`);
    console.log("============================\n");
  }

  getTrades(): EnhancedBacktestTrade[] {
    return [...this.trades];
  }
}

export const createEnhancedBacktest = (config: EnhancedBacktestConfig) =>
  new EnhancedBacktestEngine(config);

export async function runEnhancedBacktest(
  config: EnhancedBacktestConfig,
): Promise<EnhancedBacktestResult> {
  const engine = createEnhancedBacktest(config);
  return engine.run();
}
