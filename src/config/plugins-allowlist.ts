import type { QuantClawConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: QuantClawConfig, pluginId: string): QuantClawConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
