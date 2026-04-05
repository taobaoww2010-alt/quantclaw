import type { BasePosition, StrategyParams } from "./types.js";
import { DEFAULT_STRATEGY_PARAMS } from "./types.js";

export interface BasePositionCheckResult {
  canBuild: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export class BasePositionManager {
  private params: StrategyParams;

  constructor(params?: Partial<StrategyParams>) {
    this.params = { ...DEFAULT_STRATEGY_PARAMS, ...params };
  }

  updateParams(updates: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...updates };
  }

  checkBasePositionReadiness(
    marketData: {
      currentPrice: number;
      high: number;
      low: number;
      weibi: number;
      bid1Volume: number;
      bid2Volume: number;
      bid3Volume: number;
    },
    avgBidVolume5min: number,
    marketCapBuyVolume: number,
    chipsPeak集中度: number,
    prevChipsPeak集中度: number,
    shareholderCount: number,
  ): BasePositionCheckResult {
    const pricePosition = this.calculatePricePosition(
      marketData.currentPrice,
      marketData.high,
      marketData.low,
    );

    const _avgBid = (marketData.bid1Volume + marketData.bid2Volume + marketData.bid3Volume) / 3;
    const pilingCount = this.countPilingEvents(
      marketData.bid1Volume,
      marketData.bid2Volume,
      marketData.bid3Volume,
      avgBidVolume5min,
    );

    const reasons: string[] = [];

    if (pilingCount < 3) {
      reasons.push(`买盘堆积次数不足: ${pilingCount}/3`);
    }

    if (marketCapBuyVolume < 10000) {
      reasons.push(`追高单子量不足: ${marketCapBuyVolume} < 10000`);
    }

    if (chipsPeak集中度 <= prevChipsPeak集中度) {
      reasons.push(`筹码集中度未提高: ${chipsPeak集中度} <= ${prevChipsPeak集中度}`);
    }

    if (shareholderCount < this.params.shareholderCountMin) {
      reasons.push(`股东人数不足: ${shareholderCount} < ${this.params.shareholderCountMin}`);
    }

    return {
      canBuild: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join("; ") : "满足底仓建立条件",
      details: {
        pilingCount,
        marketCapBuyVolume,
        chips集中度: chipsPeak集中度,
        prev集中度: prevChipsPeak集中度,
        股东人数: shareholderCount,
        pricePosition,
      },
    };
  }

  private countPilingEvents(
    bid1: number,
    bid2: number,
    bid3: number,
    avgBidVolume5min: number,
  ): number {
    const multiple = this.params.pilingMultiple;
    let count = 0;

    if (bid1 > avgBidVolume5min * multiple) {
      count++;
    }
    if (bid2 > avgBidVolume5min * multiple) {
      count++;
    }
    if (bid3 > avgBidVolume5min * multiple) {
      count++;
    }

    return count;
  }

  calculatePricePosition(currentPrice: number, high: number, low: number): number {
    if (high === low) {
      return 0.5;
    }
    return (currentPrice - low) / (high - low);
  }

  createBasePosition(
    symbol: string,
    price: number,
    quantity: number,
    entryDate: string,
    strategy: string,
  ): BasePosition {
    return {
      id: `base_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      type: "base",
      quantity,
      avgPrice: price,
      entryDate,
      strategy,
      stopLoss: price * (1 - this.params.baseStopLoss),
      takeProfit: price * (1 + this.params.baseTakeProfit),
      closed: false,
    };
  }

  checkBasePositionStatus(
    position: BasePosition,
    currentPrice: number,
    currentDate: string,
  ): {
    action: "hold" | "stop_loss" | "take_profit" | "close_no_trade";
    reason: string;
    pnlPct?: number;
  } {
    if (position.closed) {
      return { action: "hold", reason: "底仓已平" };
    }

    const pnlPct = (currentPrice - position.avgPrice) / position.avgPrice;
    const daysSinceEntry = this.getDaysBetween(position.entryDate, currentDate);

    if (pnlPct <= -this.params.baseStopLoss) {
      return {
        action: "stop_loss",
        reason: `亏损 ${(pnlPct * 100).toFixed(1)}% 达到止损线`,
        pnlPct,
      };
    }

    if (pnlPct >= this.params.baseTakeProfit) {
      return {
        action: "take_profit",
        reason: `盈利 ${(pnlPct * 100).toFixed(1)}% 达到止盈线`,
        pnlPct,
      };
    }

    if (daysSinceEntry >= this.params.baseHoldMaxDays) {
      return {
        action: "close_no_trade",
        reason: `持有 ${daysSinceEntry} 天无交易机会`,
        pnlPct,
      };
    }

    return {
      action: "hold",
      reason: `正常持有，盈亏 ${(pnlPct * 100).toFixed(1)}%`,
      pnlPct,
    };
  }

  closeBasePosition(
    position: BasePosition,
    exitPrice: number,
    exitDate: string,
    _reason: string,
  ): { position: BasePosition; realizedPnl: number } {
    const realizedPnl = (exitPrice - position.avgPrice) * position.quantity;

    return {
      position: {
        ...position,
        closed: true,
        closeDate: exitDate,
        closePrice: exitPrice,
        pnl: realizedPnl,
      },
      realizedPnl,
    };
  }

  calculatePositionValue(position: BasePosition, currentPrice: number): number {
    return position.quantity * currentPrice;
  }

  calculateUnrealizedPnl(position: BasePosition, currentPrice: number): number {
    if (position.closed) {
      return position.pnl || 0;
    }
    return (currentPrice - position.avgPrice) * position.quantity;
  }

  private getDaysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
  }

  estimatePositionSize(capital: number, price: number): number {
    const targetValue = capital * this.params.basePositionRatio;
    return Math.floor(targetValue / price / 100) * 100;
  }
}

export const createBasePositionManager = (params?: Partial<StrategyParams>) =>
  new BasePositionManager(params);
