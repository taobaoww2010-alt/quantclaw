export { definePluginEntry } from "quantclaw/plugin-sdk/core";
export type {
  AnyAgentTool,
  QuantClawPluginApi,
  QuantClawPluginToolContext,
  QuantClawPluginToolFactory,
} from "quantclaw/plugin-sdk/core";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "quantclaw/plugin-sdk/windows-spawn";
