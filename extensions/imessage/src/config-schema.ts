import {
  buildChannelConfigSchema,
  IMessageConfigSchema,
} from "quantclaw/plugin-sdk/channel-config-schema";
import { iMessageChannelConfigUiHints } from "./config-ui-hints.js";

export const IMessageChannelConfigSchema = buildChannelConfigSchema(IMessageConfigSchema, {
  uiHints: iMessageChannelConfigUiHints,
});
