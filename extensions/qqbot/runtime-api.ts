export type { ChannelPlugin, QuantClawPluginApi, PluginRuntime } from "@openclaw/plugin-sdk/core";
export type { QuantClawConfig } from "@openclaw/plugin-sdk/config-runtime";
export type {
  QuantClawPluginService,
  QuantClawPluginServiceContext,
  PluginLogger,
} from "@openclaw/plugin-sdk/core";
export type { ResolvedQQBotAccount, QQBotAccountConfig } from "./src/types.js";
export { getQQBotRuntime, setQQBotRuntime } from "./src/runtime.js";
