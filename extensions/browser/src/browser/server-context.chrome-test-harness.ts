import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/quantclaw" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchQuantClawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveQuantClawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopQuantClawChrome: vi.fn(async () => {}),
}));
