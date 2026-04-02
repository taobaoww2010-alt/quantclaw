import type { PluginRuntime } from "quantclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "quantclaw/plugin-sdk/runtime-store";

const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } =
  createPluginRuntimeStore<PluginRuntime>("iMessage runtime not initialized");
export { getIMessageRuntime, setIMessageRuntime };
