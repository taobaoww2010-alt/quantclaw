import { EventEmitter } from "node:events";

export type NotificationLevel = "info" | "success" | "warning" | "error" | "critical";

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  dismissed: boolean;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string;
}

export interface NotificationConfig {
  enableSound: boolean;
  enableDesktop: boolean;
  enableEmail: boolean;
  minLevel: NotificationLevel;
  levels: {
    info: boolean;
    success: boolean;
    warning: boolean;
    error: boolean;
    critical: boolean;
  };
}

const LEVEL_PRIORITY: Record<NotificationLevel, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

export class NotificationCenter extends EventEmitter {
  private notifications: Notification[] = [];
  private config: NotificationConfig;
  private soundEnabled = true;
  private maxNotifications = 100;

  constructor(config: Partial<NotificationConfig> = {}) {
    super();
    this.config = {
      enableSound: config.enableSound ?? true,
      enableDesktop: config.enableDesktop ?? false,
      enableEmail: config.enableEmail ?? false,
      minLevel: config.minLevel || "info",
      levels: {
        info: config.levels?.info ?? true,
        success: config.levels?.success ?? true,
        warning: config.levels?.warning ?? true,
        error: config.levels?.error ?? true,
        critical: config.levels?.critical ?? true,
        ...config.levels,
      },
    };
  }

  notify(
    level: NotificationLevel,
    title: string,
    message: string,
    options?: {
      data?: Record<string, unknown>;
      actions?: NotificationAction[];
      silent?: boolean;
    },
  ): Notification {
    if (!this.shouldNotify(level)) {
      return this.createEmptyNotification();
    }

    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      level,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
      dismissed: false,
      data: options?.data,
      actions: options?.actions,
    };

    this.notifications.unshift(notification);

    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    this.emit("notification", notification);

    if (!options?.silent && this.config.enableSound) {
      this.playSound(level);
    }

    if (this.config.enableDesktop && typeof window !== "undefined") {
      this.showDesktopNotification(notification);
    }

    console.log(
      `[${level.toUpperCase()}] ${title}: ${message}`,
    );

    return notification;
  }

  private createEmptyNotification(): Notification {
    return {
      id: "",
      level: "info",
      title: "",
      message: "",
      timestamp: "",
      read: true,
      dismissed: true,
    };
  }

  private shouldNotify(level: NotificationLevel): boolean {
    if (!this.config.levels[level]) {
      return false;
    }

    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.minLevel]) {
      return false;
    }

    return true;
  }

  private playSound(level: NotificationLevel): void {
    const sounds: Record<NotificationLevel, string> = {
      info: "info",
      success: "success",
      warning: "warning",
      error: "error",
      critical: "error",
    };

    const soundFile = sounds[level];

    try {
      if (typeof window !== "undefined") {
        const audio = new Audio(`/sounds/${soundFile}.mp3`);
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } else {
        process.stdout.write(`\x07`);
      }
    } catch {
    }
  }

  private showDesktopNotification(notification: Notification): void {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(notification.title, {
          body: notification.message,
          icon: "/icon.png",
        });
      }
    }
  }

  info(title: string, message: string, options?: Record<string, unknown>): Notification {
    return this.notify("info", title, message, options);
  }

  success(title: string, message: string, options?: Record<string, unknown>): Notification {
    return this.notify("success", title, message, options);
  }

  warning(title: string, message: string, options?: Record<string, unknown>): Notification {
    return this.notify("warning", title, message, options);
  }

  error(title: string, message: string, options?: Record<string, unknown>): Notification {
    return this.notify("error", title, message, options);
  }

  critical(title: string, message: string, options?: Record<string, unknown>): Notification {
    return this.notify("critical", title, message, options);
  }

  tradeAlert(
    action: "buy" | "sell",
    symbol: string,
    price: number,
    quantity: number,
    pnl?: number,
  ): void {
    const side = action === "buy" ? "买入" : "卖出";
    const pnlText = pnl !== undefined ? ` | 盈亏: ${pnl >= 0 ? "+" : ""}¥${pnl.toFixed(2)}` : "";

    this.notify(
      action === "buy" ? "info" : pnl && pnl > 0 ? "success" : "warning",
      `交易信号: ${side}`,
      `${symbol} ${quantity}股 @ ¥${price.toFixed(2)}${pnlText}`,
      {
        data: { symbol, price, quantity, action, pnl },
        silent: false,
      },
    );
  }

  riskAlert(
    type: "stop_loss" | "take_profit" | "forced_rest" | "pause",
    symbol: string,
    details: string,
  ): void {
    const titles: Record<string, string> = {
      stop_loss: "止损触发",
      take_profit: "止盈触发",
      forced_rest: "强制休息",
      pause: "交易暂停",
    };

    this.notify(
      type === "forced_rest" ? "warning" : "error",
      titles[type] || "风控提醒",
      `${symbol}: ${details}`,
      {
        data: { type, symbol, details },
      },
    );
  }

  strategyAlert(
    phase: string,
    status: string,
    details?: string,
  ): void {
    this.notify(
      "info",
      `策略状态: ${phase}`,
      details || status,
      {
        data: { phase, status },
      },
    );
  }

  getNotifications(options?: {
    level?: NotificationLevel;
    unreadOnly?: boolean;
    limit?: number;
  }): Notification[] {
    let result = [...this.notifications];

    if (options?.level) {
      result = result.filter((n) => n.level === options.level);
    }

    if (options?.unreadOnly) {
      result = result.filter((n) => !n.read);
    }

    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  markAsRead(id: string): void {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      this.emit("read", notification);
    }
  }

  markAllAsRead(): void {
    this.notifications.forEach((n) => {
      n.read = true;
    });
    this.emit("allRead");
  }

  dismiss(id: string): void {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.dismissed = true;
      this.emit("dismiss", notification);
    }
  }

  clear(): void {
    this.notifications = [];
    this.emit("clear");
  }

  updateConfig(updates: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): NotificationConfig {
    return { ...this.config };
  }
}

