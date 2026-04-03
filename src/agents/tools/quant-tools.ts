import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import {
  buildTool,
  jsonResult,
  runPreTradeHooks,
  runPostTradeHooks,
  resolveTradingMode,
} from "./common.js";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const FETCHER_PATH = path.join(PROJECT_ROOT, "data", "fetcher.py");

function runFetcher(args: string[]): string {
  const pythonCmd = process.env.QUANTCLAW_PYTHON || "python3";
  try {
    return execFileSync(pythonCmd, [FETCHER_PATH, ...args], {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
      timeout: 30_000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: "数据获取失败", detail: msg }, null, 2);
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function ensurePythonDeps(): boolean {
  return fs.existsSync(FETCHER_PATH);
}

const QuantQuoteSchema = Type.Object({
  code: Type.String({ description: "股票代码，如 600519 或 000001" }),
});

const QuantHistorySchema = Type.Object({
  code: Type.String({ description: "股票代码" }),
  start_date: Type.Optional(Type.String({ description: "开始日期 YYYY-MM-DD" })),
  end_date: Type.Optional(Type.String({ description: "结束日期 YYYY-MM-DD" })),
  frequency: Type.Optional(
    Type.Union(
      [
        Type.Literal("d", { description: "日线" }),
        Type.Literal("w", { description: "周线" }),
        Type.Literal("m", { description: "月线" }),
      ],
      { default: "d" },
    ),
  ),
  limit: Type.Optional(Type.Number({ description: "返回条数", default: 30 })),
});

const QuantShareholdersSchema = Type.Object({
  code: Type.String({ description: "股票代码" }),
});

const QuantScreenSchema = Type.Object({
  market: Type.Optional(
    Type.Union(
      [
        Type.Literal("cn", { description: "A股" }),
        Type.Literal("hk", { description: "港股" }),
        Type.Literal("us", { description: "美股" }),
      ],
      { default: "cn" },
    ),
  ),
  conditions: Type.Optional(
    Type.Array(
      Type.Object({
        field: Type.String(),
        op: Type.Union([Type.Literal("gt"), Type.Literal("lt"), Type.Literal("eq")]),
        value: Type.Number(),
      }),
    ),
  ),
  limit: Type.Optional(Type.Number({ default: 10, description: "返回数量" })),
});

const QuantPoolInfoSchema = Type.Object({
  pool_name: Type.Optional(Type.String({ description: "股票池名称，如 沪深300, 中证500, 科创50, 自选" })),
});

export function createQuantTools(): AnyAgentTool[] {
  const tradingMode = resolveTradingMode();

  return [
    buildTool({
      name: "quant_quote",
      label: "Quant Quote",
      description: "获取A股实时行情数据（价格、涨跌幅、成交量、换手率、市盈率等）",
      parameters: QuantQuoteSchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "实时行情",
      execute: async (_: string, args: { code: string }) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪，请运行: pip install baostock requests" });
        }
        const ctx = { toolName: "quant_quote", args, riskTier: "low" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const raw = runFetcher(["quote", args.code]);
        const result = safeParseJson(raw);
        await runPostTradeHooks(ctx, result);
        return jsonResult(result);
      },
    }),
    buildTool({
      name: "quant_history",
      label: "Quant History",
      description: "获取A股历史K线数据（OHLCV），自动计算 MA/RSI/MACD/KDJ/布林带等技术指标",
      parameters: QuantHistorySchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "历史K线+技术指标",
      execute: async (
        _: string,
        args: { code: string; start_date?: string; end_date?: string; frequency?: string; limit?: number },
      ) => {
        if (!ensurePythonDeps()) return jsonResult({ error: "Python 数据层未就绪" });
        const freq = args.frequency || "d";
        const limit = String(args.limit || 30);
        const ctx = { toolName: "quant_history", args, riskTier: "low" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const raw = runFetcher(["history", args.code, args.start_date || "", args.end_date || "", "--freq", freq, "--limit", limit]);
        const result = safeParseJson(raw);
        await runPostTradeHooks(ctx, result);
        return jsonResult(result);
      },
    }),
    buildTool({
      name: "quant_shareholders",
      label: "Quant Shareholders",
      description: "获取股票股东信息（股东户数、十大流通股东、机构持仓）",
      parameters: QuantShareholdersSchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "股东信息",
      execute: async (_: string, args: { code: string }) => {
        if (!ensurePythonDeps()) return jsonResult({ error: "Python 数据层未就绪" });
        const ctx = { toolName: "quant_shareholders", args, riskTier: "low" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const raw = runFetcher(["shareholders", args.code]);
        const result = safeParseJson(raw);
        await runPostTradeHooks(ctx, result);
        return jsonResult(result);
      },
    }),
    buildTool({
      name: "quant_screen",
      label: "Quant Screen",
      description: "基于实时行情筛选A股（支持价格、涨跌幅、成交量、换手率、市盈率等条件）",
      parameters: QuantScreenSchema,
      riskTier: "low",
      isConcurrencySafe: false,
      isReadOnly: true,
      displaySummary: "条件选股",
      execute: async (
        _: string,
        args: { market?: string; conditions?: Array<{ field: string; op: string; value: number }>; limit?: number },
      ) => {
        if (!ensurePythonDeps()) return jsonResult({ error: "Python 数据层未就绪" });
        const market = args.market || "cn";
        const limit = String(args.limit || 10);
        const condArgs = args.conditions ? ["--conditions", JSON.stringify(args.conditions)] : [];
        const ctx = { toolName: "quant_screen", args, riskTier: "low" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const raw = runFetcher(["screen", "--market", market, "--limit", limit, ...condArgs]);
        const result = safeParseJson(raw);
        await runPostTradeHooks(ctx, result);
        return jsonResult(result);
      },
    }),
    buildTool({
      name: "quant_pool_info",
      label: "Quant Pool Info",
      description: "查询股票池成分（沪深300、中证500、科创50、创业板50、自选股等）",
      parameters: QuantPoolInfoSchema,
      riskTier: "low",
      isConcurrencySafe: true,
      isReadOnly: true,
      displaySummary: "股票池查询",
      execute: async (_: string, args: { pool_name?: string }) => {
        if (!ensurePythonDeps()) return jsonResult({ error: "Python 数据层未就绪" });
        const poolName = args.pool_name || "沪深300";
        const ctx = { toolName: "quant_pool_info", args, riskTier: "low" as const, tradingMode, timestamp: Date.now() };
        const gate = await runPreTradeHooks(ctx);
        if (!gate.approved) return jsonResult({ error: gate.reason });
        const raw = runFetcher(["pool", "--pool-name", poolName]);
        const result = safeParseJson(raw);
        await runPostTradeHooks(ctx, result);
        return jsonResult(result);
      },
    }),
  ];
}
