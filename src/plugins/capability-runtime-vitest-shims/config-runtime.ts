import { resolveActiveTalkProviderConfig } from "../../config/talk.js";
import type { QuantClawConfig } from "../../config/types.js";

export { resolveActiveTalkProviderConfig };

export function getRuntimeConfigSnapshot(): QuantClawConfig | null {
  return null;
}
