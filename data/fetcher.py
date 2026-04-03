#!/usr/bin/env python3
"""
QuantClaw 数据层 - A股量化数据获取
支持: baostock(基本面/历史K线)、eastmoney(实时行情)、技术指标计算
"""

import sys
import json
import math
import argparse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

try:
    import baostock as bs
except ImportError:
    bs = None

try:
    import requests
except ImportError:
    requests = None

# ============================================================
# 股票池数据
# ============================================================

STOCK_POOLS = {
    "沪深300": [
        "600519", "600036", "601318", "000858", "601166", "600276", "601398", "600900",
        "601288", "601857", "600030", "600000", "601601", "600016", "601328", "600028",
        "601988", "600050", "601668", "601169", "600048", "601818", "601766", "600031",
        "601211", "600104", "601688", "600690", "601888", "600309", "601919", "600196",
        "601336", "600585", "600009", "601088", "600547", "601012", "601225", "600089",
        "000001", "000333", "000651", "000725", "000858", "002304", "002415", "002594",
        "300059", "300750", "000002", "000568", "000596", "000661", "000776", "000895",
        "002001", "002027", "002142", "002230", "002352", "002475", "002714", "300015",
        "300122", "300124", "300347", "300498", "300760", "300999",
    ],
    "中证500": [
        "000002", "000538", "000596", "000661", "000776", "000895", "002001", "002027",
        "002049", "002129", "002142", "002230", "002304", "002352", "002415", "002475",
        "002594", "002714", "002812", "002841", "300015", "300059", "300122", "300124",
        "300347", "300498", "300750", "300760", "300999", "600006", "600023", "600053",
        "600060", "600061", "600062", "600085", "600100", "600111", "600161", "600196",
    ],
    "科创50": [
        "688981", "688111", "688008", "688012", "688036", "688041", "688126", "688187",
        "688256", "688396", "688599", "688777", "688002", "688005", "688009", "688180",
    ],
    "创业板50": [
        "300059", "300750", "300015", "300122", "300124", "300347", "300498", "300760",
        "300999", "300033", "300308", "300408", "300433", "300450", "300476", "300661",
    ],
    "自选": ["600519", "000001", "000333", "000651", "000725", "002415", "300750"],
}


def get_all_stock_list() -> List[Dict[str, str]]:
    """获取全A股列表"""
    all_stocks = []
    seen = set()

    for pool_name, codes in STOCK_POOLS.items():
        for code in codes:
            if code not in seen:
                seen.add(code)
                name = _get_stock_name(code)
                all_stocks.append({"code": code, "name": name, "pool": pool_name})

    # 补充常见 A 股
    common = [
        ("600519", "贵州茅台"), ("000001", "平安银行"), ("000333", "美的集团"),
        ("000651", "格力电器"), ("000725", "京东方A"), ("000858", "五粮液"),
        ("002415", "海康威视"), ("002594", "比亚迪"), ("300750", "宁德时代"),
        ("300059", "东方财富"), ("601318", "中国平安"), ("600036", "招商银行"),
        ("601398", "工商银行"), ("600900", "长江电力"), ("601857", "中国石油"),
        ("600276", "恒瑞医药"), ("601166", "兴业银行"), ("600030", "中信证券"),
        ("600000", "浦发银行"), ("601601", "中国太保"), ("600016", "民生银行"),
        ("601288", "农业银行"), ("601988", "中国银行"), ("600050", "中国联通"),
        ("601668", "中国建筑"), ("601169", "北京银行"), ("600048", "保利发展"),
        ("601818", "光大银行"), ("601766", "中国中车"), ("600031", "三一重工"),
        ("601211", "国泰君安"), ("600104", "上汽集团"), ("601688", "华泰证券"),
        ("600690", "海尔智家"), ("601888", "中国中免"), ("600309", "万华化学"),
        ("601919", "中远海控"), ("600196", "复星医药"), ("601336", "新华保险"),
        ("600585", "海螺水泥"), ("600009", "上海机场"), ("601088", "中国神华"),
        ("600547", "山东黄金"), ("601012", "隆基绿能"), ("601225", "陕西煤业"),
        ("600089", "特变电工"), ("000002", "万科A"), ("000568", "泸州老窖"),
        ("000596", "古井贡酒"), ("000661", "长春高新"), ("000776", "广发证券"),
        ("000895", "双汇发展"), ("002001", "新和成"), ("002027", "分众传媒"),
        ("002142", "宁波银行"), ("002230", "科大讯飞"), ("002304", "洋河股份"),
        ("002475", "立讯精密"), ("002714", "牧原股份"), ("002812", "恩捷股份"),
        ("300015", "爱尔眼科"), ("300033", "同花顺"), ("300122", "智飞生物"),
        ("300124", "汇川技术"), ("300347", "泰格医药"), ("300498", "温氏股份"),
        ("300760", "迈瑞医疗"), ("300999", "金龙鱼"), ("688981", "中芯国际"),
        ("688111", "金山办公"), ("688008", "澜起科技"), ("688012", "中微公司"),
        ("688036", "传音控股"), ("688041", "海光信息"), ("688126", "沪硅产业"),
        ("688187", "时代电气"), ("688396", "华润微"), ("688599", "天合光能"),
        ("688777", "中控技术"), ("688002", "睿创微纳"), ("688005", "容百科技"),
        ("688009", "中国通号"), ("688180", "君实生物"),
    ]
    for code, name in common:
        if code not in seen:
            seen.add(code)
            all_stocks.append({"code": code, "name": name, "pool": "全市场"})

    return all_stocks


