// Private runtime barrel for the bundled Signal extension.
// Prefer narrower SDK subpaths plus local extension seams over the legacy signal barrel.

export type { ChannelMessageActionAdapter } from "quantclaw/plugin-sdk/channel-contract";
export { SignalConfigSchema } from "quantclaw/plugin-sdk/channel-config-schema";
export { PAIRING_APPROVED_MESSAGE } from "quantclaw/plugin-sdk/channel-status";
import type { QuantClawConfig as RuntimeQuantClawConfig } from "quantclaw/plugin-sdk/config-runtime";
export type { RuntimeQuantClawConfig as QuantClawConfig };
export type { QuantClawPluginApi, PluginRuntime } from "quantclaw/plugin-sdk/core";
export type { ChannelPlugin } from "quantclaw/plugin-sdk/core";
export {
  DEFAULT_ACCOUNT_ID,
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  deleteAccountFromConfigSection,
  emptyPluginConfigSchema,
  formatPairingApproveHint,
  getChatChannelMeta,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "quantclaw/plugin-sdk/core";
export { resolveChannelMediaMaxBytes } from "quantclaw/plugin-sdk/media-runtime";
export { formatCliCommand, formatDocsLink } from "quantclaw/plugin-sdk/setup-tools";
export { chunkText } from "quantclaw/plugin-sdk/reply-runtime";
export { detectBinary, installSignalCli } from "quantclaw/plugin-sdk/setup-tools";
export {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "quantclaw/plugin-sdk/config-runtime";
export {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "quantclaw/plugin-sdk/status-helpers";
export { normalizeE164 } from "quantclaw/plugin-sdk/text-runtime";
export { looksLikeSignalTargetId, normalizeSignalMessagingTarget } from "./normalize.js";
export {
  listEnabledSignalAccounts,
  listSignalAccountIds,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
} from "./accounts.js";
export { monitorSignalProvider } from "./monitor.js";
export { probeSignal } from "./probe.js";
export { resolveSignalReactionLevel } from "./reaction-level.js";
export { removeReactionSignal, sendReactionSignal } from "./send-reactions.js";
export { sendMessageSignal } from "./send.js";
export { signalMessageActions } from "./message-actions.js";
export type { ResolvedSignalAccount } from "./accounts.js";
export type SignalAccountConfig = Omit<
  Exclude<NonNullable<RuntimeQuantClawConfig["channels"]>["signal"], undefined>,
  "accounts"
>;
