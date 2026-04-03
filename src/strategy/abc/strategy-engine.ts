import type {
  BasePosition,
  FloatPosition,
  FloatTrade,
  MarketSnapshot,
  StrategyState,
  StrategyParams,
  DEFAULT_STRATEGY_PARAMS,
  OrderSide,
} from "./types.js";
import { StockSelector, createStockSelector } from "./stock-selector.js";
import { RiskController, createRiskController } from "./risk-control.js";
import { FloatTrader, createFloatTrader } from "./float-trader.js";
import { BasePositionManager, createBasePositionManager } from "./base-position.js";
import type { FeishuConfig } from "./notifications.js";

export interface StrategyConfig {
  symbol: string;
  capital: number;
  mode: "backtest" | "paper" | "live";
  params?: Partial<StrategyParams>;
  notifications?: {
    telegram?: { token: string; chatId: string };
    feishu?: FeishuConfig;
  };
}

export interface StrategyEvent {
  type: "signal" | "order" | "risk" | "state_change";
  timestamp: string;
  data: Record<string, unknown>;
}

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
  trades: {
    entryDate: string;
    exitDate: string;
    pnl: number;
    pnlPct: number;
  }[];
}

export class ABCStrategyEngine {
  private config: StrategyConfig;
  private state: StrategyState;
  private selector: StockSelector;
  private riskController: RiskController;
  private floatTrader: FloatTrader;
  private basePositionManager: BasePositionManager;
  private events: StrategyEvent[] = [];
  private equityCurve: { date: string; equity: number }[] = [];
  private currentEquity: number;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.currentEquity = config.capital;

    this.state = {
      phase: "idle",
      floatPositions: [],
      orders: [],
      todayTrades: [],
      consecutiveNoTradeDays: 0,
      forcedRestDays: 0,
      weeklyStats: {
        weekStart: new Date().toISOString().split("T")[0],
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        maxDrawdown: 0,
        accountValueStart: config.capital,
      },
    };