def _get_stock_name(code: str) -> str:
    """简单股票名映射"""
    names = {
        "600519": "贵州茅台", "000001": "平安银行", "000333": "美的集团",
        "000651": "格力电器", "000725": "京东方A", "000858": "五粮液",
        "002415": "海康威视", "002594": "比亚迪", "300750": "宁德时代",
        "300059": "东方财富", "601318": "中国平安", "600036": "招商银行",
        "601398": "工商银行", "600900": "长江电力", "601857": "中国石油",
        "600276": "恒瑞医药", "601166": "兴业银行", "600030": "中信证券",
        "600000": "浦发银行", "601601": "中国太保", "600016": "民生银行",
        "601288": "农业银行", "601988": "中国银行", "600050": "中国联通",
        "601668": "中国建筑", "601169": "北京银行", "600048": "保利发展",
        "601818": "光大银行", "601766": "中国中车", "600031": "三一重工",
        "601211": "国泰君安", "600104": "上汽集团", "601688": "华泰证券",
        "600690": "海尔智家", "601888": "中国中免", "600309": "万华化学",
        "601919": "中远海控", "600196": "复星医药", "601336": "新华保险",
        "600585": "海螺水泥", "600009": "上海机场", "601088": "中国神华",
        "600547": "山东黄金", "601012": "隆基绿能", "601225": "陕西煤业",
        "600089": "特变电工", "000002": "万科A", "000568": "泸州老窖",
        "000596": "古井贡酒", "000661": "长春高新", "000776": "广发证券",
        "000895": "双汇发展", "002001": "新和成", "002027": "分众传媒",
        "002142": "宁波银行", "002230": "科大讯飞", "002304": "洋河股份",
        "002475": "立讯精密", "002714": "牧原股份", "002812": "恩捷股份",
        "300015": "爱尔眼科", "300033": "同花顺", "300122": "智飞生物",
        "300124": "汇川技术", "300347": "泰格医药", "300498": "温氏股份",
        "300760": "迈瑞医疗", "300999": "金龙鱼", "688981": "中芯国际",
        "688111": "金山办公", "688008": "澜起科技", "688012": "中微公司",
    }
    return names.get(code, "")


# ============================================================
# 行情数据
# ============================================================

