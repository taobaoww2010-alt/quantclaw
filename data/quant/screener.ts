export interface ScreenCondition {
  field: string;
  op: "gt" | "lt" | "eq" | "gte" | "lte";
  value: number;
}

export interface StockScore {
  code: string;
  name: string;
  score: number;
  matched_conditions: number;
}

export function score_stock(
  metrics: Record<string, number>,
  conditions: ScreenCondition[],
): number {
  let score = 0;
  for (const cond of conditions) {
    const val = metrics[cond.field];
    if (val === undefined) {
      continue;
    }
    let matched = false;
    switch (cond.op) {
      case "gt":
        matched = val > cond.value;
        break;
      case "lt":
        matched = val < cond.value;
        break;
      case "eq":
        matched = val === cond.value;
        break;
      case "gte":
        matched = val >= cond.value;
        break;
      case "lte":
        matched = val <= cond.value;
        break;
    }
    if (matched) {
      score++;
    }
  }
  return score;
}
