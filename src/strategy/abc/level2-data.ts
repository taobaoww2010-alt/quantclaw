import { EventEmitter } from "node:events";
import type { Level2Data, MarketSnapshot, AuctionData } from "./types.js";

export interface Level2Config {
  symbol: string;
  snapshotInterval: number;
  enableOrderQueue: boolean;
}

export interface OrderQueueItem {
  price: number;
  volume: number;
  orderType: "buy" | "sell";
  timestamp: number;
}

export interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  direction: "buy" | "sell";
}

export class Level2DataProvider extends EventEmitter {
  private config: Level2Config;
  private connected = false;
  private snapshotInterval?: NodeJS.Timeout;
  private tickHistory: TickData[] = [];
  private orderQueueHistory: OrderQueueItem[] = [];
  private lastSnapshot?: Level2Data;
  private bidVolumes: number[] = [];
  private askVolumes: number[] = [];
  private avgBidVolume5min = 0;
  private avgAskVolume5min = 0;

  constructor(config: Partial<Level2Config> = {}) {
    super();
    this.config = {
      symbol: config.symbol || "600519",
      snapshotInterval: config.snapshotInterval || 3000,
      enableOrderQueue: config.enableOrderQueue ?? false,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit("connected", { symbol: this.config.symbol });
    console.log(`[Level2] Connected to ${this.config.symbol}`);
  }

  disconnect(): void {
    this.connected = false;
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    this.emit("disconnected");
    console.log("[Level2] Disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  startSnapshot(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }

    this.snapshotInterval = setInterval(() => {
      if (this.connected) {
        this.generateSnapshot();
      }
    }, this.config.snapshotInterval);
  }

  private generateSnapshot(): void {
    const snapshot = this.createSnapshot();
    this.lastSnapshot = snapshot;
    this.emit("snapshot", snapshot);
  }

  private createSnapshot(): Level2Data {
    const baseVolume = 10000;
    const now = Date.now();

    this.bidVolumes = [
      Math.floor(Math.random() * 50000) + baseVolume,
      Math.floor(Math.random() * 40000) + baseVolume * 0.8,
      Math.floor(Math.random() * 30000) + baseVolume * 0.6,
      Math.floor(Math.random() * 25000) + baseVolume * 0.5,
      Math.floor(Math.random() * 20000) + baseVolume * 0.4,
      Math.floor(Math.random() * 15000) + baseVolume * 0.3,
      Math.floor(Math.random() * 10000) + baseVolume * 0.2,
      Math.floor(Math.random() * 8000) + baseVolume * 0.15,
      Math.floor(Math.random() * 6000) + baseVolume * 0.1,
      Math.floor(Math.random() * 4000) + baseVolume * 0.08,
    ];

    this.askVolumes = [
      Math.floor(Math.random() * 50000) + baseVolume,
      Math.floor(Math.random() * 40000) + baseVolume * 0.8,
      Math.floor(Math.random() * 30000) + baseVolume * 0.6,
      Math.floor(Math.random() * 25000) + baseVolume * 0.5,
      Math.floor(Math.random() * 20000) + baseVolume * 0.4,
      Math.floor(Math.random() * 15000) + baseVolume * 0.3,
      Math.floor(Math.random() * 10000) + baseVolume * 0.2,
      Math.floor(Math.random() * 8000) + baseVolume * 0.15,
      Math.floor(Math.random() * 6000) + baseVolume * 0.1,
      Math.floor(Math.random() * 4000) + baseVolume * 0.08,
    ];

    const totalBid = this.bidVolumes.reduce((a, b) => a + b, 0);
    const totalAsk = this.askVolumes.reduce((a, b) => a + b, 0);

    const weibi = (totalBid - totalAsk) / (totalBid + totalAsk);
    const weinei = (totalBid - totalAsk) / (totalBid + totalAsk) * 0.5;

    return {
      timestamp: now,
      bidPrices: Array.from({ length: 10 }, (_, i) => 100 - i * 0.01),
      bidVolumes: this.bidVolumes,
      askPrices: Array.from({ length: 10 }, (_, i) => 100.01 + i * 0.01),
      askVolumes: this.askVolumes,
      weibi,
      weinei,
    };
  }

  processTick(price: number, volume: number, direction: "buy" | "sell"): void {
    const tick: TickData = {
      timestamp: Date.now(),
      price,
      volume,
      direction,
    };

    this.tickHistory.push(tick);
    if (this.tickHistory.length > 10000) {
      this.tickHistory = this.tickHistory.slice(-5000);
    }

    this.emit("tick", tick);
  }

  processOrderQueue(item: OrderQueueItem): void {
    this.orderQueueHistory.push(item);
    if (this.orderQueueHistory.length > 5000) {
      this.orderQueueHistory = this.orderQueueHistory.slice(-2500);
    }
    this.emit("orderQueue", item);
  }

  getLastSnapshot(): Level2Data | undefined {
    return this.lastSnapshot;
  }

  getTickHistory(seconds: number = 300): TickData[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.tickHistory.filter((t) => t.timestamp > cutoff);
  }

  calculateAverageBidVolume(windowSeconds: number = 300): number {
    const cutoff = Date.now() - windowSeconds * 1000;
    const recentTicks = this.tickHistory.filter((t) => t.timestamp > cutoff);
    
    if (recentTicks.length === 0) return this.avgBidVolume5min;

    const avgBuyVolume = recentTicks
      .filter((t) => t.direction === "buy")
      .reduce((sum, t) => sum + t.volume, 0) / windowSeconds;

    const avgSellVolume = recentTicks
      .filter((t) => t.direction === "sell")
      .reduce((sum, t) => sum + t.volume, 0) / windowSeconds;

    return (avgBuyVolume + avgSellVolume) / 2;
  }

  calculateOrderQueueRatio(): { buyRatio: number; sellRatio: number } {
    const cutoff = Date.now() - 60 * 1000;
    const recentOrders = this.orderQueueHistory.filter((o) => o.timestamp > cutoff);

    const buyOrders = recentOrders.filter((o) => o.orderType === "buy");
    const sellOrders = recentOrders.filter((o) => o.orderType === "sell");

    const buyVolume = buyOrders.reduce((sum, o) => sum + o.volume, 0);
    const sellVolume = sellOrders.reduce((sum, o) => sum + o.volume, 0);
    const total = buyVolume + sellVolume;

    return {
      buyRatio: total > 0 ? buyVolume / total : 0.5,
      sellRatio: total > 0 ? sellVolume / total : 0.5,
    };
  }

  detectPiling(
    currentBidVolumes: number[],
    avgBidVolume: number,
    multiple: number = 2.5,
  ): number {
    let count = 0;
    const levelsToCheck = Math.min(3, currentBidVolumes.length);

    for (let i = 0; i < levelsToCheck; i++) {
      if (currentBidVolumes[i] > avgBidVolume * multiple) {
        count++;
      }
    }

    return count;
  }

  detectOrderWithdrawals(windowSeconds: number = 60): {
    buyWithdrawals: number;
    sellWithdrawals: number;
  } {
    const cutoff = Date.now() - windowSeconds * 1000;
    const recentOrders = this.orderQueueHistory.filter((o) => o.timestamp > cutoff);

    let buyWithdrawals = 0;
    let sellWithdrawals = 0;

    for (let i = 1; i < recentOrders.length; i++) {
      const current = recentOrders[i];
      const previous = recentOrders[i - 1];

      if (current.timestamp - previous.timestamp < 1000) {
        if (current.orderType === "buy" && current.volume < previous.volume * 0.5) {
          buyWithdrawals++;
        }
        if (current.orderType === "sell" && current.volume < previous.volume * 0.5) {
          sellWithdrawals++;
        }
      }
    }

    return { buyWithdrawals, sellWithdrawals };
  }

  calculateMarketCapVolume(windowSeconds: number = 300): {
    marketCapBuy: number;
    marketCapSell: number;
  } {
    const cutoff = Date.now() - windowSeconds * 1000;
    const recentTicks = this.tickHistory.filter((t) => t.timestamp > cutoff);

    const marketCapBuy = recentTicks
      .filter((t) => t.direction === "buy")
      .reduce((sum, t) => sum + t.price * t.volume, 0);

    const marketCapSell = recentTicks
      .filter((t) => t.direction === "sell")
      .reduce((sum, t) => sum + t.price * t.volume, 0);

    return { marketCapBuy, marketCapSell };
  }

  analyzeSentiment(): {
    sentiment: "bullish" | "bearish" | "neutral";
    strength: number;
    crowding: "greedy" | "fearful" | "balanced";
  } {
    if (!this.lastSnapshot) {
      return { sentiment: "neutral", strength: 0, crowding: "balanced" };
    }

    const { weibi, bidVolumes, askVolumes } = this.lastSnapshot;
    const avgBid = bidVolumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const avgAsk = askVolumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
    let strength = Math.abs(weibi);

    if (weibi > 0.3) {
      sentiment = avgBid > avgAsk * 2 ? "bullish" : "neutral";
    } else if (weibi < -0.3) {
      sentiment = avgAsk > avgBid * 2 ? "bearish" : "neutral";
    }

    let crowding: "greedy" | "fearful" | "balanced" = "balanced";
    if (avgBid > avgAsk * 2.5) {
      crowding = "greedy";
    } else if (avgAsk > avgBid * 2.5) {
      crowding = "fearful";
    }

    return { sentiment, strength, crowding };
  }
}

export class AuctionDataProvider {
  private auctionData: AuctionData[] = [];

  recordAuction(data: AuctionData): void {
    this.auctionData.push(data);
    this.emit("auction", data);
  }

  getLatestAuction(): AuctionData | undefined {
    return this.auctionData[this.auctionData.length - 1];
  }

  getAuctionHistory(): AuctionData[] {
    return [...this.auctionData];
  }

  analyzeAuctionSignal(
    currentAuction: AuctionData,
    prevClose: number,
    yesterdayVolume: number,
  ): {
    signal: "bullish" | "bearish" | "neutral";
    confidence: number;
    action: string;
  } {
    const openRatio = (currentAuction.price - prevClose) / prevClose;
    const volumeRatio = currentAuction.matchedVolume / yesterdayVolume;

    if (openRatio > 0.015 && volumeRatio > 0.05) {
      return {
        signal: "bullish",
        confidence: 0.8,
        action: "等待冲高后卖出",
      };
    }

    if (openRatio > 0.015 && volumeRatio <= 0.02) {
      return {
        signal: "bearish",
        confidence: 0.7,
        action: "开盘先出1/3仓位",
      };
    }

    if (openRatio < -0.015 && volumeRatio > 0.05) {
      return {
        signal: "bearish",
        confidence: 0.6,
        action: "观察3分钟，不能拉回则止损",
      };
    }

    if (openRatio < -0.015 && volumeRatio <= 0.02) {
      return {
        signal: "neutral",
        confidence: 0.5,
        action: "正常按盘口信号",
      };
    }

    return {
      signal: "neutral",
      confidence: 0.3,
      action: "观望",
    };
  }
}

export const createLevel2Provider = (config?: Partial<Level2Config>) =>
  new Level2DataProvider(config);

export const createAuctionProvider = () => new AuctionDataProvider();
