import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "quantclaw/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("quantclaw/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
