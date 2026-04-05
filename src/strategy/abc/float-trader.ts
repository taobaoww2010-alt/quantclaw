import type {
  FloatPosition,
  FloatTrade,
  MarketSnapshot,
  AuctionData,
  StrategyParams,
  OrderSide,
} from "./types.js";
import { DEFAULT_STRATEGY_PARAMS } from "./types.js";

export interface SignalResult {
  action: "buy" | "sell" | "hold";
  confidence: number;
  reason: string;
  details?: Record<string, unknown>;
}

export interface FloatTradeDecision {
  shouldTrade: boolean;
  action: "buy" | "sell" | "hold";
  quantity: number;
  reason: string;
  checks: {
    timeOk: boolean;
    weibiOk: boolean;
    pricePositionOk: boolean;
    riskOk: boolean;
    limitOk: boolean;
  };
}

export class FloatTrader {
  private params: StrategyParams;
  private lastBuyPrice?: number;
  private pauseUntil?: Date;

  constructor(params?: Partial<StrategyParams>) {
    this.params = { ...DEFAULT_STRATEGY_PARAMS, ...params };
  }

  updateParams(updates: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...updates };
  }

  checkAuctionSignals(auction: AuctionData, prevClose: number): SignalResult {
    const openRatio = (auction.price - prevClose) / prevClose;
    const volumeRatio = auction.matchedVolume / (prevClose * 10000);

    if (openRatio > 0.015 && volumeRatio > this.params.auctionVolumeThresholdHigh) {
      return {
        action: "hold",
        confidence: 0.8,
        reason: "高开放量，等待冲高机会",
        details: { openRatio, volumeRatio },
      };
    }

    if (openRatio > 0.015 && volumeRatio <= this.params.auctionVolumeThresholdLow) {
      return {
        action: "sell",
        confidence: 0.7,
        reason: "高开缩量，开盘先出1/3仓位",
        details: { openRatio, volumeRatio, ratio: 1 / 3 },
      };
    }

    if (openRatio < -0.015 && volumeRatio > this.params.auctionVolumeThresholdHigh) {
      return {
        action: "buy",
        confidence: 0.6,
        reason: "低开放量，观察3分钟",
        details: { openRatio, volumeRatio, observe: true },
      };
    }

    if (openRatio < -0.015 && volumeRatio <= this.params.auctionVolumeThresholdLow) {
      return {
        action: "hold",
        confidence: 0.5,
        reason: "低开缩量，正常按盘口信号",
        details: { openRatio, volumeRatio },
      };
    }

    return {
      action: "hold",
      confidence: 0.3,
      reason: "集合竞价信号不明显",
      details: { openRatio, volumeRatio },
    };
  }

  analyzeMarketSentiment(snapshot: MarketSnapshot): {
    weibiSignal: "positive" | "negative" | "neutral";
    weineiSignal: "positive" | "negative" | "neutral";
    crowding: "greedy" | "fearful" | "balanced";
  } {
    const weibiSignal =
      snapshot.weibi > 0.3 ? "positive" : snapshot.weibi < -0.3 ? "negative" : "neutral";

    const weineiSignal =
      snapshot.weinei > 0.3 ? "positive" : snapshot.weinei < -0.3 ? "negative" : "neutral";

    const avgBid = (snapshot.bid1Volume + snapshot.bid2Volume + snapshot.bid3Volume) / 3;
    const avgAsk = (snapshot.ask1Volume + snapshot.ask2Volume + snapshot.ask3Volume) / 3;

    let crowding: "greedy" | "fearful" | "balanced" = "balanced";
    if (avgBid > avgAsk * 2.5) {
      crowding = "greedy";
    } else if (avgAsk > avgBid * 2.5) {
      crowding = "fearful";
    }

    return { weibiSignal, weineiSignal, crowding };
  }

  matchProverbSignals(snapshot: MarketSnapshot, prevSnapshot?: MarketSnapshot): SignalResult {
    const { weibiSignal, weineiSignal, crowding } = this.analyzeMarketSentiment(snapshot);

    const openPrice = snapshot.open ?? snapshot.openPrice;
    const priceRising = snapshot.currentPrice > openPrice;
    const priceFalling = snapshot.currentPrice < openPrice;
    const volumeIncreasing = snapshot.volume > snapshot.amount * 0.001;
    const volumeDecreasing = snapshot.volume < snapshot.amount * 0.0005;

    if (weibiSignal === "positive" && crowding === "greedy" && priceRising && volumeIncreasing) {
      return {
        action: "sell",
        confidence: 0.85,
        reason: "委比正又高，放量价上冲 - 真强势，贪婪盘进场",
        details: { weibi: snapshot.weibi, crowding, pattern: "strong_bull" },
      };
    }

    if (weibiSignal === "positive" && crowding === "balanced" && !priceRising && volumeDecreasing) {
      return {
        action: "sell",
        confidence: 0.75,
        reason: "委比高为正，缩量价不动 - 假买盘，主力诱多",
        details: { weibi: snapshot.weibi, crowding, pattern: "fake_bull" },
      };
    }

    if (weibiSignal === "negative" && crowding === "fearful" && priceFalling && volumeIncreasing) {
      return {
        action: "buy",
        confidence: 0.8,
        reason: "委比负且低，放量价下砸 - 真抛压，恐慌盘出逃",
        details: { weibi: snapshot.weibi, crowding, pattern: "panic_sell" },
      };
    }

    if (weibiSignal === "negative" && crowding === "balanced" && !priceFalling) {
      return {
        action: "hold",
        confidence: 0.6,
        reason: "委比低为负，缩量价企稳 - 抛压尽，反弹可期待",
        details: { weibi: snapshot.weibi, crowding, pattern: "stabilizing" },
      };
    }

    if (
      prevSnapshot &&
      Math.abs(snapshot.weibi - prevSnapshot.weibi) > 0.2 &&
      snapshot.weibi > 0.1
    ) {
      return {
        action: "hold",
        confidence: 0.4,
        reason: "委比忽大变，撤单又重挂 - 骗线多，假信号",
        details: { weibiChange: snapshot.weibi - prevSnapshot.weibi, pattern: "fake_signal" },
      };
    }

    if (priceRising && weibiSignal === "negative" && volumeDecreasing) {
      return {
        action: "sell",
        confidence: 0.7,
        reason: "价涨委比降，量缩要提防 - 涨不动，随时回调",
        details: { priceRising, weibiSignal, pattern: "divergence" },
      };
    }

    if (priceFalling && weibiSignal === "positive" && volumeIncreasing) {
      return {
        action: "buy",
        confidence: 0.65,
        reason: "价跌委比升，量增有承接 - 跌放缓，分批可低吸",
        details: { priceFalling, weibiSignal, pattern: "support" },
      };
    }

    return {
      action: "hold",
      confidence: 0.3,
      reason: "无明确口诀信号",
      details: { weibiSignal, weineiSignal, crowding },
    };
  }

  checkBuyTime(currentTime: Date): boolean {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    if (hours < 14 || (hours === 14 && minutes < 30)) {
      return false;
    }
    if (hours >= 15) {
      return false;
    }
    return true;
  }

  checkSellTime(currentTime: Date): boolean {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();

    if (hours < 9 || (hours === 9 && minutes < 30)) {
      return false;
    }
    return true;
  }

  checkWeibiForBuy(weibi: number): boolean {
    return weibi >= this.params.weibiBuyRange.min && weibi <= this.params.weibiBuyRange.max;
  }

  checkWeibiForSell(weibi: number): boolean {
    return weibi >= this.params.weibiSellRange.min && weibi <= this.params.weibiSellRange.max;
  }

  calculatePricePosition(currentPrice: number, dayHigh: number, dayLow: number): number {
    if (dayHigh === dayLow) {
      return 0.5;
    }
    return (currentPrice - dayLow) / (dayHigh - dayLow);
  }

  isGoodBuyPricePosition(pricePosition: number): boolean {
    return pricePosition <= this.params.pricePositionLow;
  }

  createFloatPosition(
    symbol: string,
    price: number,
    quantity: number,
    currentTime: string,
  ): FloatPosition {
    return {
      id: `float_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      type: "float",
      quantity,
      avgPrice: price,
      entryTime: currentTime,
      lastTradeTime: currentTime,
      trades: [
        {
          id: `trade_${Date.now()}`,
          side: "buy",
          price,
          quantity,
          time: currentTime,
          commission: 0,
        },
      ],
      stopLoss: price * (1 - this.params.floatStopLoss),
      takeProfit: price * (1 + this.params.floatTakeProfit),
      closed: false,
    };
  }

  addTradeToPosition(
    position: FloatPosition,
    side: OrderSide,
    price: number,
    quantity: number,
    currentTime: string,
    commission: number,
  ): FloatPosition {
    const newTrade: FloatTrade = {
      id: `trade_${Date.now()}`,
      side,
      price,
      quantity,
      time: currentTime,
      commission,
    };

    let newAvgPrice = position.avgPrice;
    let newQuantity = position.quantity;

    if (side === "buy") {
      const totalCost = position.avgPrice * position.quantity + price * quantity;
      newQuantity = position.quantity + quantity;
      newAvgPrice = totalCost / newQuantity;
    } else {
      newQuantity = position.quantity - quantity;
    }

    return {
      ...position,
      avgPrice: newAvgPrice,
      quantity: newQuantity,
      lastTradeTime: currentTime,
      trades: [...position.trades, newTrade],
      stopLoss: newAvgPrice * (1 - this.params.floatStopLoss),
      takeProfit: newAvgPrice * (1 + this.params.floatTakeProfit),
    };
  }

  closeFloatPosition(
    position: FloatPosition,
    exitPrice: number,
    currentTime: string,
  ): { position: FloatPosition; realizedPnl: number } {
    const realizedPnl = (exitPrice - position.avgPrice) * position.quantity;

    return {
      position: {
        ...position,
        closed: true,
        closeTime: currentTime,
        closePrice: exitPrice,
        pnl: realizedPnl,
      },
      realizedPnl,
    };
  }

  shouldCloseAtEndOfDay(position: FloatPosition, hasSignal: boolean): boolean {
    if (hasSignal) {
      return false;
    }

    const lastTrade = position.trades[position.trades.length - 1];
    if (!lastTrade) {
      return true;
    }

    const tradeDate = new Date(lastTrade.time).toDateString();
    const today = new Date().toDateString();

    return tradeDate !== today;
  }

  pauseBuying(reason: string): void {
    this.pauseUntil = new Date(Date.now() + 5 * 60 * 1000);
    console.log(`[FloatTrader] 暂停买入: ${reason}, 暂停至 ${this.pauseUntil.toISOString()}`);
  }

  resumeBuying(): void {
    this.pauseUntil = undefined;
  }

  isBuyingPaused(): boolean {
    if (!this.pauseUntil) {
      return false;
    }
    return new Date() < this.pauseUntil;
  }

  setLastBuyPrice(price: number): void {
    this.lastBuyPrice = price;
  }

  getLastBuyPrice(): number | undefined {
    return this.lastBuyPrice;
  }

  makeTradeDecision(
    snapshot: MarketSnapshot,
    positions: FloatPosition[],
    todayTrades: FloatTrade[],
    currentTime: Date,
  ): FloatTradeDecision {
    const checks = {
      timeOk: true,
      weibiOk: true,
      pricePositionOk: true,
      riskOk: true,
      limitOk: true,
    };

    const pricePosition = this.calculatePricePosition(
      snapshot.currentPrice,
      snapshot.high,
      snapshot.low,
    );

    const hasOpenPositions = positions.filter((p) => !p.closed).length > 0;

    if (hasOpenPositions) {
      const checkSellTime = this.checkSellTime(currentTime);
      const checkWeibiSell = this.checkWeibiForSell(snapshot.weibi);
      const checkRisk = this.checkRiskForSell(positions, snapshot.currentPrice);

      if (checkSellTime && checkWeibiSell && checkRisk.allowed) {
        const sellPosition = positions.find((p) => !p.closed);
        if (sellPosition) {
          return {
            shouldTrade: true,
            action: "sell",
            quantity: sellPosition.quantity,
            reason: `卖出信号: ${checkRisk.reason || "符合卖出条件"}`,
            checks: {
              ...checks,
              timeOk: checkSellTime,
              weibiOk: checkWeibiSell,
              riskOk: checkRisk.allowed,
            },
          };
        }
      }
    }

    const checkBuyTime = this.checkBuyTime(currentTime);
    const checkWeibiBuy = this.checkWeibiForBuy(snapshot.weibi);
    const checkPosition = this.isGoodBuyPricePosition(pricePosition);
    const checkDailyLimit =
      todayTrades.filter((t) => t.side === "buy").length < this.params.dailyMaxFloatTrades;
    const checkPaused = !this.isBuyingPaused();

    if (checkBuyTime && checkWeibiBuy && checkPosition && checkDailyLimit && checkPaused) {
      return {
        shouldTrade: true,
        action: "buy",
        quantity: this.params.positionSizePerTrade,
        reason: `买入信号: 委比 ${(snapshot.weibi * 100).toFixed(1)}%, 价格位置 ${(pricePosition * 100).toFixed(1)}%`,
        checks: {
          timeOk: checkBuyTime,
          weibiOk: checkWeibiBuy,
          pricePositionOk: checkPosition,
          riskOk: true,
          limitOk: checkDailyLimit,
        },
      };
    }

    return {
      shouldTrade: false,
      action: "hold",
      quantity: 0,
      reason: "不满足交易条件",
      checks: {
        timeOk: checkBuyTime,
        weibiOk: checkWeibiBuy,
        pricePositionOk: checkPosition,
        riskOk: true,
        limitOk: checkDailyLimit,
      },
    };
  }

  private checkRiskForSell(
    positions: FloatPosition[],
    currentPrice: number,
  ): { allowed: boolean; reason?: string } {
    for (const position of positions) {
      if (position.closed) {
        continue;
      }

      const pnlPct = (currentPrice - position.avgPrice) / position.avgPrice;

      if (pnlPct >= this.params.floatTakeProfit) {
        return { allowed: true, reason: `止盈: 盈利 ${(pnlPct * 100).toFixed(1)}%` };
      }

      if (pnlPct <= -this.params.floatStopLoss) {
        return { allowed: true, reason: `止损: 亏损 ${(pnlPct * 100).toFixed(1)}%` };
      }
    }

    return { allowed: false };
  }
}

export const createFloatTrader = (params?: Partial<StrategyParams>) => new FloatTrader(params);
