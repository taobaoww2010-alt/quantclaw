import { createConfigIO, getRuntimeConfigSnapshot, type QuantClawConfig } from "../config/config.js";

export function loadBrowserConfigForRuntimeRefresh(): QuantClawConfig {
  return getRuntimeConfigSnapshot() ?? createConfigIO().loadConfig();
}
