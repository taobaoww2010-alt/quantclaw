import { execFileSync } from "node:child_process";
import * as path from "node:path";
import type {
  StockFundamental,
  StockMarketData,
  StockSelectionCriteria,
  DEFAULT_SELECTION_CRITERIA,
} from "./types.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const FETCHER_PATH = path.join(PROJECT_ROOT, "data", "fetcher.py");

export class StockSelector {
  private pythonCmd: string;
  private criteria: StockSelectionCriteria;

  constructor(criteria?: Partial<StockSelectionCriteria>) {
    this.pythonCmd = process.env.QUANTCLAW_PYTHON || "python3";
    this.criteria = { ...DEFAULT_SELECTION_CRITERIA, ...criteria };
  }

  private runFetcher(args: string[]): string {
    try {
      return execFileSync(this.pythonCmd, [FETCHER_PATH, ...args], {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
        timeout: 30_000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Fetcher error: ${msg}`);
    }
  }

  private parseJsonSafe(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getStockPool(): Promise<{ code: string; name: string }[]> {
    const output = this.runFetcher(["pool"]);
    const data = this.parseJsonSafe(output);
    if (!Array.isArray(data)) {
      throw new Error("Failed to get stock pool");
    }
    return data;
  }

  async getStockQuote(code: string): Promise<StockMarketData | null> {
    const output = this.runFetcher(["quote", code]);
    const data = this.parseJsonSafe(output);
    if (!data || data.error) {
      return null;
    }
    return {
      code: data.code,
      name: data.name,
      price: data.price,
      prevClose: data.prev_close,
      open: data.open,
      high: data.high,
      low: data.low,
      volume: data.volume,
      amount: data.amount,
      turnoverRate: data.turnover_rate,
      avgTurnoverRate20: data.avg_turnover_rate_20 || 0,
      avgAmount20: data.avg_amount_20 || 0,
      high20: data.high_20 || data.high,
      low20: data.low_20 || data.low,
      position: 0,
    };
  }

  async getStockHistory(
    code: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    data: {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      turnover: number;
    }[];
    indicators?: Record<string, number>;
  } | null> {
    const output = this.runFetcher(["history", code, startDate, endDate]);
    const data = this.parseJsonSafe(output);
    if (!data || data.error || !data.data) {
      return null;
    }
    return {
      data: data.data,
      indicators: data.indicators,
    };
  }

  async getShareholderInfo(code: string): Promise<StockFundamental | null> {
    const output = this.runFetcher(["shareholders", code]);
    const data = this.parseJsonSafe(output);
    if (!data || data.error) {
      return null;
    }
    return {
      code: data.code,
      name: data.name,
      shareholderCount: data.shareholder_count || 0,
      floatMarketCap: data.float_market_cap || 0,
      avgHoldingPerAccount: data.avg_holding_per_account || 0,
    };
  }

  checkSelectionCriteria(
    fundamental: StockFundamental,
    marketData: StockMarketData,
    history20Days: { data: { high: number; low: number }[] },
  ): {
    passed: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    if (fundamental.shareholderCount < this.criteria.shareholderCountMin) {
      reasons.push(
        `股东人数不足: ${fundamental.shareholderCount} < ${this.criteria.shareholderCountMin}`,
      );
    }

    if (fundamental.avgHoldingPerAccount > this.criteria.avgHoldingValueMax) {
      reasons.push(
        `人均持股过高: ${fundamental.avgHoldingPerAccount} > ${this.criteria.avgHoldingValueMax}`,
      );
    }

    if (marketData.avgTurnoverRate20 < this.criteria.turnoverRateMin) {
      reasons.push(
        `日均换手率过低: ${(marketData.avgTurnoverRate20 * 100).toFixed(2)}% < ${(this.criteria.turnoverRateMin * 100).toFixed(2)}%`,
      );
    }

    if (marketData.avgTurnoverRate20 > this.criteria.turnoverRateMax) {
      reasons.push(
        `日均换手率过高: ${(marketData.avgTurnoverRate20 * 100).toFixed(2)}% > ${(this.criteria.turnoverRateMax * 100).toFixed(2)}%`,
      );
    }

    if (this.criteria.excludeQuant && marketData.avgTurnoverRate20 > 0.2) {
      reasons.push("疑似量化高频股");
    }

    if (marketData.avgAmount20 < this.criteria.amountMin) {
      reasons.push(
        `日均成交额不足: ${(marketData.avgAmount20 / 100000000).toFixed(2)}亿 < ${(this.criteria.amountMin / 100000000).toFixed(2)}亿`,
      );
    }

    const high20 = Math.max(...history20Days.data.map((d) => d.high));
    const low20 = Math.min(...history20Days.data.map((d) => d.low));
    const volatility = high20 / low20;

    if (volatility < this.criteria.volatilityMin) {
      reasons.push(`月内波动不足: ${volatility.toFixed(2)} < ${this.criteria.volatilityMin}`);
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  async screenStocks(): Promise<
    {
      code: string;
      name: string;
      reason: string;
    }[]
  > {
    const pool = await this.getStockPool();
    const results: { code: string; name: string; reason: string }[] = [];

    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    for (const stock of pool.slice(0, 50)) {
      try {
        const [quote, history, shareholder] = await Promise.all([
          this.getStockQuote(stock.code),
          this.getStockHistory(stock.code, startDate, endDate),
          this.getShareholderInfo(stock.code),
        ]);

        if (!quote || !history || !shareholder) {
          continue;
        }

        if (history.data.length < 20) {
          continue;
        }

        const check = this.checkSelectionCriteria(shareholder, quote, history);

        if (!check.passed) {
          results.push({
            code: stock.code,
            name: stock.name,
            reason: check.reasons.join("; "),
          });
        }
      } catch (error) {
        console.error(`Error screening ${stock.code}:`, error);
      }
    }

    return results;
  }

  calculatePricePosition(currentPrice: number, high: number, low: number): number {
    if (high === low) return 0.5;
    return (currentPrice - low) / (high - low);
  }
}

export const createStockSelector = (criteria?: Partial<StockSelectionCriteria>) =>
  new StockSelector(criteria);
