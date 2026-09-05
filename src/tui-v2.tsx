/** @jsxImportSource @opentui/solid */

import { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, onCleanup, Show } from "solid-js";
import { sanitizeDisplayText } from "./lib/display-sanitize.js";
import { formatQuotaRows } from "./lib/format.js";
import { formatResetCountdown } from "./lib/format-utils.js";
import {
  buildQuotaDialogCommandOutput,
  QUOTA_DIALOG_COMMANDS,
  type QuotaDialogCommandId,
} from "./lib/quota-dialog-commands.js";
import { resolveQuotaFormatStyle } from "./lib/quota-format-style.js";
import { collectQuotaRenderData, type QuotaRenderData } from "./lib/quota-render-data.js";
import {
  createQuotaRuntimeRequestContext,
  type QuotaSessionModelContext,
  resolveQuotaRuntimeContext,
} from "./lib/quota-runtime-context.js";
import { resolveThemeColor } from "./lib/theme-colors.js";
import { buildCompactQuotaStatusLine } from "./lib/tui-compact-format.js";
import { buildSidebarQuotaPanelLines } from "./lib/tui-sidebar-format.js";
import {
  buildSidebarQuotaSections,
  flattenSidebarQuotaSections,
  type SidebarQuotaSection,
} from "./lib/tui-sidebar-sections.js";
import { createTuiV2QuotaClient } from "./lib/tui-v2-client.js";
import type { QuotaToastConfig } from "./lib/types.js";

const terminalForeground = RGBA.defaultForeground();

type TuiEvent = { data?: Record<string, unknown> };
type Toast = {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  duration?: number;
};
type PromptFooterInput = { sessionID?: string; mode: "normal" | "shell" };

type SlotMap = {
  app: Record<string, never>;
  "home.footer": Record<string, never>;
  "prompt.footer": PromptFooterInput;
  "prompt.footer.status": PromptFooterInput;
  "prompt.footer.file": PromptFooterInput;
  "session.composer.top": { sessionID: string };
  "sidebar.content": { sessionID: string };
  "sidebar.footer": { sessionID: string };
};
type SlotPath = keyof SlotMap;

type SlotClaim<Path extends SlotPath = SlotPath> = Path extends SlotPath
  ? { render: (input: SlotMap[Path]) => JSX.Element | null } & (
      | { prepend: Path; append?: never; before?: never; after?: never; replace?: never }
      | { append: Path; prepend?: never; before?: never; after?: never; replace?: never }
      | { before: Path; prepend?: never; append?: never; after?: never; replace?: never }
      | { after: Path; prepend?: never; append?: never; before?: never; replace?: never }
      | { replace: Path; prepend?: never; append?: never; before?: never; after?: never }
    )
  : never;

type TuiContext = {
  client: unknown;
  options?: Record<string, unknown>;
  theme?: {
    /** Host theme tokens, addressed dynamically (text, textMuted, success, ...). */
    current?: Readonly<Record<string, RGBA | undefined>>;
  };
  data: {
    on: (event: string, handler: (event: TuiEvent) => void) => () => void;
    session: {
      get: (sessionID: string) => { model?: { id?: string; providerID?: string } } | undefined;
    };
  };
  keymap: {
    layer: (
      build: () => {
        mode: "global";
        commands: Array<{
          id: string;
          title: string;
          group: string;
          palette: true;
          slash: { name: string };
          run: (input?: unknown) => void;
        }>;
      },
    ) => void;
  };
  ui: {
    slot: (claim: SlotClaim) => () => void;
    toast: { show: (toast: Toast) => void };
    dialog: {
      alert: (params: { title: string; message: string }) => Promise<unknown>;
      prompt: (params: { title: string; placeholder?: string }) => Promise<string | undefined>;
      set: (params: { size: "medium" | "large" | "xlarge" }) => void;
    };
  };
};

function getSessionID(event: TuiEvent): string | undefined {
  const sessionID = event.data?.sessionID;
  return typeof sessionID === "string" && sessionID ? sessionID : undefined;
}

/**
 * Wraps the host client so runtime provider ids resolve across OpenCode TUI
 * host versions (v2 `provider.list()`, legacy `config.providers()`, or the
 * file-based CLI resolution). Keeps quota providers that gate on the runtime
 * provider list reporting even when one host surface is missing or fails.
 */
function getQuotaClient(context: TuiContext) {
  return createTuiV2QuotaClient(context.client, {
    roots: { fallbackDirectory: process.cwd() },
  });
}