    this.selector = createStockSelector();
    this.riskController = createRiskController(config.capital, config.params);
    this.floatTrader = createFloatTrader(config.params);
    this.basePositionManager = createBasePositionManager(config.params);
  }

  getState(): StrategyState {
    return { ...this.state };
  }

  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  getEvents(): StrategyEvent[] {
    return [...this.events];
  }

  private emit(type: StrategyEvent["type"], data: Record<string, unknown>): void {
    this.events.push({
      type,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  updateEquity(value: number, date?: string): void {
    this.currentEquity = value;
    if (date) {
      this.equityCurve.push({ date, equity: value });
    }
  }

  async selectStock(): Promise<{ code: string; name: string } | null> {
    if (this.config.mode === "backtest") {
      return { code: this.config.symbol, name: "" };
    }

    try {
      const candidates = await this.selector.screenStocks();
      if (candidates.length > 0) {
        const stock = candidates[0];
        return { code: stock.code, name: stock.name };
      }
    } catch (error) {
      console.error("Stock selection error:", error);
    }
    return null;
  }

  onMarketSnapshot(snapshot: MarketSnapshot): void {
    if (this.state.forcedRestDays > 0) {
      this.state.forcedRestDays--;
      this.emit("risk", { action: "forced_rest", remaining: this.state.forcedRestDays });
      return;
    }

    if (this.state.phase === "idle") {
      return;
    }

    if (this.state.phase === "watching") {
      return;
    }

    if (this.state.phase === "base_built" || this.state.phase === "trading") {
      this.handleTradingPhase(snapshot);
    }
  }

  private handleTradingPhase(snapshot: MarketSnapshot): void {
    const decision = this.floatTrader.makeTradeDecision(
      snapshot,
      this.state.floatPositions,
      this.state.todayTrades,
      new Date(snapshot.timestamp),
    );

    if (decision.shouldTrade) {
      this.emit("signal", {
        action: decision.action,
        reason: decision.reason,
        price: snapshot.currentPrice,
        quantity: decision.quantity,
      });
    }

    if (this.state.phase === "trading") {
      const basePos = this.state.basePosition;
      if (basePos && !basePos.closed) {
        const status = this.basePositionManager.checkBasePositionStatus(
          basePos,
          snapshot.currentPrice,
          new Date().toISOString().split("T")[0],
        );

        if (status.action !== "hold") {
          this.emit("risk", {
            action: status.action,
            reason: status.reason,
            pnlPct: status.pnlPct,
          });
        }
      }
    }
  }

  executeBuy(
    symbol: string,
    price: number,
    quantity: number,
    positionType: "base" | "float",
  ): void {
    const currentTime = new Date().toISOString();

    if (positionType === "base") {
      const position = this.basePositionManager.createBasePosition(
        symbol,
        price,
        quantity,
        currentTime.split("T")[0],
        "ABC策略",
      );

      this.state.basePosition = position;
      this.state.phase = "base_built";

      this.emit("state_change", {
        from: "watching",
        to: "base_built",
        position,
      });
    } else {
      const position = this.floatTrader.createFloatPosition(
        symbol,
        price,
        quantity,
        currentTime,
      );

      this.state.floatPositions.push(position);
      this.state.todayTrades.push(...position.trades);

      if (this.state.phase === "base_built") {
        this.state.phase = "trading";
      }

      this.emit("order", {
        action: "buy",
        positionType: "float",
        price,
        quantity,
        position,
      });
    }

    this.state.lastBaseTradeTime = currentTime;
    this.state.consecutiveNoTradeDays = 0;
  }

  executeSell(
    positionId: string,
    price: number,
    positionType: "base" | "float",
  ): { realizedPnl: number } {
    const currentTime = new Date().toISOString();

    if (positionType === "base") {
      const pos = this.state.basePosition;
      if (pos && pos.id === positionId) {
        const result = this.basePositionManager.closeBasePosition(
          pos,
          price,
          currentTime.split("T")[0],
          "手动平仓",
        );

        this.state.basePosition = result.position;
        this.state.floatPositions = [];
        this.state.phase = "idle";

        this.riskController.addTrade(result.realizedPnl, currentTime);
        this.riskController.onBasePositionClosed();

        this.emit("state_change", {
          from: "trading",
          to: "idle",
          reason: "底仓平仓",
        });

        return { realizedPnl: result.realizedPnl };
      }
    } else {
      const idx = this.state.floatPositions.findIndex((p) => p.id === positionId);
      if (idx !== -1) {
        const pos = this.state.floatPositions[idx];
        const result = this.floatTrader.closeFloatPosition(pos, price, currentTime);

        this.state.floatPositions[idx] = result.position;
        this.riskController.addTrade(result.realizedPnl, currentTime);

        if (result.realizedPnl > 0) {
          this.state.weeklyStats.winningTrades++;
        } else {
          this.state.weeklyStats.losingTrades++;
        }
        this.state.weeklyStats.totalTrades++;
        this.state.weeklyStats.totalPnl += result.realizedPnl;

        this.emit("order", {
          action: "sell",
          positionType: "float",
          price,
          positionId,
          realizedPnl: result.realizedPnl,
        });

        const openPositions = this.state.floatPositions.filter((p) => !p.closed);
        if (openPositions.length === 0 && this.state.basePosition?.closed) {
          this.state.phase = "idle";
        }

        return { realizedPnl: result.realizedPnl };
      }
    }

    return { realizedPnl: 0 };
  }

  buildBasePosition(symbol: string, price: number, capital: number): void {
    const quantity = this.basePositionManager.estimatePositionSize(capital, price);
    if (quantity > 0) {
      this.executeBuy(symbol, price, quantity, "base");
    }
  }

  checkRiskAndPause(): void {
    const openPositions = this.state.floatPositions.filter((p) => !p.closed);
    const lastTrade = this.state.todayTrades[this.state.todayTrades.length - 1];

    if (lastTrade && lastTrade.side === "buy") {
      const pauseCheck = this.riskController.checkPriceDropPause(
        lastTrade.price,
        this.floatTrader.getLastBuyPrice() || lastTrade.price,
      );

      if (!pauseCheck.allowed) {
        this.floatTrader.pauseBuying(pauseCheck.reason || "价格跌破成本");
      }
    }
  }

  getBacktestResult(): BacktestResult {
    const equityCurve = this.equityCurve;
    const finalEquity = this.currentEquity;
    const totalReturn = (finalEquity - this.config.capital) / this.config.capital;

    const trades = this.state.weeklyStats.totalTrades;
    const wins = this.state.weeklyStats.winningTrades;
    const winRate = trades > 0 ? wins / trades : 0;

    const totalPnl = this.state.weeklyStats.totalPnl;
    const avgWin = wins > 0 ? totalPnl / wins : 0;
    const avgLoss = trades - wins > 0 ? Math.abs(totalPnl - avgWin * wins) / (trades - wins) : 0;
    const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    let maxDrawdown = 0;
    let peak = this.config.capital;
    for (const point of equityCurve) {
      if (point.equity > peak) peak = point.equity;
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const returns = equityCurve.slice(1).map((point, i) => {
      return (point.equity - equityCurve[i].equity) / equityCurve[i].equity;
    });
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdReturn = Math.sqrt(
      returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length || 1),
    );
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    const days = equityCurve.length > 1 ? equityCurve.length : 1;
    const annualizedReturn = (1 + totalReturn) ** (365 / days) - 1;

    return {
      totalReturn,
      annualizedReturn,
      winRate,
      profitLossRatio,
      maxDrawdown,
      sharpeRatio,
      totalTrades: trades,
      finalEquity,
      equityCurve,
      trades: [],
    };
  }

  reset(): void {
    this.state = {
      phase: "idle",
      floatPositions: [],
      orders: [],
      todayTrades: [],
      consecutiveNoTradeDays: 0,
      forcedRestDays: 0,
      weeklyStats: {
        weekStart: new Date().toISOString().split("T")[0],
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        maxDrawdown: 0,
        accountValueStart: this.config.capital,
      },
    };
    this.events = [];
    this.equityCurve = [];
    this.currentEquity = this.config.capital;
  }

  printState(): void {
    console.log("\n=== ABC策略状态 ===");
    console.log(`阶段: ${this.state.phase}`);
    console.log(`账户: ¥${this.currentEquity.toFixed(2)}`);
    console.log(`浮仓数: ${this.state.floatPositions.filter((p) => !p.closed).length}`);
    if (this.state.basePosition && !this.state.basePosition.closed) {
      console.log(`底仓: ${this.state.basePosition.quantity}股 @ ¥${this.state.basePosition.avgPrice}`);
    }
    console.log(`本周交易: ${this.state.weeklyStats.totalTrades}笔 (胜:${this.state.weeklyStats.winningTrades} 负:${this.state.weeklyStats.losingTrades})`);
    console.log("=================\n");
  }
}

export const createABCStrategyEngine = (config: StrategyConfig) =>
  new ABCStrategyEngine(config);
