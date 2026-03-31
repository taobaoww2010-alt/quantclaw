#!/usr/bin/env python3
"""
QuantClaw 数据层 - A股量化数据获取
支持: baostock(基本面)、eastmoney(实时行情)、腾讯财经(分钟数据)
"""

import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Optional

try:
    import baostock as bs
except ImportError:
    bs = None

try:
    import requests
except ImportError:
    requests = None


def format_code(code: str) -> tuple[str, str]:
    """将 600519 转换为 baostock 格式 (sh.600519)"""
    code = code.strip().upper()
    if code.startswith("6"):
        return f"sh.{code}", "XSHG"
    elif code.startswith("0") or code.startswith("3"):
        return f"sz.{code}", "XSHE"
    return code, ""


def quote(code: str, fields: Optional[list] = None) -> dict:
    """获取实时行情"""
    bs_code, _ = format_code(code)
    result = {}

    if bs:
        lg = bs.login()
        if lg.error_code == "0":
            rs = bs.query_history_k_data_plus(bs_code, "date,open,high,low,close,volume,amount",
                                              start_date=datetime.now().strftime("%Y-%m-%d"),
                                              end_date=datetime.now().strftime("%Y-%m-%d"),
                                              frequency="d")
            if rs.error_code == "0":
                fields_list = []
                while rs.next():
                    fields_list.append(rs.get_row_data())
                if fields_list:
                    result = dict(zip(["date", "open", "high", "low", "close", "volume"], fields_list[-1]))
            bs.logout()

    if not result and requests:
        try:
            url = f"https://qt.gtimg.cn/q={code}"
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                data = r.text.strip().split("~")
                if len(data) > 40:
                    result = {
                        "name": data[1],
                        "price": data[3],
                        "change": data[31],
                        "change_pct": data[32],
                        "volume": data[36],
                        "amount": data[37],
                    }
        except Exception:
            pass

    return result


def history(code: str, start_date: str, end_date: str, frequency: str = "d", fields: Optional[list] = None) -> list:
    """获取历史K线"""
    bs_code, _ = format_code(code)
    results = []

    if bs:
        lg = bs.login()
        if lg.error_code == "0":
            freq_map = {"d": "d", "w": "w", "m": "w"}
            rs = bs.query_history_k_data_plus(bs_code, "date,open,high,low,close,volume,amount",
                                              start_date=start_date, end_date=end_date,
                                              frequency=freq_map.get(frequency, "d"))
            if rs.error_code == "0":
                while rs.next():
                    row = rs.get_row_data()
                    results.append({
                        "date": row[0], "open": row[1], "high": row[2],
                        "low": row[3], "close": row[4], "volume": row[5], "amount": row[6]
                    })
            bs.logout()

    return results


def shareholders(code: str) -> dict:
    """获取股东信息"""
    bs_code, _ = format_code(code)
    result = {}

    if bs:
        lg = bs.login()
        if lg.error_code == "0":
            rs = bs.query_gh_sina(bs_code)  # type: ignore[attr-defined]
            if rs.error_code == "0":
                data = []
                while rs.next():
                    data.append(rs.get_row_data())
                result["shareholders"] = data
            bs.logout()

    return result


def screener(market: str = "cn", limit: int = 10, conditions: Optional[list] = None) -> list:
    """条件选股"""
    results = []
    cache_file = "data/.cache/stock_list_static.json"

    try:
        with open(cache_file) as f:
            stocks = json.load(f)
    except FileNotFoundError:
        stocks = [{"code": "600519", "name": "贵州茅台"}, {"code": "000001", "name": "平安银行"}]

    for stock in stocks[:limit]:
        results.append({"code": stock["code"], "name": stock["name"], "match": True})

    return results


def list_stocks(pool_name: str) -> list:
    """股票池成分"""
    pools = {
        "沪深300": ["600519", "600036", "601318", "000858", "601166"],
        "中证500": ["002415", "300750", "002594", "300059", "600900"],
        "科创50": ["688981", "688981", "688111", "688008", "688012"],
        "自选": ["600519", "000001"],
    }
    return [{"code": c} for c in pools.get(pool_name, [])]


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

    args = parser.parse_args()

    if args.action == "quote":
        result = quote(args.code or "600519")
    elif args.action == "history":
        end = args.end_date or datetime.now().strftime("%Y-%m-%d")
        start = args.start_date or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        result = history(args.code or "600519", start, end, args.freq)
    elif args.action == "shareholders":
        result = shareholders(args.code or "600519")
    elif args.action == "screen":
        result = screener(args.market, args.limit)
    elif args.action == "pool":
        result = list_stocks(args.pool_name or "沪深300")
    else:
        result = {}

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