export const createNotificationCenter = (config?: Partial<NotificationConfig>) =>
  new NotificationCenter(config);

export class TelegramNotifier {
  private botToken?: string;
  private chatId?: string;
  private enabled = false;

  configure(token: string, chatId: string): void {
    this.botToken = token;
    this.chatId = chatId;
    this.enabled = true;
  }

  async send(message: string): Promise<boolean> {
    if (!this.enabled || !this.botToken || !this.chatId) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("[Telegram] 发送失败:", error);
      return false;
    }
  }

  async sendTradeAlert(
    action: "buy" | "sell",
    symbol: string,
    price: number,
    quantity: number,
    pnl?: number,
  ): Promise<boolean> {
    const emoji = action === "buy" ? "🟢" : "🔴";
    const side = action === "buy" ? "买入" : "卖出";
    const pnlText = pnl !== undefined ? `\n💰 盈亏: ${pnl >= 0 ? "+" : ""}¥${pnl.toFixed(2)}` : "";

    return this.send(
      `${emoji} <b>ABC策略交易</b>\n\n` +
        `📌 ${side}: ${symbol}\n` +
        `💵 价格: ¥${price.toFixed(2)}\n` +
        `📊 数量: ${quantity}股\n` +
        `${pnlText}\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  async sendRiskAlert(
    type: "stop_loss" | "take_profit" | "forced_rest" | "pause",
    symbol: string,
    details: string,
  ): Promise<boolean> {
    const emoji = type === "forced_rest" ? "⚠️" : "🚨";
    const titles: Record<string, string> = {
      stop_loss: "止损触发",
      take_profit: "止盈触发",
      forced_rest: "强制休息",
      pause: "交易暂停",
    };

    return this.send(
      `${emoji} <b>${titles[type]}</b>\n\n` +
        `📌 标的: ${symbol}\n` +
        `📝 详情: ${details}\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  async sendDailySummary(summary: {
    equity: number;
    dailyPnl: number;
    trades: number;
    winRate: number;
  }): Promise<boolean> {
    const pnlEmoji = summary.dailyPnl >= 0 ? "🟢" : "🔴";

    return this.send(
      `📊 <b>每日总结</b>\n\n` +
        `💰 总资产: ¥${summary.equity.toFixed(2)}\n` +
        `${pnlEmoji} 日盈亏: ${summary.dailyPnl >= 0 ? "+" : ""}¥${summary.dailyPnl.toFixed(2)}\n` +
        `📈 交易次数: ${summary.trades}\n` +
        `🎯 胜率: ${summary.winRate.toFixed(1)}%\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  disable(): void {
    this.enabled = false;
    this.botToken = undefined;
    this.chatId = undefined;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const createTelegramNotifier = () => new TelegramNotifier();

export class FeishuNotifier {
  private webhookUrl?: string;
  private enabled = false;

  configure(webhookUrl: string): void {
    this.webhookUrl = webhookUrl;
    this.enabled = true;
  }

  async send(message: string): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      console.log("[Feishu] 模拟发送:", message);
      return true;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg_type: "text", content: { text: message } }),
      });
      return response.ok;
    } catch (error) {
      console.error("[Feishu] 发送失败:", error);
      return false;
    }
  }

  async sendTradeAlert(
    action: "buy" | "sell",
    symbol: string,
    price: number,
    quantity: number,
    pnl?: number,
  ): Promise<boolean> {
    const emoji = action === "buy" ? "🟢" : "🔴";
    const side = action === "buy" ? "买入" : "卖出";
    const pnlText = pnl !== undefined ? `\n💰 盈亏: ${pnl >= 0 ? "+" : ""}¥${pnl.toFixed(2)}` : "";

    return this.send(
      `${emoji} <b>ABC策略交易</b>\n\n` +
        `📌 ${side}: ${symbol}\n` +
        `💵 价格: ¥${price.toFixed(2)}\n` +
        `📊 数量: ${quantity}股\n` +
        `${pnlText}\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  async sendRiskAlert(
    type: "stop_loss" | "take_profit" | "forced_rest" | "pause",
    symbol: string,
    details: string,
  ): Promise<boolean> {
    const emoji = type === "forced_rest" ? "⚠️" : "🚨";
    const titles: Record<string, string> = {
      stop_loss: "止损触发",
      take_profit: "止盈触发",
      forced_rest: "强制休息",
      pause: "交易暂停",
    };

    return this.send(
      `${emoji} <b>${titles[type]}</b>\n\n` +
        `📌 标的: ${symbol}\n` +
        `📝 详情: ${details}\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  async sendDailySummary(summary: {
    equity: number;
    dailyPnl: number;
    trades: number;
    winRate: number;
  }): Promise<boolean> {
    const pnlEmoji = summary.dailyPnl >= 0 ? "🟢" : "🔴";

    return this.send(
      `📊 <b>每日总结</b>\n\n` +
        `💰 总资产: ¥${summary.equity.toFixed(2)}\n` +
        `${pnlEmoji} 日盈亏: ${summary.dailyPnl >= 0 ? "+" : ""}¥${summary.dailyPnl.toFixed(2)}\n` +
        `📈 交易次数: ${summary.trades}\n` +
        `🎯 胜率: ${summary.winRate.toFixed(1)}%\n` +
        `⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    );
  }

  disable(): void {
    this.enabled = false;
    this.webhookUrl = undefined;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const createFeishuNotifier = () => new FeishuNotifier();
