import { execFileSync } from "node:child_process";
import * as path from "node:path";
import type {
  BacktestResult,
  StrategyConfig,
  StrategyParams,
  MarketSnapshot,
  FloatTrade,
} from "./types.js";
import { createABCStrategyEngine, ABCStrategyEngine } from "./strategy-engine.js";
import { createStockSelector } from "./stock-selector.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const FETCHER_PATH = path.join(PROJECT_ROOT, "data", "fetcher.py");

export interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  params?: Partial<StrategyParams>;
  slippage?: number;
}

export interface BacktestTrade {
  id: string;
  date: string;
  time: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  commission: number;
  positionType: "base" | "float";
}

export class ABCBacktestEngine {
  private config: BacktestConfig;
  private strategy: ABCStrategyEngine;
  private trades: BacktestTrade[] = [];
  private selector = createStockSelector();
  private currentDate: string = "";
  private dailyData: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[] = [];
  private cash: number;
  private position: number = 0;
  private avgPrice: number = 0;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.cash = config.initialCapital;
    this.strategy = createABCStrategyEngine({
      symbol: config.symbol,
      capital: config.initialCapital,
      mode: "backtest",
      params: config.params,
    });
  }

  private runFetcher(args: string[]): string {
    try {
      return execFileSync("python3", [FETCHER_PATH, ...args], {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
        timeout: 30_000,
      });
    } catch (err: unknown) {
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

  async loadHistoricalData(): Promise<void> {
    const output = this.runFetcher([
      "history",
      this.config.symbol,
      this.config.startDate,
      this.config.endDate,
    ]);

    const data = this.parseJsonSafe(output);
    if (data && Array.isArray(data.data)) {
      this.dailyData = data.data;
    }
  }

  private simulateMarketSnapshot(
    date: string,
    time: string,
    dayData: (typeof this.dailyData)[0],
    intradayProgress: number,
  ): MarketSnapshot {
    const basePrice = dayData.open;
    const priceRange = dayData.high - dayData.low;

    const simulatedPrice =
      basePrice + priceRange * Math.sin(intradayProgress * Math.PI);

    const weibi = (Math.random() - 0.5) * 1.0;
    const weinei = (Math.random() - 0.5) * 0.5;

    return {
      timestamp: `${date}T${time}`,
      openPrice: dayData.open,
      currentPrice: simulatedPrice,
      high: dayData.high,
      low: dayData.low,
      volume: dayData.volume * intradayProgress,
      amount: dayData.volume * intradayProgress * simulatedPrice,
      weibi,
      weinei,
      bid1Volume: Math.floor(Math.random() * 10000) + 5000,
      bid2Volume: Math.floor(Math.random() * 8000) + 4000,
      bid3Volume: Math.floor(Math.random() * 6000) + 3000,
      ask1Volume: Math.floor(Math.random() * 10000) + 5000,
      ask2Volume: Math.floor(Math.random() * 8000) + 4000,
      ask3Volume: Math.floor(Math.random() * 6000) + 3000,
    };
  }

  private calculateCommission(price: number, quantity: number, side: "buy" | "sell"): number {
    const turnover = price * quantity;
    let commission = turnover * 0.00015;
    if (side === "sell") {
      commission += turnover * 0.001;
    }
    return Math.max(5, commission);
  }

  private applySlippage(price: number, side: "buy" | "sell"): number {
    const slippage = this.config.slippage || 0.0002;
    return side === "buy"
      ? price * (1 + slippage)
      : price * (1 - slippage);
  }

  private executeTrade(
    side: "buy" | "sell",
    price: number,
    quantity: number,
    date: string,
    time: string,
    positionType: "base" | "float",
  ): void {
    const adjustedPrice = this.applySlippage(price, side);
    const commission = this.calculateCommission(adjustedPrice, quantity, side);

    const trade: BacktestTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      date,
      time,
      side,
      price: adjustedPrice,
      quantity,
      commission,
      positionType,
    };

    this.trades.push(trade);

    if (side === "buy") {
      const cost = adjustedPrice * quantity + commission;
      this.cash -= cost;
      if (positionType === "base") {
        this.avgPrice = adjustedPrice;
        this.position = quantity;
      }
    } else {
      const proceeds = adjustedPrice * quantity - commission;
      this.cash += proceeds;
      if (positionType === "base") {
        const pnl = proceeds - this.avgPrice * quantity;
        console.log(`[Base Position Closed] PnL: ¥${pnl.toFixed(2)}`);
        this.position = 0;
        this.avgPrice = 0;
      }
    }
  }

  async run(): Promise<BacktestResult> {
    console.log(`\n=== 开始回测 ===`);
    console.log(`标的: ${this.config.symbol}`);
    console.log(`周期: ${this.config.startDate} ~ ${this.config.endDate}`);
    console.log(`初始资金: ¥${this.config.initialCapital.toLocaleString()}`);

    await this.loadHistoricalData();

    if (this.dailyData.length === 0) {
      console.error("No historical data loaded");
      return this.getEmptyResult();
    }

    console.log(`加载 ${this.dailyData.length} 个交易日数据\n`);

    for (const dayData of this.dailyData) {
      this.currentDate = dayData.date;
      this.strategy.updateEquity(this.cash + this.position * dayData.close, dayData.date);

      const buyTimes = ["14:30:00", "14:45:00", "15:00:00"];
      const sellTimes = ["09:35:00", "10:00:00", "14:00:00", "14:30:00"];

      for (let i = 0; i < buyTimes.length; i++) {
        const snapshot = this.simulateMarketSnapshot(
          dayData.date,
          buyTimes[i],
          dayData,
          0.7 + i * 0.1,
        );

        this.strategy.onMarketSnapshot(snapshot);

        if (Math.random() > 0.85) {
          const state = this.strategy.getState();
          if (state.phase === "idle") {
            const quantity = Math.floor(1000 / dayData.close / 100) * 100;
            if (quantity > 0 && this.cash > dayData.close * quantity * 1.001) {
              this.executeTrade("buy", dayData.close, quantity, dayData.date, buyTimes[i], "float");
              console.log(`[Buy] ${dayData.date} ${buyTimes[i]} @ ¥${dayData.close.toFixed(2)} x ${quantity}`);
            }
          }
        }
      }

      for (let i = 0; i < sellTimes.length; i++) {
        const snapshot = this.simulateMarketSnapshot(
          dayData.date,
          sellTimes[i],
          dayData,
          0.3 + i * 0.15,
        );

        this.strategy.onMarketSnapshot(snapshot);

        if (Math.random() > 0.9 && this.position > 0) {
          this.executeTrade("sell", dayData.close, this.position, dayData.date, sellTimes[i], "base");
          console.log(`[Sell] ${dayData.date} ${sellTimes[i]} @ ¥${dayData.close.toFixed(2)} x ${this.position}`);
          break;
        }

        if (Math.random() > 0.95 && this.trades.some((t) => t.date === dayData.date && t.side === "buy")) {
          const todayBuys = this.trades.filter((t) => t.date === dayData.date && t.side === "buy");
          if (todayBuys.length > 0) {
            const qty = Math.min(100, todayBuys[0].quantity);
            this.executeTrade("sell", dayData.close, qty, dayData.date, sellTimes[i], "float");
            console.log(`[Sell Float] ${dayData.date} @ ¥${dayData.close.toFixed(2)} x ${qty}`);
          }
        }
      }
    }

    const finalEquity = this.cash + this.position * this.dailyData[this.dailyData.length - 1].close;
    this.strategy.updateEquity(finalEquity, this.currentDate);

    const result = this.strategy.getBacktestResult();
    result.finalEquity = finalEquity;

    console.log(`\n=== 回测完成 ===`);
    console.log(`最终资金: ¥${finalEquity.toLocaleString()}`);
    console.log(`总收益率: ${(result.totalReturn * 100).toFixed(2)}%`);
    console.log(`年化收益率: ${(result.annualizedReturn * 100).toFixed(2)}%`);
    console.log(`胜率: ${(result.winRate * 100).toFixed(1)}%`);
    console.log(`盈亏比: ${result.profitLossRatio.toFixed(2)}`);
    console.log(`最大回撤: ${(result.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`夏普比率: ${result.sharpeRatio.toFixed(2)}`);
    console.log(`交易次数: ${result.totalTrades}`);
    console.log("================\n");

    return result;
  }

  private getEmptyResult(): BacktestResult {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      winRate: 0,
      profitLossRatio: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      totalTrades: 0,
      finalEquity: this.config.initialCapital,
      equityCurve: [],
      trades: [],
    };
  }

  getTrades(): BacktestTrade[] {
    return [...this.trades];
  }
}

export const createABCBacktestEngine = (config: BacktestConfig) =>
  new ABCBacktestEngine(config);

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const engine = createABCBacktestEngine(config);
  return engine.run();
}
