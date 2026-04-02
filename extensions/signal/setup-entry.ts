import { defineSetupPluginEntry } from "quantclaw/plugin-sdk/core";
import { signalSetupPlugin } from "./src/channel.setup.js";

export { signalSetupPlugin } from "./src/channel.setup.js";

export default defineSetupPluginEntry(signalSetupPlugin);
