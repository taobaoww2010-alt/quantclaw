// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelMessageActionName,
  ChannelMeta,
  ChannelOutboundAdapter,
  QuantClawConfig as ClawdbotConfig,
  QuantClawConfig,
  QuantClawPluginApi,
  PluginRuntime,
  RuntimeEnv,
} from "quantclaw/plugin-sdk/feishu";
export {
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  buildChannelConfigSchema,
  buildProbeChannelStatusSummary,
  createActionGate,
  createDefaultChannelRuntimeState,
} from "quantclaw/plugin-sdk/feishu";
export * from "quantclaw/plugin-sdk/feishu";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "quantclaw/plugin-sdk/webhook-ingress";
