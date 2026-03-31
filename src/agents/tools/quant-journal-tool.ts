import * as fs from "fs";
import * as path from "path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

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
  capital: Type.Number({ minimum: 0 }),
  update_date: Type.String(),
});

export function createQuantJournalTool(): AnyAgentTool {
  return {
    label: "Quant Journal",
    name: "quant_journal",
    description: "A股交易日志管理：持仓查询、开仓/平仓、信号记录、绩效统计",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list_positions"),
        Type.Literal("add_position"),
        Type.Literal("close_position"),
        Type.Literal("log_signal"),
        Type.Literal("performance"),
        Type.Literal("update_capital"),
      ]),
      ...ListPositionsSchema.properties,
      ...AddPositionSchema.properties,
      ...ClosePositionSchema.properties,
      ...LogSignalSchema.properties,
      ...PerformanceSchema.properties,
      ...UpdateCapitalSchema.properties,
    }),
    execute: async (
      _: string,
      args: {
        action: string;
        code?: string;
        name?: string;
        side?: string;
        quantity?: number;
        avg_price?: number;
        entry_date?: string;
        strategy?: string;
        notes?: string;
        close_price?: number;
        close_date?: string;
        reason?: string;
        signal?: string;
        price?: number;
        strength?: number;
        capital?: number;
        update_date?: string;
      },
    ) => {
      ensureJournalDir();
      switch (args.action) {
        case "list_positions": {
          const positions = readPositions();
          return jsonResult({ positions, count: positions.length });
        }
        case "add_position": {
          const positions = readPositions();
          const pos = {
            id: Date.now().toString(),
            code: args.code,
            name: args.name,
            side: args.side,
            quantity: args.quantity,
            avg_price: args.avg_price,
            entry_date: args.entry_date,
            strategy: args.strategy,
            notes: args.notes,
            status: "open",
            pnl: 0,
          };
          positions.push(pos);
          writePositions(positions);
          return jsonResult({ success: true, position: pos });
        }
        case "close_position": {
          const positions = readPositions();
          const idx = positions.findIndex(
            (p: Record<string, unknown>) => p.code === args.code && p.status === "open",
          );
          if (idx === -1) {
            return jsonResult({ success: false, error: "未找到持仓" });
          }
          const pos = positions[idx];
          const pnl =
            ((args.close_price || 0) - (pos.avg_price as number)) *
            (pos.quantity as number) *
            (pos.side === "long" ? 1 : -1);
          pos.status = "closed";
          pos.close_price = args.close_price;
          pos.close_date = args.close_date;
          pos.reason = args.reason;
          pos.pnl = Math.round(pnl * 100) / 100;
          writePositions(positions);
          return jsonResult({ success: true, position: pos });
        }
        case "log_signal": {
          const signals = readSignals();
          const signal = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            code: args.code,
            signal: args.signal,
            price: args.price,
            strength: args.strength,
            strategy: args.strategy,
            reason: args.reason,
          };
          signals.push(signal);
          writeSignals(signals);
          return jsonResult({ success: true, signal });
        }
        case "performance": {
          const positions = readPositions();
          const closed = positions.filter((p: Record<string, unknown>) => p.status === "closed");
          const totalPnl = closed.reduce(
            (sum: number, p: Record<string, unknown>) => sum + ((p.pnl as number) || 0),
            0,
          );
          const winRate =
            closed.length > 0
              ? closed.filter((p: Record<string, unknown>) => (p.pnl as number) > 0).length /
                closed.length
              : 0;
          return jsonResult({
            total_trades: closed.length,
            total_pnl: Math.round(totalPnl * 100) / 100,
            win_rate: Math.round(winRate * 10000) / 100,
          });
        }
        case "update_capital": {
          const capFile = path.join(JOURNAL_DIR, "capital.json");
          const data = { capital: args.capital, date: args.update_date };
          fs.writeFileSync(capFile, JSON.stringify(data, null, 2));
          return jsonResult({ success: true, ...data });
        }
        default:
          return jsonResult({ error: "Unknown action" });
      }
    },
  };
}
