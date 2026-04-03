import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

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
  return [
    {
      label: "Quant Quote",
      name: "quant_quote",
      description: "获取A股实时行情数据（价格、涨跌幅、成交量、换手率等）",
      parameters: QuantQuoteSchema,
      execute: async (_: string, args: { code: string }) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪，请运行: pip install baostock requests" });
        }
        const raw = runFetcher(["quote", args.code]);
        return jsonResult(safeParseJson(raw));
      },
    },
    {
      label: "Quant History",
      name: "quant_history",
      description: "获取A股历史K线数据（OHLCV、涨跌幅、后复权等），自动计算 MA/RSI/MACD/KDJ/布林带等技术指标",
      parameters: QuantHistorySchema,
      execute: async (
        _: string,
        args: {
          code: string;
          start_date?: string;
          end_date?: string;
          frequency?: string;
          limit?: number;
        },
      ) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪" });
        }
        const freq = args.frequency || "d";
        const limit = String(args.limit || 30);
        const raw = runFetcher([
          "history",
          args.code,
          args.start_date || "",
          args.end_date || "",
          "--freq", freq,
          "--limit", limit,
        ]);
        return jsonResult(safeParseJson(raw));
      },
    },
    {
      label: "Quant Shareholders",
      name: "quant_shareholders",
      description: "获取股票股东信息（股东户数、十大流通股东、机构持仓）",
      parameters: QuantShareholdersSchema,
      execute: async (_: string, args: { code: string }) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪" });
        }
        const raw = runFetcher(["shareholders", args.code]);
        return jsonResult(safeParseJson(raw));
      },
    },
    {
      label: "Quant Screen",
      name: "quant_screen",
      description: "基于实时行情筛选A股（支持价格、涨跌幅、成交量、换手率、市盈率等条件）",
      parameters: QuantScreenSchema,
      execute: async (
        _: string,
        args: {
          market?: string;
          conditions?: Array<{ field: string; op: string; value: number }>;
          limit?: number;
        },
      ) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪" });
        }
        const market = args.market || "cn";
        const limit = String(args.limit || 10);
        const condArgs = args.conditions ? ["--conditions", JSON.stringify(args.conditions)] : [];
        const raw = runFetcher(["screen", "--market", market, "--limit", limit, ...condArgs]);
        return jsonResult(safeParseJson(raw));
      },
    },
    {
      label: "Quant Pool Info",
      name: "quant_pool_info",
      description: "查询股票池成分（沪深300、中证500、科创50、创业板50、自选股等）",
      parameters: QuantPoolInfoSchema,
      execute: async (_: string, args: { pool_name?: string }) => {
        if (!ensurePythonDeps()) {
          return jsonResult({ error: "Python 数据层未就绪" });
        }
        const poolName = args.pool_name || "沪深300";
        const raw = runFetcher(["pool", "--pool-name", poolName]);
        return jsonResult(safeParseJson(raw));
      },
    },
  ];
}
