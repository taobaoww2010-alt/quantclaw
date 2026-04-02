import { resolveChannelGroupRequireMention } from "quantclaw/plugin-sdk/channel-policy";
import type { QuantClawConfig } from "quantclaw/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: QuantClawConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
