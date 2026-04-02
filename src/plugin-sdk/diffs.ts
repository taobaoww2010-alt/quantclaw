// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to the bundled diffs surface.

export { definePluginEntry } from "./plugin-entry.js";
export type { QuantClawConfig } from "../config/config.js";
export { resolvePreferredQuantClawTmpDir } from "../infra/tmp-quantclaw-dir.js";
export type {
  AnyAgentTool,
  QuantClawPluginApi,
  QuantClawPluginConfigSchema,
  QuantClawPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
