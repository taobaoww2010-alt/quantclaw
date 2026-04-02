import type { PluginRuntime } from "quantclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const { setRuntime: setDiscordRuntime, getRuntime: getDiscordRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Discord runtime not initialized");
export { getDiscordRuntime, setDiscordRuntime };
