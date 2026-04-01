import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          OPENCLAW_STATE_DIR: "/tmp/quantclaw-state",
          OPENCLAW_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "quantclaw-gateway",
        windowsTaskName: "☯️ QuantClaw Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/quantclaw-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/quantclaw-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "quantclaw-gateway",
        windowsTaskName: "☯️ QuantClaw Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u openclaw-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "quantclaw-gateway",
        windowsTaskName: "☯️ QuantClaw Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "☯️ QuantClaw Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "quantclaw gateway install",
        startCommand: "quantclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.openclaw.gateway.plist",
        systemdServiceName: "quantclaw-gateway",
        windowsTaskName: "☯️ QuantClaw Gateway",
      }),
    ).toEqual([
      "quantclaw gateway install",
      "quantclaw gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.openclaw.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "quantclaw gateway install",
        startCommand: "quantclaw gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.openclaw.gateway.plist",
        systemdServiceName: "quantclaw-gateway",
        windowsTaskName: "☯️ QuantClaw Gateway",
      }),
    ).toEqual([
      "quantclaw gateway install",
      "quantclaw gateway",
      "systemctl --user start openclaw-gateway.service",
    ]);
  });
});
