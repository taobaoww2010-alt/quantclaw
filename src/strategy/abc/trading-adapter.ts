import { EventEmitter } from "node:events";
import type { Order, OrderSide, OrderStatus } from "./types.js";

export interface TradingAccount {
  accountId: string;
  broker: string;
  accountType: "security" | "futures" | "margin";
  cash: number;
  marketValue: number;
  totalAsset: number;
  availableCash: number;
}

export interface TradeResult {
  orderId: string;
  status: OrderStatus;
  filledPrice?: number;
  filledQuantity?: number;
  commission?: number;
  message?: string;
  timestamp: string;
}

export interface Position {
  code: string;
  name: string;
  quantity: number;
  availableQuantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlRatio: number;
}

export interface TradingConfig {
  broker: "xt" | "ht" | "ths" | "simulate";
  server?: string;
  account?: string;
  password?: string;
  autoReconnect: boolean;
  slippage: number;
}

export abstract class BaseTradingAdapter extends EventEmitter {
  protected config: TradingConfig;
  protected connected = false;
  protected account?: TradingAccount;
  protected orders: Map<string, Order> = new Map();

  constructor(config: TradingConfig) {
    super();
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract queryAccount(): Promise<TradingAccount>;
  abstract queryPositions(): Promise<Position[]>;
  abstract placeOrder(
    symbol: string,
    side: OrderSide,
    price: number,
    quantity: number,
  ): Promise<Order>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
  abstract getOrderStatus(orderId: string): Promise<Order | null>;

  isConnected(): boolean {
    return this.connected;
  }

  getAccount(): TradingAccount | undefined {
    return this.account;
  }

  protected createOrder(symbol: string, side: OrderSide, price: number, quantity: number): Order {
    const order: Order = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      side,
      price,
      quantity,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    return order;
  }

  protected updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updates: Partial<Order> = {},
  ): void {
    const order = this.orders.get(orderId);
    if (order) {
      Object.assign(order, { status, ...updates });
      this.emit("orderUpdate", order);
    }
  }

  getOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  getPendingOrders(): Order[] {
    return this.getOrders().filter((o) => o.status === "pending");
  }
}

export class SimulatedTradingAdapter extends BaseTradingAdapter {
  private simulatedPositions: Map<string, Position> = new Map();
  private simulateInterval?: NodeJS.Timeout;

  constructor(config: Partial<TradingConfig> = {}) {
    super({
      broker: "simulate",
      autoReconnect: true,
      slippage: config.slippage || 0.0002,
      ...config,
    });

    this.account = {
      accountId: "SIM000001",
      broker: "模拟账户",
      accountType: "security",
      cash: 100000,
      marketValue: 0,
      totalAsset: 100000,
      availableCash: 100000,
    };
  }

  async connect(): Promise<void> {
    console.log("[SimTrader] 连接模拟交易账户...");
    await this.delay(100);

    this.connected = true;
    this.account = {
      accountId: "SIM000001",
      broker: "模拟账户",
      accountType: "security",
      cash: 100000,
      marketValue: 0,
      totalAsset: 100000,
      availableCash: 100000,
    };

    this.emit("connected", this.account);
    console.log("[SimTrader] 已连接，资金: ¥100,000");

    this.simulateInterval = setInterval(() => {
      this.simulateMarketMovement();
    }, 5000);
  }

  async disconnect(): Promise<void> {
    if (this.simulateInterval) {
      clearInterval(this.simulateInterval);
    }
    this.connected = false;
    this.emit("disconnected");
    console.log("[SimTrader] 已断开连接");
  }

  async queryAccount(): Promise<TradingAccount> {
    if (!this.account) {
      throw new Error("未连接账户");
    }

    let marketValue = 0;
    for (const pos of this.simulatedPositions.values()) {
      marketValue += pos.marketValue;
    }

    const account = { ...this.account };
    account.marketValue = marketValue;
    account.totalAsset = account.cash + marketValue;
    account.availableCash = account.cash;

    this.account = account;
    return account;
  }

  async queryPositions(): Promise<Position[]> {
    return Array.from(this.simulatedPositions.values());
  }