def format_code(code: str) -> tuple:
    """将 600519 转换为 baostock 格式 (sh.600519)"""
    code = code.strip().upper()
    if code.startswith("6"):
        return f"sh.{code}", "XSHG"
    elif code.startswith("0") or code.startswith("3"):
        return f"sz.{code}", "XSHE"
    elif code.startswith("688"):
        return f"sh.{code}", "XSHG"
    return code, ""


def quote(code: str) -> dict:
    """获取实时行情（腾讯财经 API）"""
    result = {"code": code}

    # 尝试腾讯财经实时行情
    if requests:
        try:
            prefix = "sh" if code.startswith("6") or code.startswith("688") else "sz"
            url = f"https://qt.gtimg.cn/q={prefix}{code}"
            r = requests.get(url, timeout=5)
            if r.status_code == 200 and len(r.text) > 10:
                data = r.text.strip().split("~")
                if len(data) > 40:
                    result.update({
                        "name": data[1],
                        "price": float(data[3]) if data[3] else None,
                        "prev_close": float(data[4]) if data[4] else None,
                        "open": float(data[5]) if data[5] else None,
                        "high": float(data[33]) if data[33] else None,
                        "low": float(data[34]) if data[34] else None,
                        "volume": int(data[36]) if data[36] else 0,
                        "amount": float(data[37]) if data[37] else 0,
                        "change": float(data[31]) if data[31] else 0,
                        "change_pct": float(data[32]) if data[32] else 0,
                        "turnover_rate": float(data[38]) if data[38] else None,
                        "pe_ratio": float(data[39]) if data[39] else None,
                        "market_cap": float(data[44]) if data[44] else None,
                        "source": "腾讯财经",
                    })
                    return result
        except Exception as e:
            result["error"] = str(e)

    # 回退到 baostock
    if bs:
        try:
            bs_code, _ = format_code(code)
            lg = bs.login()
            if lg.error_code == "0":
                rs = bs.query_history_k_data_plus(
                    bs_code, "date,open,high,low,close,volume,amount",
                    start_date=datetime.now().strftime("%Y-%m-%d"),
                    end_date=datetime.now().strftime("%Y-%m-%d"),
                    frequency="d"
                )
                if rs.error_code == "0":
                    rows = []
                    while rs.next():
                        rows.append(rs.get_row_data())
                    if rows:
                        row = rows[-1]
                        result.update({
                            "date": row[0],
                            "open": row[1], "high": row[2], "low": row[3],
                            "close": row[4], "volume": row[5], "amount": row[6],
                            "source": "baostock",
                        })
                bs.logout()
        except Exception as e:
            result["baostock_error"] = str(e)

    return result


