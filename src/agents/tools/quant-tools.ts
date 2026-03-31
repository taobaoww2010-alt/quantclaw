import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const QuantQuoteSchema = Type.Object({
  code: Type.String({ description: "股票代码，如 000001.XSHE 或 600519.XSHG" }),
  fields: Type.Optional(Type.Array(Type.String(), { description: "要获取的字段列表" })),
});

const QuantHistorySchema = Type.Object({
  code: Type.String({ description: "股票代码" }),
  start_date: Type.String({ description: "开始日期 YYYY-MM-DD" }),
  end_date: Type.String({ description: "结束日期 YYYY-MM-DD" }),
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
  fields: Type.Optional(Type.Array(Type.String())),
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
  pool_name: Type.String({ description: "股票池名称，如 沪深300, 中证500, 自选" }),
});

export function createQuantTools(): AnyAgentTool[] {
  return [
    {
      label: "Quant Quote",
      name: "quant_quote",
      description: "获取A股实时行情数据（价格、涨跌幅、成交量、换手率等）",
      parameters: QuantQuoteSchema,
      execute: async (_: string, args: { code: string; fields?: string[] }) => {
        return jsonResult({
          code: args.code,
          fields: args.fields || [],
          _note: "使用 data/fetcher.py 获取实时数据",
        });
      },
    },
    {
      label: "Quant History",
      name: "quant_history",
      description: "获取A股历史K线数据（OHLCV、涨跌幅、后复权等）",
      parameters: QuantHistorySchema,
      execute: async (
        _: string,
        args: {
          code: string;
          start_date: string;
          end_date: string;
          frequency?: string;
          fields?: string[];
        },
      ) => {
        return jsonResult({
          code: args.code,
          start_date: args.start_date,
          end_date: args.end_date,
          frequency: args.frequency || "d",
          _note: "使用 data/fetcher.py 获取历史K线",
        });
      },
    },
    {
      label: "Quant Shareholders",
      name: "quant_shareholders",
      description: "获取股票股东信息（股东户数、十大流通股东、机构持仓）",
      parameters: QuantShareholdersSchema,
      execute: async (_: string, args: { code: string }) => {
        return jsonResult({ code: args.code, _note: "使用 data/fetcher.py 获取股东信息" });
      },
    },
    {
      label: "Quant Screen",
      name: "quant_screen",
      description: "基于财务/技术指标筛选A股",
      parameters: QuantScreenSchema,
      execute: async (
        _: string,
        args: {
          market?: string;
          conditions?: Array<{ field: string; op: string; value: number }>;
          limit?: number;
        },
      ) => {
        return jsonResult({
          market: args.market || "cn",
          limit: args.limit || 10,
          conditions: args.conditions || [],
          _note: "使用 data/fetcher.py 执行筛选",
        });
      },
    },
    {
      label: "Quant Pool Info",
      name: "quant_pool_info",
      description: "查询股票池成分（沪深300、中证500、科创50、自选股等）",
      parameters: QuantPoolInfoSchema,
      execute: async (_: string, args: { pool_name: string }) => {
        return jsonResult({ pool_name: args.pool_name, _note: "使用 data/fetcher.py 查询股票池" });
      },
    },
  ];
}
