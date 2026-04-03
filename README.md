# ☯️ QuantClaw — A股量化交易 AI 助手

<p align="center">
    <a href="https://github.com/taobaoww2010-alt/quantclaw">
        <img src="https://img.shields.io/badge/GitHub-QuantClaw-brightgreen" alt="GitHub">
    </a>
    <a href="https://github.com/taobaoww2010-alt/quantclaw/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
    </a>
</p>

> 基于多渠道 AI 网关的 A 股量化交易扩展，支持飞书、Telegram、Discord 等平台接入。

---

## 功能特性

### 🤖 多渠道 AI 对话

通过飞书、Telegram、Discord 等消息平台与 AI 智能体对话，获取实时行情、K线数据、选股分析。

### 📈 A 股量化工具

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

---

## 安装

### 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 22.14.0（推荐 24.x） |
| pnpm | >= 10.0 |
| macOS / Linux / Windows | 均可 |

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/taobaoww2010-alt/quantclaw.git
cd quantclaw

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm build
```

---

## 配置

### 1. 创建配置文件

```bash
mkdir -p ~/.quantclaw
```

创建 `~/.quantclaw/quantclaw.json`：

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "你的随机token"
    }
  }
}
```

### 2. 配置 AI 模型

#### 方式一：本地 vLLM（推荐）

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/Qwen3-32B-AWQ"
      },
      "thinkingDefault": "off"
    }
  },
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "http://localhost:8000/v1",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          {
            "id": "Qwen3-32B-AWQ",
            "name": "Qwen3-32B-AWQ"
          }
        ]
      }
    }
  }
}
```

#### 方式二：Anthropic Claude

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6"
      }
    }
  }
}
```

然后配置 API Key：
```bash
pnpm quantclaw config set agents.main.agent.auth-profiles.anthropic.type api_key
pnpm quantclaw config set agents.main.agent.auth-profiles.anthropic.key "sk-ant-xxx"
```

### 3. 配置消息渠道

#### 飞书

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_xxxxxxxxxx",
      "appSecret": "你的App Secret",
      "allowFrom": ["你的飞书open_id"]
    }
  },
  "plugins": {
    "entries": {
      "feishu": {
        "enabled": true
      }
    }
  }
}
```

**飞书应用配置步骤：**
1. 访问 https://open.feishu.cn/app 创建企业自建应用
2. 获取 App ID 和 App Secret
3. 开通权限：`im:message`、`im:chat`、`contact:contact.base:readonly`
4. 开启机器人能力并发布应用
5. 事件订阅方式选择：**长连接（WebSocket）**

---

## 启动

```bash
# 本地模式（仅本机访问）
pnpm quantclaw gateway run --bind loopback --port 18789

# 局域网模式（同网络可访问）
pnpm quantclaw gateway run --bind lan --port 18789
```

启动后访问：
- **控制台**: http://127.0.0.1:18789/
- **状态检查**: `pnpm quantclaw channels status`

---

## 使用

### 对话示例

在飞书中给机器人发消息：

```
你好
```

```
查询贵州茅台今天的行情
```

```
帮我筛选市盈率低于20、ROE大于15的股票
```

```
显示我的持仓
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm quantclaw status` | 查看运行状态 |
| `pnpm quantclaw channels status` | 查看渠道连接状态 |
| `pnpm quantclaw config set <key> <value>` | 修改配置 |
| `pnpm quantclaw doctor` | 诊断常见问题 |

---

## 项目结构

```
QuantClaw/
├── src/                          # 核心源码
│   ├── agents/tools/             # AI 工具（量化查询、交易日志）
│   ├── channels/                 # 消息渠道（飞书、Telegram 等）
│   └── gateway/                  # 网关服务
├── extensions/                   # 渠道扩展
│   └── feishu/                   # 飞书插件
├── data/
│   ├── fetcher.py                # Python 数据获取层
│   └── quant/                    # 量化回测库
└── .agents/skills/               # 内置策略
```

---

## 常见问题

### Gateway 启动慢

首次启动需要构建，约 3-5 分钟，属正常现象。

### 飞书收不到消息

1. 检查飞书应用权限是否已开通
2. 检查 `allowFrom` 是否包含你的飞书 ID
3. 查看日志：`tail -f /tmp/quantclaw/quantclaw-*.log`

### 模型返回 400 错误

检查模型 ID 是否与 vLLM 返回的一致：
```bash
curl http://localhost:8000/v1/models
```

---

## 许可证

基于原项目 MIT License 开源。
