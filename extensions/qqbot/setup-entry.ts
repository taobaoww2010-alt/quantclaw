import { defineSetupPluginEntry } from "quantclaw/plugin-sdk/core";
import { qqbotSetupPlugin } from "./src/channel.setup.js";

export { qqbotSetupPlugin } from "./src/channel.setup.js";

export default defineSetupPluginEntry(qqbotSetupPlugin);
