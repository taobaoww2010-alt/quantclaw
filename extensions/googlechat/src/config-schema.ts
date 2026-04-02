import {
  buildChannelConfigSchema,
  GoogleChatConfigSchema,
} from "quantclaw/plugin-sdk/channel-config-schema";

export const GoogleChatChannelConfigSchema = buildChannelConfigSchema(GoogleChatConfigSchema);
