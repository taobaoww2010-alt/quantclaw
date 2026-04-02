import type { PluginRuntime } from "quantclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const {
  setRuntime: setSignalRuntime,
  clearRuntime: clearSignalRuntime,
  getRuntime: getSignalRuntime,
} = createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { clearSignalRuntime, getSignalRuntime, setSignalRuntime };
