export const QUANTCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
export const OPENCLAW_CLI_ENV_VALUE = "1";

export function markOpenClawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [QUANTCLAW_CLI_ENV_VAR]: OPENCLAW_CLI_ENV_VALUE,
  };
}

export function ensureOpenClawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[QUANTCLAW_CLI_ENV_VAR] = OPENCLAW_CLI_ENV_VALUE;
  return env;
}
