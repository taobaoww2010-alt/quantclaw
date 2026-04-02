import type { QuantClawConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: QuantClawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
