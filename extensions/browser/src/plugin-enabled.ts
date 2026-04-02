import type { QuantClawConfig } from "quantclaw/plugin-sdk/browser-support";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
} from "quantclaw/plugin-sdk/browser-support";

export function isDefaultBrowserPluginEnabled(cfg: QuantClawConfig): boolean {
  return resolveEffectiveEnableState({
    id: "browser",
    origin: "bundled",
    config: normalizePluginsConfig(cfg.plugins),
    rootConfig: cfg,
    enabledByDefault: true,
  }).enabled;
}
