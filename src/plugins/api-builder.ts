import type { QuantClawConfig } from "../config/config.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { QuantClawPluginApi, PluginLogger } from "./types.js";

export type BuildPluginApiParams = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: QuantClawPluginApi["registrationMode"];
  config: QuantClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  handlers?: Partial<
    Pick<
      QuantClawPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerCli"
      | "registerService"
      | "registerCliBackend"
      | "registerProvider"
      | "registerSpeechProvider"
      | "registerMediaUnderstandingProvider"
      | "registerImageGenerationProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerMemoryPromptSection"
      | "registerMemoryFlushPlan"
      | "registerMemoryRuntime"
      | "registerMemoryEmbeddingProvider"
      | "on"
    >
  >;
};

const noopRegisterTool: QuantClawPluginApi["registerTool"] = () => {};
const noopRegisterHook: QuantClawPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: QuantClawPluginApi["registerHttpRoute"] = () => {};
const noopRegisterChannel: QuantClawPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: QuantClawPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterCli: QuantClawPluginApi["registerCli"] = () => {};
const noopRegisterService: QuantClawPluginApi["registerService"] = () => {};
const noopRegisterCliBackend: QuantClawPluginApi["registerCliBackend"] = () => {};
const noopRegisterProvider: QuantClawPluginApi["registerProvider"] = () => {};
const noopRegisterSpeechProvider: QuantClawPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterMediaUnderstandingProvider: QuantClawPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: QuantClawPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterWebSearchProvider: QuantClawPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: QuantClawPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: QuantClawPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: QuantClawPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: QuantClawPluginApi["registerContextEngine"] = () => {};
const noopRegisterMemoryPromptSection: QuantClawPluginApi["registerMemoryPromptSection"] = () => {};
const noopRegisterMemoryFlushPlan: QuantClawPluginApi["registerMemoryFlushPlan"] = () => {};
const noopRegisterMemoryRuntime: QuantClawPluginApi["registerMemoryRuntime"] = () => {};
const noopRegisterMemoryEmbeddingProvider: QuantClawPluginApi["registerMemoryEmbeddingProvider"] =
  () => {};
const noopOn: QuantClawPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): QuantClawPluginApi {
  const handlers = params.handlers ?? {};
  return {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerCli: handlers.registerCli ?? noopRegisterCli,
    registerService: handlers.registerService ?? noopRegisterService,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerMemoryPromptSection:
      handlers.registerMemoryPromptSection ?? noopRegisterMemoryPromptSection,
    registerMemoryFlushPlan: handlers.registerMemoryFlushPlan ?? noopRegisterMemoryFlushPlan,
    registerMemoryRuntime: handlers.registerMemoryRuntime ?? noopRegisterMemoryRuntime,
    registerMemoryEmbeddingProvider:
      handlers.registerMemoryEmbeddingProvider ?? noopRegisterMemoryEmbeddingProvider,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
}
