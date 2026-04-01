import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "quantclaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "quantclaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "quantclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "quantclaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "quantclaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "quantclaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "quantclaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "quantclaw", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "quantclaw", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "quantclaw", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "quantclaw", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "quantclaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "quantclaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "quantclaw", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "quantclaw", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "quantclaw", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".openclaw-dev");
    expect(env.OPENCLAW_PROFILE).toBe("dev");
    expect(env.OPENCLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.OPENCLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "quantclaw.json"));
    expect(env.OPENCLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      OPENCLAW_STATE_DIR: "/custom",
      OPENCLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.OPENCLAW_STATE_DIR).toBe("/custom");
    expect(env.OPENCLAW_GATEWAY_PORT).toBe("19099");
    expect(env.OPENCLAW_CONFIG_PATH).toBe(path.join("/custom", "quantclaw.json"));
  });

  it("uses OPENCLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      OPENCLAW_HOME: "/srv/openclaw-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/openclaw-home");
    expect(env.OPENCLAW_STATE_DIR).toBe(path.join(resolvedHome, ".openclaw-work"));
    expect(env.OPENCLAW_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".openclaw-work", "quantclaw.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "quantclaw doctor --fix",
      env: {},
      expected: "quantclaw doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "quantclaw doctor --fix",
      env: { OPENCLAW_PROFILE: "default" },
      expected: "quantclaw doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "quantclaw doctor --fix",
      env: { OPENCLAW_PROFILE: "Default" },
      expected: "quantclaw doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "quantclaw doctor --fix",
      env: { OPENCLAW_PROFILE: "bad profile" },
      expected: "quantclaw doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "quantclaw --profile work doctor --fix",
      env: { OPENCLAW_PROFILE: "work" },
      expected: "quantclaw --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "quantclaw --dev doctor",
      env: { OPENCLAW_PROFILE: "dev" },
      expected: "quantclaw --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("quantclaw doctor --fix", { OPENCLAW_PROFILE: "work" })).toBe(
      "quantclaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("quantclaw doctor --fix", { OPENCLAW_PROFILE: "  jbopenclaw  " })).toBe(
      "quantclaw --profile jbopenclaw doctor --fix",
    );
  });

  it("handles command with no args after openclaw", () => {
    expect(formatCliCommand("quantclaw", { OPENCLAW_PROFILE: "test" })).toBe(
      "quantclaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm openclaw doctor", { OPENCLAW_PROFILE: "work" })).toBe(
      "pnpm openclaw --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("quantclaw gateway status --deep", { OPENCLAW_CONTAINER_HINT: "demo" }),
    ).toBe("quantclaw --container demo gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("quantclaw doctor", {
        OPENCLAW_CONTAINER_HINT: "demo",
        OPENCLAW_PROFILE: "work",
      }),
    ).toBe("quantclaw --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("quantclaw update", { OPENCLAW_CONTAINER_HINT: "demo" })).toBe(
      "quantclaw update",
    );
    expect(
      formatCliCommand("pnpm openclaw update --channel beta", { OPENCLAW_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm openclaw update --channel beta");
  });
});
