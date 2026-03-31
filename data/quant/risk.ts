export interface RiskMetrics {
  max_position_size: number;
  max_loss_per_trade: number;
  max_drawdown: number;
  value_at_risk_95: number;
}

export function calc_position_size(
  capital: number,
  price: number,
  risk_per_trade: number = 0.02,
): number {
  const max_risk = capital * risk_per_trade;
  return Math.floor(max_risk / price / 100) * 100;
}

export function calc_sharpe(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0 ? (avg / std) * Math.sqrt(252) : 0;
}
