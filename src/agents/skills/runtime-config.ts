import { getRuntimeConfigSnapshot, type QuantClawConfig } from "../../config/config.js";

export function resolveSkillRuntimeConfig(config?: QuantClawConfig): QuantClawConfig | undefined {
  return getRuntimeConfigSnapshot() ?? config;
}
