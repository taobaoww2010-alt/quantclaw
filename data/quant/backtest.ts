export interface Trade {
  code: string;
  entry_date: string;
  entry_price: number;
  quantity: number;
  exit_date?: string;
  exit_price?: number;
  pnl?: number;
}

export interface BacktestResult {
  total_return: number;
  annualized_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  profit_loss_ratio: number;
}

export function backtest(trades: Trade[], initial_capital: number = 100000): BacktestResult {
  if (trades.length === 0) {
    return {
      total_return: 0,
      annualized_return: 0,
      max_drawdown: 0,
      sharpe_ratio: 0,
      win_rate: 0,
      total_trades: 0,
      profit_loss_ratio: 0,
    };
  }

  const wins = trades.filter((t) => (t.pnl || 0) > 0);
  const losses = trades.filter((t) => (t.pnl || 0) < 0);
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const total_return = totalPnl / initial_capital;
  const win_rate = trades.length > 0 ? wins.length / trades.length : 0;

  const avg_win =
    wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length : 0;
  const avg_loss =
    losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length)
      : 1;
  const profit_loss_ratio = avg_loss > 0 ? avg_win / avg_loss : 0;

  let peak = initial_capital;
  let max_drawdown = 0;
  let running = initial_capital;
  for (const trade of trades) {
    running += trade.pnl || 0;
    if (running > peak) {
      peak = running;
    }
    const dd = (peak - running) / peak;
    if (dd > max_drawdown) {
      max_drawdown = dd;
    }
  }

  const returns = trades.map((t) => (t.pnl || 0) / initial_capital);
  const avg_return = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avg_return, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  const sharpe_ratio = std > 0 ? (avg_return / std) * Math.sqrt(252) : 0;

  const dates = trades.map((t) => t.entry_date).toSorted();
  const years =
    dates.length > 1
      ? (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) /
        (365 * 24 * 3600 * 1000)
      : 1;
  const annualized_return = years > 0 ? Math.pow(1 + total_return, 1 / years) - 1 : 0;

  return {
    total_return: Math.round(total_return * 10000) / 100,
    annualized_return: Math.round(annualized_return * 10000) / 100,
    max_drawdown: Math.round(max_drawdown * 10000) / 100,
    sharpe_ratio: Math.round(sharpe_ratio * 100) / 100,
    win_rate: Math.round(win_rate * 10000) / 100,
    total_trades: trades.length,
    profit_loss_ratio: Math.round(profit_loss_ratio * 100) / 100,
  };
}
