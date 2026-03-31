# 交易日志

## 概述

结构化记录所有交易行为，便于复盘和绩效统计。

## 工具

`quant_journal` 支持以下操作:

- `list_positions`: 查看当前持仓
- `add_position`: 记录新开仓
- `close_position`: 记录平仓
- `log_signal`: 记录未执行的交易信号
- `performance`: 统计绩效（总收益、胜率）
- `update_capital`: 更新账户资金

## 数据存储

- `data/journal/positions.json`: 持仓历史
- `data/journal/signals.json`: 信号记录
- `data/journal/capital.json`: 资金记录
