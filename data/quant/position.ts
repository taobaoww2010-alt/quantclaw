export interface Position {
  id: string;
  code: string;
  name: string;
  side: "long" | "short";
  quantity: number;
  avg_price: number;
  entry_date: string;
  strategy?: string;
  notes?: string;
  status: "open" | "closed";
  pnl?: number;
  close_price?: number;
  close_date?: string;
  reason?: string;
}

export function calc_pnl(pos: Position, current_price: number): number {
  const diff = current_price - pos.avg_price;
  return pos.side === "long" ? diff * pos.quantity : -diff * pos.quantity;
}

export function calc_return(pos: Position, current_price: number): number {
  const pnl = calc_pnl(pos, current_price);
  return pnl / (pos.avg_price * pos.quantity);
}
