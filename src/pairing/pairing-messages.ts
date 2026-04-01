import { formatCliCommand } from "../cli/command-format.js";
import type { PairingChannel } from "./pairing-store.js";

export function buildPairingReply(params: {
  channel: PairingChannel;
  idLine: string;
  code: string;
}): string {
  const { channel, idLine, code } = params;
  const approveCommand = formatCliCommand(`quantclaw pairing approve ${channel} ${code}`);
  return [
    "☯️ QuantClaw: 访问权限未配置。",
    "",
    idLine,
    "配对码：",
    "```",
    code,
    "```",
    "",
    "请让机器人所有者通过以下命令审批：",
    formatCliCommand(`quantclaw pairing approve ${channel} ${code}`),
    "```",
    approveCommand,
    "```",
  ].join("\n");
}
