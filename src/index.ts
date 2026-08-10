/**
 * OpenCode Quota Plugin
 *
 * Shows quota status in OpenCode without LLM invocation.
 *
 * @packageDocumentation
 */

import { QuotaToastPlugin } from "./plugin.js";

type V1PluginModule = {
  id: string;
  server: typeof QuotaToastPlugin;
  setup: () => void;
};

const pluginModule = {
  id: "@slkiser/opencode-quota",
  server: QuotaToastPlugin,
  // V2 loads shared V1 server configuration but uses the native TUI adapter.
  setup() {},
} satisfies V1PluginModule;

export default pluginModule;

export type {
  JsonV1Adapter,
  JsonV1Mapping,
  JsonV1Metric,
  JsonV1NumberSource,
  JsonV1Path,
  JsonV1TextSource,
  JsonV1TimestampEncoding,
  JsonV1TimestampSource,
  LocalEstimateQuotaProviderDefinition,
  LocalEstimateWindow,
  QuotaProviderDefinition,
  QuotaProviderRemoteFormat,
  RemoteApiQuotaProviderDefinition,
} from "./lib/quota-providers.js";

export {
  QUOTA_PROVIDER_MODES,
  QUOTA_PROVIDER_REMOTE_FORMATS,
  QUOTA_PROVIDER_WINDOW_TYPES,
  validateQuotaProviders,
} from "./lib/quota-providers.js";
export type {
  CopilotEnterpriseUsageResult,
  CopilotOrganizationUsageResult,
  CopilotQuotaResult,
  GoogleModelId,
  GoogleModelQuota,
  GoogleQuotaResult,
  MaintainerAnnouncementsConfig,
  MiniMaxResult,
  PricingSnapshotSource,
  QuotaToastConfig,
  SessionTokenScope,
} from "./lib/types.js";
export { QuotaToastPlugin } from "./plugin.js";