function getSessionModelMeta(
  context: TuiContext,
  sessionID: string,
): Promise<QuotaSessionModelContext> {
  const stateModel = context.data.session.get?.(sessionID)?.model;
  if (stateModel?.id || stateModel?.providerID) {
    return Promise.resolve({
      modelID: stateModel.id,
      providerID: stateModel.providerID,
    });
  }
  return getSessionModelMetaFromClient(context.client, sessionID);
}

async function getSessionModelMetaFromClient(
  client: unknown,
  sessionID: string,
): Promise<QuotaSessionModelContext> {
  const session = (
    client as { session?: { get?: (input: { sessionID: string }) => Promise<{ data?: unknown }> } }
  ).session;
  const response = await session?.get?.({ sessionID });
  const model = (response?.data as { model?: { id?: string; providerID?: string } } | undefined)
    ?.model;
  return model ? { modelID: model.id, providerID: model.providerID } : {};
}

async function collectQuotaForSession(
  context: TuiContext,
  sessionID: string | undefined,
): Promise<{
  config: QuotaToastConfig;
  data: QuotaRenderData | undefined;
  activeProviderCount: number;
  formatStyle: ReturnType<typeof resolveQuotaFormatStyle>;
}> {
  const runtime = await resolveQuotaRuntimeContext({
    client: getQuotaClient(context),
    roots: { fallbackDirectory: process.cwd() },
    sessionID,
    resolveSessionMeta: (id) => getSessionModelMeta(context, id),
    includeSessionMeta: (config) => config.onlyCurrentModel,
    pluginOptions: context.options,
  });
  const config = runtime.config;
  const formatStyle = resolveQuotaFormatStyle(config.formatStyle);
  const result = await collectQuotaRenderData({
    client: runtime.client,
    resolveRuntimeProviderIds: runtime.resolveRuntimeProviderIds,
    config,
    configMeta: runtime.configMeta,
    request: createQuotaRuntimeRequestContext(runtime),
    surfaceExplicitProviderIssues: true,
    formatStyle,
    providers: runtime.providers,
  });
  return {
    config,
    data: result.data ?? undefined,
    activeProviderCount: result.active.length,
    formatStyle,
  };
}

async function getQuotaMessage(
  context: TuiContext,
  sessionID: string,
  surface: "sidebar" | "idle" | "compacted" | "question",
): Promise<{ message: string; duration: number; activeProviderCount: number } | undefined> {
  const { config, data, activeProviderCount, formatStyle } = await collectQuotaForSession(
    context,
    sessionID,
  );
  if (!config.enabled) return;
  if (surface === "sidebar") {
    if (!config.tuiSidebarPanel.enabled) return;
  } else if (!config.enableToast) {
    return;
  }
  if (
    (surface === "idle" && !config.showOnIdle) ||
    (surface === "compacted" && !config.showOnCompact) ||
    (surface === "question" && !config.showOnQuestion)
  ) {
    return;
  }
  const message =
    surface === "sidebar"
      ? data
        ? buildSidebarQuotaPanelLines({
            data,
            config: {
              ...config,
              formatStyle: config.tuiSidebarPanel.formatStyle
                ? resolveQuotaFormatStyle(config.tuiSidebarPanel.formatStyle)
                : formatStyle,
            },
          }).join("\n")
        : undefined
      : data?.entries.length || data?.sessionTokens
        ? formatQuotaRows({
            version: "2.0.0",
            layout: config.layout,
            entries: data?.entries ?? [],
            errors: data?.errors ?? [],
            style: resolveQuotaFormatStyle(config.formatStyle),
            percentDisplayMode: config.percentDisplayMode,
            resetTimeDecimals: config.resetTimeDecimals,
            barTheme: config.barTheme,
            sessionTokens: data?.sessionTokens,
          })
        : config.showOnBothFail && data?.errors.length
          ? data.errors.map((error) => `${error.label}: ${error.message}`).join("\n")
          : undefined;
  return message
    ? {
        message: sanitizeDisplayText(message),
        duration: config.toastDurationMs,
        activeProviderCount,
      }
    : undefined;
}

async function getQuotaStatusLine(
  context: TuiContext,
  sessionID: string,
): Promise<string | undefined> {
  const { config, data } = await collectQuotaForSession(context, sessionID);
  const compact = config.tuiCompactStatus;
  if (!config.enabled || !compact.enabled || !compact.sessionPrompt) return;
  if (!data) return;
  const text = buildCompactQuotaStatusLine({
    data,
    percentDisplayMode: config.percentDisplayMode,
    percentDecimals: config.percentDecimals,
    maxWidth: compact.maxWidth,
  });
  return text.trim() ? sanitizeDisplayText(text) : undefined;
}

