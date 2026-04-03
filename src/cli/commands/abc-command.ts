import { Command } from "commander";
import { createEnhancedBacktest, runEnhancedBacktest } from "../../strategy/abc/enhanced-backtest.js";
import { createTradingAdapter, SimulatedTradingAdapter } from "../../strategy/abc/trading-adapter.js";
import { createMonitor } from "../../strategy/abc/monitor.js";
import { createNotificationCenter, createTelegramNotifier } from "../../strategy/abc/notifications.js";
import { createLevel2Provider } from "../../strategy/abc/level2-data.js";
import { createStockSelector } from "../../strategy/abc/stock-selector.js";
import { DEFAULT_STRATEGY_PARAMS } from "../../strategy/abc/types.js";

export function createABCStrategyCommand(): Command {
  const cmd = new Command("abc")
    .description("ABC量化交易策略");

  cmd
    .command("backtest")
    .description("运行回测")
    .requiredOption("-s, --symbol <code>", "股票代码")
    .requiredOption("-d, --start <date>", "开始日期 YYYY-MM-DD")
    .requiredOption("-e, --end <date>", "结束日期 YYYY-MM-DD")
    .option("-c, --capital <amount>", "初始资金", "100000")
    .option("--slippage <ratio>", "滑点", "0.0002")
    .action(async (options) => {
      console.log("\n========== ABC策略回测 ==========\n");

      const config = {
        symbol: options.symbol,
        startDate: options.start,
        endDate: options.end,
        initialCapital: parseFloat(options.capital),
        slippage: parseFloat(options.slippage),
        commission: {
          buy: 0.00015,
          sell: 0.001,
          minCommission: 5,
        },
      };

      const engine = createEnhancedBacktest(config);
      const result = await engine.run();

      console.log("回测完成！");
      console.log("\n关键指标:");
      console.log(`- 总收益率: ${(result.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`- 年化收益率: ${(result.summary.annualizedReturn * 100).toFixed(2)}%`);
      console.log(`- 胜率: ${(result.summary.winRate * 100).toFixed(1)}%`);
      console.log(`- 最大回撤: ${(result.summary.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`- 夏普比率: ${result.summary.sharpeRatio.toFixed(2)}`);
    });

  cmd
    .command("trade")
    .description("启动实盘/模拟交易")
    .option("-m, --mode <mode>", "交易模式", "simulate")
    .option("-s, --symbol <code>", "股票代码")
    .option("-c, --capital <amount>", "初始资金", "100000")
    .option("--telegram-token <token>", "Telegram Bot Token")
    .option("--telegram-chat <chatId>", "Telegram Chat ID")
    .action(async (options) => {
      const mode = options.mode as "simulate" | "paper" | "live";
      const symbol = options.symbol || "600519";
      const capital = parseFloat(options.capital);

      console.log("\n========== ABC策略交易 ==========\n");
      console.log(`模式: ${mode}`);
      console.log(`标的: ${symbol}`);
      console.log(`资金: ¥${capital.toLocaleString()}\n`);

      const adapter = createTradingAdapter({ broker: mode === "live" ? "xt" : "simulate" });
      await adapter.connect();

      const monitor = createMonitor();
      const notifications = createNotificationCenter();
      const level2Provider = createLevel2Provider({ symbol });

      if (options.telegramToken && options.telegramChat) {
        const telegram = createTelegramNotifier();
        telegram.configure(options.telegramToken, options.telegramChat);
        notifications.on("notification", (n) => {
          if (n.level === "error" || n.level === "critical") {
            telegram.send(`🚨 ${n.title}\n${n.message}`);
          }
        });
      }

      monitor.start();
      level2Provider.connect();
      level2Provider.startSnapshot();

      console.log("交易引擎已启动...");
      console.log("按 Ctrl+C 停止\n");

      let running = true;
      process.on("SIGINT", async () => {
        running = false;
        console.log("\n正在停止...");
        monitor.stop();
        level2Provider.disconnect();
        await adapter.disconnect();
        console.log("已停止\n");
        process.exit(0);
      });

      const checkInterval = setInterval(async () => {
        if (!running) {
          clearInterval(checkInterval);
          return;
        }

        try {
          const account = await adapter.queryAccount();
          const positions = await adapter.queryPositions();

          monitor.recordEquity(account.totalAsset);

          if (positions.length > 0) {
            const summary = monitor.getPortfolioSummary(
              { phase: "trading", floatPositions: [], orders: [], todayTrades: [] },
              new Map(positions.map((p) => [p.code, p.currentPrice])),
              account.cash,
            );
            monitor.printSummary(summary);
          }
        } catch (error) {
          console.error("检查失败:", error);
        }
      }, 60000);
    });

  cmd
    .command("screen")
    .description("选股筛选")
    .option("-l, --limit <count>", "返回数量", "10")
    .action(async (options) => {
      console.log("\n========== ABC策略选股 ==========\n");
      console.log("正在筛选符合条件的股票...\n");

      const selector = createStockSelector();
      const candidates = await selector.screenStocks();

      if (candidates.length === 0) {
        console.log("未找到符合条件的股票");
      } else {
        console.log(`找到 ${candidates.length} 只候选股票:\n`);
        candidates.slice(0, parseInt(options.limit)).forEach((stock, i) => {
          console.log(`${i + 1}. ${stock.code} ${stock.name}`);
          console.log(`   原因: ${stock.reason}\n`);
        });
      }
    });

  cmd
    .command("params")
    .description("查看/修改策略参数")
    .option("-s, --set <key=value>", "设置参数")
    .action((options) => {
      console.log("\n========== ABC策略参数 ==========\n");

      const params = DEFAULT_STRATEGY_PARAMS;

      if (options.set) {
        const [key, value] = options.set.split("=");
        console.log(`设置 ${key} = ${value}`);
      } else {
        console.log("委比参数:");
        console.log(`  买入区间: ${params.weibiBuyRange.min} ~ ${params.weibiBuyRange.max}`);
        console.log(`  卖出区间: ${params.weibiSellRange.min} ~ ${params.weibiSellRange.max}`);

        console.log("\n风控参数:");
        console.log(`  底仓止盈止损: ${params.baseTakeProfit * 100}%`);
        console.log(`  浮仓止盈: ${params.floatTakeProfit * 100}%`);
        console.log(`  浮仓止损: ${params.floatStopLoss * 100}%`);
        console.log(`  账户周止损: ${params.accountWeeklyStopLoss * 100}%`);

        console.log("\n交易参数:");
        console.log(`  日最大交易: ${params.dailyMaxFloatTrades}手`);
        console.log(`  最小间隔: ${params.minTradeInterval / 60000}分钟`);
        console.log(`  底仓比例: ${params.basePositionRatio * 100}%`);
        console.log(`  最大仓位: ${params.maxPositionRatio * 100}%`);
      }
    });

  cmd
    .command("status")
    .description("查看策略状态")
    .action(async () => {
      console.log("\n========== ABC策略状态 ==========\n");

      const adapter = createTradingAdapter({ broker: "simulate" });
      try {
        await adapter.connect();
        const account = await adapter.queryAccount();
        const positions = await adapter.queryPositions();

        console.log(`账户: ${account.accountId}`);
        console.log(`券商: ${account.broker}`);
        console.log(`总资产: ¥${account.totalAsset.toFixed(2)}`);
        console.log(`现金: ¥${account.cash.toFixed(2)}`);
        console.log(`市值: ¥${account.marketValue.toFixed(2)}`);

        if (positions.length > 0) {
          console.log("\n持仓:");
          for (const pos of positions) {
            const pnlPct = pos.unrealizedPnlRatio * 100;
            console.log(`  ${pos.code}: ${pos.quantity}股`);
            console.log(`    成本: ¥${pos.avgCost.toFixed(2)}`);
            console.log(`    现价: ¥${pos.currentPrice.toFixed(2)}`);
            console.log(`    盈亏: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
          }
        } else {
          console.log("\n持仓: 无");
        }

        await adapter.disconnect();
      } catch (error) {
        console.error("获取状态失败:", error);
      }
    });

  return cmd;
}
