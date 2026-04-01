# 🦞 QuantClaw — OpenClaw A股量化版

<p align="center">
    <a href="https://github.com/taobaoww2010-alt/quantclaw">
        <img src="https://img.shields.io/badge/GitHub-QuantClaw-brightgreen" alt="GitHub">
    </a>
    <a href="https://github.com/taobaoww2010-alt/quantclaw/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
    </a>
</p>

> 基于 [OpenClaw](https://github.com/openclaw/openclaw) (MIT License) 的 A 股量化交易扩展版本。

## 核心功能

### 🤖 AI 智能体

继承 OpenClaw 的多渠道 AI 网关，支持 Telegram、Discord、Slack、微信等主流平台。

### 📈 量化交易工具

| 工具                 | 说明                                        |
| -------------------- | ------------------------------------------- |
| `quant_quote`        | A股实时行情（价格、涨跌幅、成交量、换手率） |
| `quant_history`      | 历史K线数据（OHLCV、后复权）                |
| `quant_shareholders` | 股东信息（股东户数、十大流通股东）          |
| `quant_screen`       | 条件选股（财务/技术指标筛选）               |
| `quant_pool_info`    | 股票池查询（沪深300、中证500、科创50）      |

### 📓 交易日志

| 操作             | 说明                               |
| ---------------- | ---------------------------------- |
| `list_positions` | 查询当前持仓                       |
| `add_position`   | 记录新开仓                         |
| `close_position` | 平仓记录                           |
| `log_signal`     | 交易信号记录                       |
| `performance`    | 绩效统计（收益率、胜率、夏普比率） |

### 📊 内置策略

- **ABC 趋势跟踪策略**：基于技术面的趋势跟踪系统
- **量化选股器**：多条件财务/技术指标筛选
- **量化预警**：价格异动、技术破位监控

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
```

### 运行

```bash
pnpm openclaw
```

### 数据层配置

Python 数据获取依赖 baostock 和 requests：

```bash
pip install baostock requests
```

## 项目结构

```
QuantClaw/
├── src/agents/tools/          # AI 工具
│   ├── quant-tools.ts         # 量化工具
│   └── quant-journal-tool.ts  # 交易日志
├── data/
│   ├── fetcher.py             # Python 数据获取层
│   ├── journal/                # 交易日志存储
│   └── quant/                  # 量化回测库
└── .agents/skills/            # 内置策略
```

## 许可证

基于 [OpenClaw MIT License](https://github.com/openclaw/openclaw/blob/main/LICENSE) 开源。