async function getSidebarFooterLine(
  context: TuiContext,
  sessionID: string,
): Promise<string | undefined> {
  const { config, data, activeProviderCount } = await collectQuotaForSession(context, sessionID);
  if (!config.enabled || !config.tuiSidebarPanel.enabled || !config.tuiSidebarPanel.footerLine)
    return;
  if (!data) return;
  const soonestReset = data.entries
    .map((entry) => entry.resetTimeIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((time) => Number.isFinite(time) && time > Date.now())
    .sort((a, b) => a - b)[0];
  const reset = soonestReset
    ? formatResetCountdown(new Date(soonestReset).toISOString(), {
        compactRounded: true,
        decimals: config.resetTimeDecimals,
      })
    : undefined;
  const line = reset
    ? `Quota · ${activeProviderCount} active · reset ${reset}`
    : `Quota · ${activeProviderCount} active`;
  return sanitizeDisplayText(line);
}

async function getHomeFooterLine(context: TuiContext): Promise<string | undefined> {
  const { config, data } = await collectQuotaForSession(context, undefined);
  const compact = config.tuiCompactStatus;
  if (!config.enabled || !compact.enabled || !compact.homeBottom) return;
  if (!data) return;
  const text = buildCompactQuotaStatusLine({
    data,
    percentDisplayMode: config.percentDisplayMode,
    percentDecimals: config.percentDecimals,
    maxWidth: compact.maxWidth,
  });
  return text.trim() ? sanitizeDisplayText(text) : undefined;
}

function reportFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[opencode-quota] failed to load quota: ${message}`);
}

function getCommandArguments(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  for (const key of ["arguments", "args", "query"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

async function runQuotaCommand(
  context: TuiContext,
  command: QuotaDialogCommandId,
  sessionID: string | undefined,
  input?: unknown,
): Promise<void> {
  const spec = QUOTA_DIALOG_COMMANDS.find((item) => item.id === command)!;
  let argumentsText = getCommandArguments(input);
  if (spec.acceptsArguments && argumentsText === undefined) {
    const value = await context.ui.dialog.prompt({
      title: spec.title,
      placeholder: command === "tokens_between" ? "YYYY-MM-DD YYYY-MM-DD" : "Optional arguments",
    });
    if (value === undefined) return;
    argumentsText = value.trim() || undefined;
  }

  try {
    const result = await buildQuotaDialogCommandOutput({
      command,
      arguments: argumentsText,
      client: getQuotaClient(context),
      roots: { fallbackDirectory: process.cwd() },
      sessionID,
      resolveSessionMeta: (id) => getSessionModelMeta(context, id),
      pluginOptions: context.options,
    });
    if (result.state === "noop") return;
    const alert = context.ui.dialog.alert({ title: result.title, message: result.output });
    context.ui.dialog.set({ size: result.dialogSize });
    await alert;
  } catch (error) {
    context.ui.toast.show({
      variant: "error",
      title: "OpenCode Quota",
      message: sanitizeDisplayText(error instanceof Error ? error.message : String(error)),
    });
  }
}

function registerQuotaCommands(context: TuiContext, getSessionID: () => string | undefined): void {
  context.keymap.layer(() => ({
    mode: "global",
    commands: QUOTA_DIALOG_COMMANDS.map((spec) => ({
      id: `quota.${spec.id}`,
      title: spec.title,
      group: "OpenCode Quota",
      palette: true,
      slash: { name: spec.slashName },
      run: (input?: unknown) => void runQuotaCommand(context, spec.id, getSessionID(), input),
    })),
  }));
}

async function getSidebarQuotaSections(
  context: TuiContext,
  sessionID: string,
): Promise<
  | {
      sections: SidebarQuotaSection[];
      activeProviderCount: number;
    }
  | undefined
> {
  const { config, data, activeProviderCount } = await collectQuotaForSession(context, sessionID);
  if (!config.enabled || !config.tuiSidebarPanel.enabled) return;
  if (!data) return;
  const sidebarStyle = config.tuiSidebarPanel.formatStyle
    ? resolveQuotaFormatStyle(config.tuiSidebarPanel.formatStyle)
    : resolveQuotaFormatStyle(config.formatStyle);
  return {
    sections: buildSidebarQuotaSections({
      data,
      config: {
        formatStyle: sidebarStyle,
        percentDisplayMode: config.percentDisplayMode,
        resetTimeDecimals: config.resetTimeDecimals,
        showProRataIndicator: config.showProRataIndicator,
        barTheme: config.barTheme,
      },
    }),
    activeProviderCount,
  };
}

function SidebarQuotaView(props: {
  context: TuiContext;
  sessionID: string;
  setActiveSessionID: (sessionID: string) => void;
}): JSX.Element {
  props.setActiveSessionID(props.sessionID);
  const [open, setOpen] = createSignal(true);
  const [quota, setQuota] = createSignal<
    { sections: SidebarQuotaSection[]; activeProviderCount: number } | undefined
  >(undefined);
  // Quiet rows must never degrade to the bright default: resolve the host
  // muted token, and fall back to a neutral gray when the host theme is
  // unavailable (e.g. local host builds without theme context).
  const mutedFallback = RGBA.fromValues(128, 128, 128);
  const quietForeground = () =>
    resolveThemeColor("quiet", props.context.theme?.current, (t) =>
      RGBA.fromValues(t[0], t[1], t[2]),
    ) ?? mutedFallback;
  // Color layer resolution: quiet flags dim via the host's muted token; theme
  // colors resolve host-token-first, then CSS names / hex literals.
  const lineForeground = (line: { quiet: boolean; color?: string }): RGBA =>
    line.quiet
      ? (resolveThemeColor("quiet", props.context.theme?.current, (t) =>
          RGBA.fromValues(t[0], t[1], t[2]),
        ) ?? quietForeground())
      : line.color
        ? (resolveThemeColor(line.color, props.context.theme?.current, (t) =>
            RGBA.fromValues(t[0], t[1], t[2]),
          ) ?? terminalForeground)
        : terminalForeground;
  // Expandable error rows: clicking a bounded error line reveals its
  // detail lines (untruncated message, compact JSON on its own line).
  const [expandedErrors, setExpandedErrors] = createSignal<Set<string>>(new Set());
  const toggleErrorDetail = (key: string) => {
    setExpandedErrors((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // Flattened lines carry the blank separators between providers, error
  // rows, and session tokens, keeping the sectioned render structurally
  // identical to the pre-sectioned panel output.
  const flatLines = () => flattenSidebarQuotaSections(quota()?.sections ?? []);
  const expandable = () => flatLines().length > 2;
  const refresh = () => {
    void getSidebarQuotaSections(props.context, props.sessionID)
      .then((result) => setQuota(result))
      .catch(reportFailure);
  };
  refresh();
  const unsubscribe = props.context.data.on("session.step.ended", (event) => {
    if (getSessionID(event) === props.sessionID) refresh();
  });
  onCleanup(unsubscribe);

  return (
    <box flexDirection="column">
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => expandable() && setOpen((value) => !value)}
      >
        <Show when={expandable()}>
          <text fg={terminalForeground}>{open() ? "▼" : "▶"}</text>
        </Show>
        <text fg={terminalForeground}>
          <b>Quota</b>
          <Show when={expandable() && !open() && quota()?.activeProviderCount}>
            {(count: () => number) => ` (${count()} active)`}
          </Show>
        </text>
      </box>
      <Show when={quota()} fallback={<text fg={terminalForeground}>No quota data available</text>}>
        {(state: () => NonNullable<ReturnType<typeof quota>>) => (
          <Show when={!expandable() || open()}>
            {flattenSidebarQuotaSections(state().sections).flatMap((entry) => [
              <text
                fg={lineForeground(entry)}
                wrapMode="none"
                onMouseDown={
                  entry.toggleKey ? () => toggleErrorDetail(entry.toggleKey!) : undefined
                }
              >
                {entry.line || " "}
              </text>,
              ...(entry.toggleKey && expandedErrors().has(entry.toggleKey)
                ? (entry.detailLines?.map((line) => (
                    <text fg={quietForeground()} wrapMode="none">
                      {`  ${line}` || " "}
                    </text>
                  )) ?? [])
                : []),
            ])}
          </Show>
        )}
      </Show>
    </box>
  );
}

function StatusQuotaView(props: { context: TuiContext; sessionID: string }): JSX.Element | null {
  const [text, setText] = createSignal<string | undefined>(undefined);
  const refresh = () => {
    void getQuotaStatusLine(props.context, props.sessionID)
      .then((line) => setText(line))
      .catch(reportFailure);
  };
  refresh();
  const unsubscribe = props.context.data.on("session.step.ended", (event) => {
    if (getSessionID(event) === props.sessionID) refresh();
  });
  onCleanup(unsubscribe);
  return (
    <Show when={text()}>
      {(line: () => string) => (
        <text fg={terminalForeground} wrapMode="none">
          {line()}
        </text>
      )}
    </Show>
  );
}

function SidebarFooterQuotaView(props: {
  context: TuiContext;
  sessionID: string;
}): JSX.Element | null {
  const [text, setText] = createSignal<string | undefined>(undefined);
  const refresh = () => {
    void getSidebarFooterLine(props.context, props.sessionID)
      .then((line) => setText(line))
      .catch(reportFailure);
  };
  refresh();
  const unsubscribe = props.context.data.on("session.step.ended", (event) => {
    if (getSessionID(event) === props.sessionID) refresh();
  });
  onCleanup(unsubscribe);
  return (
    <Show when={text()}>
      {(line: () => string) => (
        <text fg={terminalForeground} wrapMode="none">
          {line()}
        </text>
      )}
    </Show>
  );
}

function HomeFooterQuotaView(props: { context: TuiContext }): JSX.Element | null {
  const [text, setText] = createSignal<string | undefined>(undefined);
  const refresh = () => {
    void getHomeFooterLine(props.context)
      .then((line) => setText(line))
      .catch(reportFailure);
  };
  refresh();
  const unsubscribe = props.context.data.on("session.step.ended", () => refresh());
  onCleanup(unsubscribe);
  return (
    <Show when={text()}>
      {(line: () => string) => (
        <text fg={terminalForeground} wrapMode="none">
          {line()}
        </text>
      )}
    </Show>
  );
}

const plugin = {
  id: "@slkiser/opencode-quota",
  setup(context: TuiContext) {
    let disposeEvents: (() => void) | undefined;
    let activeSessionID: string | undefined;
    const questionToolCalls = new Set<string>();
    const disposeApp = context.ui.slot({
      append: "app",
      render: () => {
        if (disposeEvents) return null;
        registerQuotaCommands(context, () => activeSessionID);
        const trigger = (event: TuiEvent, reason: "idle" | "compacted" | "question") => {
          const sessionID = getSessionID(event);
          if (!sessionID) return;
          activeSessionID = sessionID;
          void getQuotaMessage(context, sessionID, reason)
            .then((quota) => {
              if (!quota) return;
              context.ui.toast.show({
                variant: "info",
                title: "OpenCode Quota",
                message: quota.message,
                duration: quota.duration,
              });
            })
            .catch(reportFailure);
        };
        const onStepEnded = context.data.on("session.step.ended", (event) =>
          trigger(event, "idle"),
        );
        const onCompacted = context.data.on("session.compaction.ended", (event) =>
          trigger(event, "compacted"),
        );
        const onQuestionStarted = context.data.on("session.tool.input.started", (event) => {
          const id = event.data?.id;
          if (event.data?.name === "question" && typeof id === "string") {
            questionToolCalls.add(id);
          }
        });
        const onQuestionSucceeded = context.data.on("session.tool.success", (event) => {
          const id = event.data?.id;
          if (typeof id === "string" && questionToolCalls.delete(id)) trigger(event, "question");
        });
        const onQuestionFailed = context.data.on("session.tool.failed", (event) => {
          const id = event.data?.id;
          if (typeof id === "string") questionToolCalls.delete(id);
        });
        disposeEvents = () => {
          onStepEnded();
          onCompacted();
          onQuestionStarted();
          onQuestionSucceeded();
          onQuestionFailed();
          questionToolCalls.clear();
        };
        return null;
      },
    });
    const disposeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props) => (
        <SidebarQuotaView
          context={context}
          sessionID={props.sessionID}
          setActiveSessionID={(sessionID) => {
            activeSessionID = sessionID;
          }}
        />
      ),
    });
    const disposeStatus = context.ui.slot({
      append: "prompt.footer.status",
      render: (props) =>
        props.sessionID ? <StatusQuotaView context={context} sessionID={props.sessionID} /> : null,
    });
    const disposeSidebarFooter = context.ui.slot({
      append: "sidebar.footer",
      render: (props) => <SidebarFooterQuotaView context={context} sessionID={props.sessionID} />,
    });
    const disposeHomeFooter = context.ui.slot({
      append: "home.footer",
      render: () => <HomeFooterQuotaView context={context} />,
    });
    return () => {
      disposeEvents?.();
      disposeApp();
      disposeSidebar();
      disposeStatus();
      disposeSidebarFooter();
      disposeHomeFooter();
    };
  },
};

export default plugin;
