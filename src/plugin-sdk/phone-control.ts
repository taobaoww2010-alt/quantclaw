// Narrow plugin-sdk surface for the bundled phone-control plugin.
// Keep this list additive and scoped to the bundled phone-control surface.

export { definePluginEntry } from "./plugin-entry.js";
export type {
  QuantClawPluginApi,
  QuantClawPluginCommandDefinition,
  QuantClawPluginService,
  PluginCommandContext,
} from "../plugins/types.js";
