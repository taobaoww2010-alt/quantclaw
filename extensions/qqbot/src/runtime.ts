import type { PluginRuntime } from "quantclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const { setRuntime: setQQBotRuntime, getRuntime: getQQBotRuntime } =
  createPluginRuntimeStore<PluginRuntime>("QQBot runtime not initialized");
export { getQQBotRuntime, setQQBotRuntime };
