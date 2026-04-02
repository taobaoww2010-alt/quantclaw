import type { PluginRuntime } from "quantclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const {
  setRuntime: setSlackRuntime,
  clearRuntime: clearSlackRuntime,
  getRuntime: getSlackRuntime,
} = createPluginRuntimeStore<PluginRuntime>("Slack runtime not initialized");
export { clearSlackRuntime, getSlackRuntime, setSlackRuntime };