  async placeOrder(
    _symbol: string,
    _side: OrderSide,
    _price: number,
    _quantity: number,
  ): Promise<Order> {
    if (!this.connected || !this.account) {
      throw new Error("未连接账户");
    }

    const order = this.createOrder(symbol, side, price, quantity);

    const slippagePrice =
      side === "buy" ? price * (1 + this.config.slippage) : price * (1 - this.config.slippage);

    const commission = this.calculateCommission(slippagePrice, quantity, side);

    if (side === "buy") {
      const cost = slippagePrice * quantity + commission;
      if (cost > this.account.cash) {
        this.updateOrderStatus(order.id, "rejected", {
          reason: "资金不足",
        });
        throw new Error("资金不足");
      }
      this.account.cash -= cost;
    } else {
      const pos = this.simulatedPositions.get(symbol);
      if (!pos || pos.availableQuantity < quantity) {
        this.updateOrderStatus(order.id, "rejected", {
          reason: "持仓不足",
        });
        throw new Error("持仓不足");
      }
      this.account.cash += slippagePrice * quantity - commission;
    }

    await this.delay(200);

    this.updateOrderStatus(order.id, "filled", {
      filledAt: new Date().toISOString(),
      filledPrice: slippagePrice,
      filledQuantity: quantity,
      commission,
    });

    this.updatePosition(symbol, side, slippagePrice, quantity);

    this.emit("trade", {
      orderId: order.id,
      symbol,
      side,
      price: slippagePrice,
      quantity,
      commission,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[SimTrader] ${side === "buy" ? "买入" : "卖出"} ${symbol} ${
        quantity
      }股 @ ¥${slippagePrice.toFixed(2)}`,
    );

    return order;
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    if (order.status === "filled") {
      return false;
    }

    this.updateOrderStatus(orderId, "cancelled", {
      cancelledAt: new Date().toISOString(),
    });

    return true;
  }

  async getOrderStatus(_orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  private updatePosition(symbol: string, side: OrderSide, price: number, quantity: number): void {
    const existing = this.simulatedPositions.get(symbol);

    if (side === "buy") {
      if (existing) {
        const totalCost = existing.avgCost * existing.quantity + price * quantity;
        const totalQty = existing.quantity + quantity;
        existing.quantity = totalQty;
        existing.avgCost = totalCost / totalQty;
        existing.availableQuantity = totalQty;
      } else {
        this.simulatedPositions.set(symbol, {
          code: symbol,
          name: symbol,
          quantity,
          availableQuantity: quantity,
          avgCost: price,
          currentPrice: price,
          marketValue: price * quantity,
          unrealizedPnl: 0,
          unrealizedPnlRatio: 0,
        });
      }
    } else {
      if (existing) {
        existing.quantity -= quantity;
        existing.availableQuantity -= quantity;
        if (existing.quantity <= 0) {
          this.simulatedPositions.delete(symbol);
        }
      }
    }
  }

  private calculateCommission(price: number, quantity: number, side: OrderSide): number {
    const turnover = price * quantity;
    let commission = turnover * 0.00015;
    if (side === "sell") {
      commission += turnover * 0.001;
    }
    return Math.max(5, commission);
  }

  private simulateMarketMovement(): void {
    for (const pos of this.simulatedPositions.values()) {
      const change = (Math.random() - 0.5) * 0.02;
      pos.currentPrice *= 1 + change;
      pos.marketValue = pos.currentPrice * pos.quantity;
      pos.unrealizedPnl = (pos.currentPrice - pos.avgCost) * pos.quantity;
      pos.unrealizedPnlRatio = (pos.currentPrice - pos.avgCost) / pos.avgCost;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getTradeHistory(): Array<{
    timestamp: string;
    symbol: string;
    side: OrderSide;
    price: number;
    quantity: number;
  }> {
    return this.getOrders()
      .filter((o) => o.status === "filled")
      .map((o) => ({
        timestamp: o.filledAt || o.createdAt,
        symbol: o.symbol,
        side: o.side,
        price: o.filledPrice || o.price,
        quantity: o.filledQuantity || o.quantity,
      }));
  }

  resetAccount(): void {
    this.account = {
      accountId: "SIM000001",
      broker: "模拟账户",
      accountType: "security",
      cash: 100000,
      marketValue: 0,
      totalAsset: 100000,
      availableCash: 100000,
    };
    this.simulatedPositions.clear();
    this.orders.clear();
    console.log("[SimTrader] 账户已重置");
  }
}

export class XTPTradingAdapter extends BaseTradingAdapter {
  async connect(): Promise<void> {
    console.log("[XTP] 连接中泰证券...");
    throw new Error("XTP适配器需要配置真实账户");
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async queryAccount(): Promise<TradingAccount> {
    throw new Error("未实现");
  }

  async queryPositions(): Promise<Position[]> {
    throw new Error("未实现");
  }

  async placeOrder(
    _symbol: string,
    _side: OrderSide,
    _price: number,
    _quantity: number,
  ): Promise<Order> {
    throw new Error("未实现");
  }

  async cancelOrder(_orderId: string): Promise<boolean> {
    throw new Error("未实现");
  }

  async getOrderStatus(_orderId: string): Promise<Order | null> {
    throw new Error("未实现");
  }
}

export const createTradingAdapter = (config: Partial<TradingConfig>): BaseTradingAdapter => {
  const broker = config.broker ?? "simulate";
  switch (broker) {
    case "simulate":
      return new SimulatedTradingAdapter({ ...config, broker: "simulate" });
    case "xt":
      return new XTPTradingAdapter({ ...config, broker: "xt" });
    default:
      console.warn(`[Adapter] 未知的券商 ${broker}，使用模拟账户`);
      return new SimulatedTradingAdapter({ ...config, broker: "simulate" });
  }
};
