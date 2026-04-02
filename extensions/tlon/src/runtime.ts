import type { PluginRuntime } from "quantclaw/plugin-sdk/plugin-runtime";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const { setRuntime: setTlonRuntime, getRuntime: getTlonRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Tlon runtime not initialized");
export { getTlonRuntime, setTlonRuntime };