def history(code: str, start_date: str, end_date: str,
            frequency: str = "d", limit: int = 30) -> dict:
    """获取历史K线 + 技术指标"""
    if not start_date:
        start_date = (datetime.now() - timedelta(days=limit * 2)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    rows = []
    if bs:
        try:
            bs_code, _ = format_code(code)
            lg = bs.login()
            if lg.error_code == "0":
                freq_map = {"d": "d", "w": "w", "m": "M"}
                rs = bs.query_history_k_data_plus(
                    bs_code, "date,open,high,low,close,volume,amount,turn",
                    start_date=start_date, end_date=end_date,
                    frequency=freq_map.get(frequency, "d")
                )
                if rs.error_code == "0":
                    while rs.next():
                        row = rs.get_row_data()
                        rows.append({
                            "date": row[0], "open": float(row[1]) if row[1] else 0,
                            "high": float(row[2]) if row[2] else 0,
                            "low": float(row[3]) if row[3] else 0,
                            "close": float(row[4]) if row[4] else 0,
                            "volume": float(row[5]) if row[5] else 0,
                            "amount": float(row[6]) if row[6] else 0,
                            "turnover": float(row[7]) if row[7] else 0,
                        })
                bs.logout()
        except Exception as e:
            return {"error": str(e), "code": code}

    # 计算技术指标
    result = {
        "code": code,
        "start_date": start_date,
        "end_date": end_date,
        "frequency": frequency,
        "count": len(rows),
        "data": rows[-limit:] if limit and len(rows) > limit else rows,
    }

    if len(rows) >= 5:
        result["indicators"] = calc_indicators(rows)

    return result


# ============================================================
# 技术指标计算
# ============================================================

def calc_indicators(rows: List[Dict]) -> Dict[str, Any]:
    """计算常用技术指标"""
    closes = [r["close"] for r in rows if r["close"] > 0]
    volumes = [r["volume"] for r in rows]
    highs = [r["high"] for r in rows]
    lows = [r["low"] for r in rows]

    if len(closes) < 5:
        return {}

    result = {}

    # 移动平均线 MA
    for period in [5, 10, 20, 60]:
        if len(closes) >= period:
            result[f"MA{period}"] = round(sum(closes[-period:]) / period, 2)

    # EMA (指数移动平均)
    if len(closes) >= 12:
        result["EMA12"] = round(calc_ema(closes, 12), 2)
    if len(closes) >= 26:
        result["EMA26"] = round(calc_ema(closes, 26), 2)

    # MACD
    if len(closes) >= 26:
        ema12 = calc_ema(closes, 12)
        ema26 = calc_ema(closes, 26)
        dif = ema12 - ema26
        result["MACD_DIF"] = round(dif, 4)
        result["MACD_DEA"] = round(dif * 0.8, 4)  # simplified
        result["MACD_HIST"] = round((dif - dif * 0.8) * 2, 4)

    # RSI
    if len(closes) >= 14:
        result["RSI6"] = round(calc_rsi(closes, 6), 2)
        result["RSI12"] = round(calc_rsi(closes, 12), 2)
        result["RSI24"] = round(calc_rsi(closes, 24), 2)

    # KDJ
    if len(closes) >= 9 and len(highs) >= 9 and len(lows) >= 9:
        k, d, j = calc_kdj(highs, lows, closes, 9)
        result["KDJ_K"] = round(k, 2)
        result["KDJ_D"] = round(d, 2)
        result["KDJ_J"] = round(j, 2)

    # 布林带
    if len(closes) >= 20:
        ma20 = sum(closes[-20:]) / 20
        std = math.sqrt(sum((c - ma20) ** 2 for c in closes[-20:]) / 20)
        result["BOLL_UPPER"] = round(ma20 + 2 * std, 2)
        result["BOLL_MID"] = round(ma20, 2)
        result["BOLL_LOWER"] = round(ma20 - 2 * std, 2)

    # 成交量均线
    if len(volumes) >= 5:
        result["VOL_MA5"] = round(sum(volumes[-5:]) / 5, 0)
    if len(volumes) >= 10:
        result["VOL_MA10"] = round(sum(volumes[-10:]) / 10, 0)

    return result


def calc_ema(data: List[float], period: int) -> float:
    """计算 EMA"""
    if len(data) < period:
        return data[-1] if data else 0
    multiplier = 2 / (period + 1)
    ema = sum(data[:period]) / period
    for price in data[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def calc_rsi(closes: List[float], period: int) -> float:
    """计算 RSI"""
    if len(closes) < period + 1:
        return 50.0
    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calc_kdj(highs: List[float], lows: List[float], closes: List[float],
             period: int = 9) -> tuple:
    """计算 KDJ"""
    if len(closes) < period:
        return 50, 50, 50
    recent_highs = highs[-period:]
    recent_lows = lows[-period:]
    hn = max(recent_highs)
    ln = min(recent_lows)
    cn = closes[-1]
    if hn == ln:
        rsv = 50
    else:
        rsv = (cn - ln) / (hn - ln) * 100
    k = rsv * 2 / 3 + 50 / 3
    d = k * 2 / 3 + 50 / 3
    j = 3 * k - 2 * d
    return k, d, j


# ============================================================
# 股东信息
# ============================================================

def shareholders(code: str) -> dict:
    """获取股东信息"""
    result = {"code": code}
    if bs:
        try:
            bs_code, _ = format_code(code)
            lg = bs.login()
            if lg.error_code == "0":
                rs = bs.query_gh_sina(bs_code)
                if rs.error_code == "0":
                    data = []
                    while rs.next():
                        data.append(rs.get_row_data())
                    result["shareholders"] = data
                bs.logout()
        except Exception as e:
            result["error"] = str(e)
    return result


# ============================================================
# 选股
# ============================================================

def screener(market: str = "cn", limit: int = 10,
             conditions: Optional[list] = None) -> list:
    """条件选股 - 基于实时行情筛选"""
    all_stocks = get_all_stock_list()
    results = []

    for stock in all_stocks:
        code = stock["code"]
        q = quote(code)
        if not q or "error" in q:
            continue

        # 默认条件：有价格数据
        if q.get("price") is None:
            continue

        match = True
        if conditions:
            for cond in conditions:
                field = cond.get("field", "")
                op = cond.get("op", "gt")
                value = cond.get("value", 0)
                actual = q.get(field)
                if actual is None:
                    match = False
                    break
                try:
                    actual = float(actual)
                except (ValueError, TypeError):
                    match = False
                    break
                if op == "gt" and actual <= value:
                    match = False
                elif op == "lt" and actual >= value:
                    match = False
                elif op == "eq" and abs(actual - value) > 0.01:
                    match = False
                if not match:
                    break

        if match:
            results.append({
                "code": code,
                "name": stock.get("name", ""),
                "price": q.get("price"),
                "change_pct": q.get("change_pct"),
                "volume": q.get("volume"),
                "turnover_rate": q.get("turnover_rate"),
                "pe_ratio": q.get("pe_ratio"),
            })
            if len(results) >= limit:
                break

    return results


def list_stocks(pool_name: str) -> list:
    """股票池成分"""
    all_stocks = get_all_stock_list()
    if pool_name in STOCK_POOLS:
        codes = STOCK_POOLS[pool_name]
        return [
            {"code": c, "name": _get_stock_name(c)}
            for c in codes
        ]
    # 返回全市场
    return [{"code": s["code"], "name": s["name"]} for s in all_stocks]


# ============================================================
# 主入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="QuantClaw Data Fetcher")
    parser.add_argument("action", choices=["quote", "history", "shareholders", "screen", "pool"])
    parser.add_argument("code", nargs="?", help="股票代码")
    parser.add_argument("start_date", nargs="?", help="开始日期 YYYY-MM-DD")
    parser.add_argument("end_date", nargs="?", help="结束日期 YYYY-MM-DD")
    parser.add_argument("--freq", default="d", help="频率: d/w/m")
    parser.add_argument("--fields", help="字段列表，逗号分隔")
    parser.add_argument("--market", default="cn", help="市场: cn/hk/us")
    parser.add_argument("--limit", type=int, default=10, help="返回数量")
    parser.add_argument("--pool-name", dest="pool_name", help="股票池名称")
    parser.add_argument("--conditions", help="筛选条件 JSON")

    args = parser.parse_args()

    if args.action == "quote":
        result = quote(args.code or "600519")
    elif args.action == "history":
        end = args.end_date or datetime.now().strftime("%Y-%m-%d")
        start = args.start_date or (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
        result = history(args.code or "600519", start, end, args.freq, args.limit)
    elif args.action == "shareholders":
        result = shareholders(args.code or "600519")
    elif args.action == "screen":
        conditions = None
        if args.conditions:
            try:
                conditions = json.loads(args.conditions)
            except json.JSONDecodeError:
                pass
        result = screener(args.market, args.limit, conditions)
    elif args.action == "pool":
        result = list_stocks(args.pool_name or "沪深300")
    else:
        result = {}

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
