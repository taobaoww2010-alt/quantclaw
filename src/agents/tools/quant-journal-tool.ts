import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { buildTool, jsonResult, runPreTradeHooks, runPostTradeHooks, resolveTradingMode } from "./common.js";

const JOURNAL_DIR = path.join(process.cwd(), "data", "journal");
const POSITIONS_FILE = path.join(JOURNAL_DIR, "positions.json");
const SIGNALS_FILE = path.join(JOURNAL_DIR, "signals.json");

function ensureJournalDir(): void {
  if (!fs.existsSync(JOURNAL_DIR)) {
    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  }
  if (!fs.existsSync(POSITIONS_FILE)) {
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(SIGNALS_FILE)) {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify([]));
  }
}

function readPositions(): Record<string, unknown>[] {
  try {
    return JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writePositions(positions: Record<string, unknown>[]): void {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

function readSignals(): Record<string, unknown>[] {
  try {
    return JSON.parse(fs.readFileSync(SIGNALS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeSignals(signals: Record<string, unknown>[]): void {
  fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));
}

const ListPositionsSchema = Type.Object({});
const AddPositionSchema = Type.Object({
  code: Type.String(),
  name: Type.String(),
  side: Type.Union([Type.Literal("long"), Type.Literal("short")]),
  quantity: Type.Number({ minimum: 1 }),
  avg_price: Type.Number({ minimum: 0 }),
  entry_date: Type.String(),
  strategy: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
});
const ClosePositionSchema = Type.Object({
  code: Type.String(),
  close_price: Type.Number({ minimum: 0 }),
  close_date: Type.String(),
  reason: Type.Optional(Type.String()),
});
const LogSignalSchema = Type.Object({
  code: Type.String(),
  signal: Type.Union([
    Type.Literal("buy"),
    Type.Literal("sell"),
    Type.Literal("watch"),
    Type.Literal("stop_loss"),
  ]),
  price: Type.Optional(Type.Number()),
  strength: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  strategy: Type.String(),
  reason: Type.Optional(Type.String()),
});
const PerformanceSchema = Type.Object({
  start_date: Type.Optional(Type.String()),
  end_date: Type.Optional(Type.String()),
});
const UpdateCapitalSchema = Type.Object({
  total_capital: Type.Number({ minimum: 0 }),
  date: Type.Optional(Type.String()),
});

export function createQuantJournalTools(): AnyAgentTool[] {
  const tradingMode = resolveTradingMode();

  return [
    buildTool({
      name: "list_positions",
      label: "List Positions",
      description: "查询当前持仓",
      parameters: ListPositionsSchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "查询持仓",
      execute: async () => {
        ensureJournalDir();
        const positions = readPositions();
        const open = positions.filter((p) => !p.closed);
        return jsonResult({ total: open.length, positions: open });
      },
    }),
    buildTool({
      name: "add_position",
      label: "Add Position",
      description: "记录新开仓",
      parameters: AddPositionSchema,
      riskTier: "medium",
      isConcurrencySafe: false,
      isReadOnly: false,
      displaySummary: "记录开仓",
      execute: async (_: string, args: Record<string, unknown>) => {
        ensureJournalDir();
        const ctx = { toolName: "add_position", args, riskTier: "medium" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const positions = readPositions();
        const entry = { ...args, id: `${args.code}_${Date.now()}`, created_at: new Date().toISOString() };
        positions.push(entry);
        writePositions(positions);
        await runPostTradeHooks(ctx, entry);
        return jsonResult({ ok: true, position: entry });
      },
    }),
    buildTool({
      name: "close_position",
      label: "Close Position",
      description: "平仓记录",
      parameters: ClosePositionSchema,
      riskTier: "high",
      isConcurrencySafe: false,
      isReadOnly: false,
      isDestructive: true,
      displaySummary: "记录平仓",
      execute: async (_: string, args: Record<string, unknown>) => {
        ensureJournalDir();
        const ctx = { toolName: "close_position", args, riskTier: "high" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const positions = readPositions();
        const idx = positions.findIndex((p) => p.code === args.code && !p.closed);
        if (idx === -1) return jsonResult({ error: `未找到 ${args.code} 的持仓` });
        const pos = positions[idx];
        const closePrice = args.close_price as number;
        const avgPrice = pos.avg_price as number;
        const qty = pos.quantity as number;
        const pnl = ((closePrice - avgPrice) * qty);
        const pnlPct = ((closePrice - avgPrice) / avgPrice * 100);
        positions[idx] = { ...pos, closed: true, close_price: closePrice, close_date: args.close_date, pnl, pnl_pct: pnlPct, reason: args.reason };
        writePositions(positions);
        await runPostTradeHooks(ctx, positions[idx]);
        return jsonResult({ ok: true, pnl: pnl.toFixed(2), pnl_pct: pnlPct.toFixed(2) + "%" });
      },
    }),
    buildTool({
      name: "log_signal",
      label: "Log Signal",
      description: "交易信号记录",
      parameters: LogSignalSchema,
      riskTier: "low",
      isConcurrencySafe: false,
      isReadOnly: false,
      displaySummary: "记录信号",
      execute: async (_: string, args: Record<string, unknown>) => {
        ensureJournalDir();
        const signals = readSignals();
        const entry = { ...args, timestamp: new Date().toISOString() };
        signals.push(entry);
        writeSignals(signals);
        return jsonResult({ ok: true, signal: entry });
      },
    }),
    buildTool({
      name: "performance",
      label: "Performance",
      description: "绩效统计（收益率、胜率、夏普比率）",
      parameters: PerformanceSchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "绩效统计",
      execute: async () => {
        ensureJournalDir();
        const positions = readPositions();
        const closed = positions.filter((p) => p.closed);
        if (closed.length === 0) return jsonResult({ message: "暂无平仓记录" });
        const wins = closed.filter((p) => (p.pnl as number) > 0);
        const losses = closed.filter((p) => (p.pnl as number) <= 0);
        const totalPnl = closed.reduce((sum, p) => sum + (p.pnl as number), 0);
        const winRate = (wins.length / closed.length * 100);
        const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + (p.pnl as number), 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + (p.pnl as number), 0) / losses.length : 0;
        const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : Infinity;
        return jsonResult({
          total_trades: closed.length,
          wins: wins.length,
          losses: losses.length,
          win_rate: winRate.toFixed(2) + "%",
          total_pnl: totalPnl.toFixed(2),
          avg_win: avgWin.toFixed(2),
          avg_loss: avgLoss.toFixed(2),
          profit_factor: profitFactor === Infinity ? "∞" : profitFactor.toFixed(2),
        });
      },
    }),
    buildTool({
      name: "update_capital",
      label: "Update Capital",
      description: "更新账户资金",
      parameters: UpdateCapitalSchema,
      riskTier: "medium",
      isConcurrencySafe: false,
      isReadOnly: false,
      displaySummary: "更新资金",
      execute: async (_: string, args: Record<string, unknown>) => {
        ensureJournalDir();
        const positions = readPositions();
        const openPositions = positions.filter((p) => !p.closed);
        return jsonResult({
          ok: true,
          total_capital: args.total_capital,
          open_positions: openPositions.length,
          date: args.date || new Date().toISOString().split("T")[0],
        });
      },
    }),
  ];
}
