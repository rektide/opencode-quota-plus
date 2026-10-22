import type { RecoveryDestination } from "./types.js";

export const RECOVERY_DESTINATIONS = ["assistant", "human", "both", "off"] as const;
export type RecoveryOverride = RecoveryDestination | "inherit";

export function isRecoveryDestination(value: unknown): value is RecoveryDestination {
  return RECOVERY_DESTINATIONS.some((destination) => destination === value);
}

export interface RecoveryState {
  sessionID: string;
  enabled: boolean;
  destination: RecoveryDestination;
  override: RecoveryOverride;
}

export interface RecoveryNotice {
  sessionID: string;
  text: string;
  duration: number;
}

const sessionID = { type: "string", minLength: 1 } as const;
const destination = { type: "string", enum: RECOVERY_DESTINATIONS } as const;
const override = { type: "string", enum: ["inherit", ...RECOVERY_DESTINATIONS] } as const;
const state = {
  type: "object",
  properties: { sessionID, enabled: { type: "boolean" }, destination, override },
  required: ["sessionID", "enabled", "destination", "override"],
  additionalProperties: false,
} as const;

// Native portable RPC definition: plain JSON Schema needs no host runtime import
// (or dependency on the optional Composed publisher).
export const quotaRecoveryRpc = {
  id: "opencode-quota.recovery.v1",
  methods: {
    state: {
      input: {
        type: "object",
        properties: { sessionID },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: state,
    },
    set: {
      input: {
        type: "object",
        properties: { sessionID, override },
        required: ["sessionID", "override"],
        additionalProperties: false,
      },
      output: state,
    },
  },
  events: {
    changed: { schema: state },
    notice: {
      schema: {
        type: "object",
        properties: { sessionID, text: { type: "string" }, duration: { type: "number" } },
        required: ["sessionID", "text", "duration"],
        additionalProperties: false,
      },
    },
  },
} as const;

export interface RecoveryLocation {
  directory: string;
  workspaceID?: string;
}

export interface RecoveryRpcClient {
  state(
    input: { sessionID: string },
    options: { location: RecoveryLocation },
  ): Promise<RecoveryState>;
  set(
    input: { sessionID: string; override: RecoveryOverride },
    options: { location: RecoveryLocation },
  ): Promise<RecoveryState>;
  events: {
    on(
      name: "changed",
      handler: (event: { location: RecoveryLocation; data: RecoveryState }) => void,
    ): () => void;
    on(
      name: "notice",
      handler: (event: { location: RecoveryLocation; data: RecoveryNotice }) => void,
    ): () => void;
  };
}

export interface RecoveryRpcRegistration {
  dispose(): Promise<void>;
  events: {
    emit(name: "changed", data: RecoveryState): Promise<void>;
    emit(name: "notice", data: RecoveryNotice): Promise<void>;
  };
}

export interface RecoveryRpcServer {
  register(
    definition: typeof quotaRecoveryRpc,
    handlers: {
      state(input: { sessionID: string }): Promise<RecoveryState>;
      set(input: { sessionID: string; override: RecoveryOverride }): Promise<RecoveryState>;
    },
  ): Promise<RecoveryRpcRegistration>;
}

// Sidetoggle's cooperative Surface<ControlInput> contract uses string identity,
// not module identity. No runtime import of opencode-sidetoggle is required.
export const quotaRecoveryControls = { id: "opencode.sidetoggle.controls.v1" } as const;
