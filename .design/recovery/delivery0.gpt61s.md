---
type: ImplementationReport
title: Quota recovery destinations and optional composed control
description: History landing, native delivery contracts, explicit recovery policy and verification for the quota-plus delivery change.
resource: .design/recovery/delivery0.gpt61s.md
status: implemented-not-deployed-with-inherited-check-debt
generated:
  by: model:openai/gpt-6.1-sol#high
  at: 2026-10-22
sources:
  - resource: opencode://ses_e9a28f3e7ffew6oW1GjFiTODAW
    title: Inspect history, fast-forward the clear revival tip, implement and verify configurable reporting and optional composed control
  - resource: opencode://ses_e9a3a59cfffeI02GiTm8WeHazH
    title: Parent conveys operator authorization for history reconciliation, implementation and optional composed control, excluding deployment
  - resource: ../prorata/maintenance.md
    title: Prior regrouping and archived experiments explain divergent historical refs
  - resource: file:///home/rektide/ado/patches.md#ordered-agent-fallback
    title: Separate immediate ordered fallback from quota recovery and successful resumed progress
  - resource: file:///home/rektide/src/opencode-composed/packages/plugin/src/tui/composition.ts
    title: Optional client-local composition and host-owned standalone fallback
  - resource: file:///home/rektide/src/opencode-composed/plugins/composition/src/contract.ts
    title: Sidetoggle controls surface string identity and session input
  - resource: file:///home/rektide/src/opencode-composed/packages/schema/src/rpc.ts
    title: Portable JSON Schema RPC definitions require no new runtime dependency
  - resource: file:///home/rektide/src/opencode-composed/packages/client/src/promise/rpc.ts
    title: Native RPC methods, location routing and ephemeral event subscriptions
  - resource: file:///home/rektide/src/opencode-composed/packages/client/src/promise/generated/types.ts
    title: Native synthetic admission supports resume but no ignored/UI-only flag
---

# Quota recovery delivery

## History landing

The actual checkout is `/home/rektide/src/opencode-quota-plus`, an ordinary Git
repository, not a jj workspace or the retired `opencode-quota-finer` path. It
started clean on `plus` at `05bae1b4702eb2f1c0429d15c211c78e36026a01`.

All local branches and remote-tracking refs were inspected with `git show-ref`,
`git log --all --graph`, path history and tree diffs. There is one clear new
descendant: `origin/quota-retry-20260922` at
`28241bea7d555864121500bd441338d38e954fc2`, seven commits directly above `plus`:

1. `7561fe7` integration research;
2. `fca3327` export-file documentation demotion;
3. `cc77854` cached reset planner;
4. `cc8b2d5` native V2 server retry hook/export;
5. `2317b2e` canonical plugin identity;
6. `a4ac1f3` parent review of blocked children;
7. `28241be` root revival and combined parent/child notices.

Executed `git merge --ff-only origin/quota-retry-20260922`: `plus` now includes
all seven original commits, with no cherry-picking, rewritten history or merge
resolution. Remote-tracking refs were not moved; no fetch or push was needed.

Other refs are earlier layers (`finer`, `fine-grain`), fossils (`v1-adapter`,
`finer-snapshot`, `freshen-upstream`) or pre-regroup incarnations (`v2`,
`integration-20260830`, `tui-v2-footer-status`). The maintained
[round log](../prorata/maintenance.md#round-log) records their regrouping,
slot claims, V2 entrypoint/auth adaptation and preserved theme/visibility work.
`git cherry` alone marks several as unique because regrouping and upstream
adaptation changed patch boundaries; it is not evidence of missing capability.
Tree comparison confirms the live TUI retains the home/sidebar/prompt footer
claims, session metadata lookup, sectioned output and provider-ID adapter, then
adds newer precision and expandable errors. Retry path history has only the
five already-linear revival commits. No relevant fractured implementation was
found that requires merging an older tree over the clear tip.

## Delivery boundary

Recovery policy belongs to quota-plus, not Composed. Native synthetic messages
are model-visible; `resume: false` means admit-only, **not** human-only. Human
notices therefore use a native portable RPC event and TUI toast, never a
synthetic message with a misleading metadata flag. The optional TUI control
uses the existing `opencode.sidetoggle.controls.v1` surface; without a publisher
the host selects its ordinary sidebar-footer fallback, and without composition
capability it registers that fallback directly.

The new explicit destinations preserve `assistant` as the default and include
`human`, `both`, and `off`. The control offers session-local, activation-lifetime
overrides and an inherit state; it does not edit configuration files or activate
plugins. Delivery resolves current policy when the timer fires. Existing cached
evidence, root/parent grouping, fork pacing and process-lifetime scheduling stay
unchanged. No success/progress heuristic, agent switching or quota tracking for
agent-fallback is added.

## Tracking and authorization

Beads initially had five exported `opqup-*` tickets but no database. Authorized
`bd init --prefix opqup --from-jsonl --skip-agents --skip-hooks --non-interactive`
restored all five. Its own automatic commit `aba9b6a` only adds local-state ignore
rules to `.gitignore`; no AGENTS or hooks were generated. Confirmed database
prefix `opqup`, searched the restored tickets, then created
`opqup-recovery-smart-notice`. The export retains the earlier five rows verbatim.
That ticket distinguishes later-message activity, failed resumption, successful
progress and fallback completion; it is a future design, not implemented here.

No live plugin wiring, service commands, working-stack composition, deployment,
push or modification of the Composed checkout is authorized or performed.

## Implemented contract

Implementation commit: `55b0bc3` (`feat(recovery): route reset notices to assistant or human UI`).
The complete user contract is in
[configuration](../../docs/readme/configuration.md#choose-where-recovery-notices-go).

- `retryPacing.recoveryNotice`: `assistant` (unchanged resumptive default),
  `human` (toast, zero synthetic admission), `both`, or `off`. Disabling notices
  does not change the existing prompt failure/fork pacing policy. Existing
  `retryPacing.enabled` disables the entire pacing policy.
- Server RPC `opencode-quota.recovery.v1` exposes `state` and `set`, with native
  JSON Schema validation and `changed`/`notice` events. No runtime import or
  dependency on Composed, Sidetoggle, or an external host checkout is added.
- Overrides are per notification-recipient session **within the server-plugin
  activation**, not configuration edits. `inherit` deletes the override.
  Root/parent grouping remains owned by the original notifier. The notified
  parent's policy controls a child notice, not the child's override.
- The row cycles inherit/assistant/human/both/off; reads and writes route through
  native RPC to the viewed session's Location. It does not activate server
  plugins or enable disabled recovery. Each mount owns subscriptions and
  fences stale reads; pending writes coalesce repeated clicks. Routing through
  Composed and the ordinary fallback is tested to register only one control.
- Human UI events are ephemeral and require the quota-plus V2 TUI. They honor
  `enableToast`/`toastDurationMs`, cannot restart work, do not enter model context
  and are not replayed when no TUI is connected. In `both`, a failed UI emission
  does not replay an already-admitted AI message. Human-only never falls back to
  AI delivery. Hosts without RPC retain assistant delivery, but no UI control.
- The inherited timers and overrides remain process/activation-local. They do
  not migrate across plugin activations or Locations, persist across restart,
  or implement crash-safe scheduling. This change does not expand the original
  notifier's cross-Location ownership semantics. No smart-mode heuristic or
  agent-fallback quota inventory is present.

The README links to the new modes; two existing broken nearby configuration
anchors were repaired during the document pass. The original pacing paragraph
incorrectly said a Session interrupt cancels pending root/parent notices;
source inspection shows only notifier disposal clears its map. The revised
documentation distinguishes native fork interruption from recorded notice timers.

## Verification

All commands below ran from `/home/rektide/src/opencode-quota-plus`. No live
server was contacted. Full command wall times were not measured; test runner
times are supplementary only.

| Command | Result |
| --- | --- |
| `pnpm verify` | Stops in `check`: 16 inherited Biome errors; downstream checks run separately below. Ephemeral log `/tmp/opencode/quota-plus-recovery-verify.log`. |
| `pnpm exec biome check . --diagnostic-level=error --max-diagnostics=100` | Lists all 16 errors: formatting/import organization in inherited metadata/provider/format files and three optional-chain non-null assertions in `tests/tui-sidebar-sections.test.ts`. |
| `git diff --exit-code 28241bea -- <all 13 diagnostic paths>` | Pass; all files producing those 16 errors are byte-identical to the clear pre-task tip. None is a changed implementation/test file. |
| Scoped `biome check` on the ten owned TypeScript/test files | Pass (existing warning-level conventions remain); pre-commit hook also passes. |
| `pnpm run typecheck` | Pass after correcting the initial Solid signal declaration; the narrow local JSX bridge does not accept nullable composition callbacks, so the callback is registered only with a known RPC client. |
| `pnpm run build` | Pass; native TypeScript compilation and production Babel Solid transformation succeed. No installed plugin entry or live dist is repointed. |
| `pnpm test` | 197 files, **2,356 passed**, zero failed on both full runs. Final code (`55b0bc3`) log `/tmp/opencode/quota-plus-recovery-tests-final.log`, ephemeral; runner duration 6.59s. |
| Focused recovery/config/control/notifier/planner/registration tests | Six files, **66 passed**, zero failed. Includes absent-RPC host, four destinations, delivery-time policy changes, parent/child recipient policy, toast suppression, supplementary UI failure, override cycling, location filtering and teardown. |
| `pnpm run test:four-surfaces` | Two passed; these are also included in the full-suite count, not additional unique tests. |
| `pnpm run verify:typescript-version` | Pass; TS 7.0.2/plugin 1.18.1 pins verified; existing `bun-ffi-structs` TS peer warning remains. |
| `pnpm run verify:v4-history` | Pass; history/privacy verified (298 trees plus index at that run). |
| `pnpm run verify:package-contents` | Pass; 687 files, including 684 dist files. |
| Native portable descriptor check | Pass: scratch `pnpm exec tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --types node --skipLibCheck .test-agent/recovery/native-contract.ts` assigns the built descriptor to Composed's native `Rpc.PortableDefinition`. Initial scratch invocations required TS 7's `--ignoreConfig` and built declaration imports; no production file changed for the fixture. Composition contract was source-checked; the older built host payload lacks its composition declaration. |
| Rekon `check README.md docs/readme/configuration.md` and `check --okf .design/recovery/delivery0.gpt61s.md` | Pass after repairing the nearby links; native session provenance is recorded. |
| `git diff --check` | Pass. |

No live TUI/renderer test or deployed-host end-to-end exercise was performed.
The production render transform, control controller and actual plugin
registration/fallback paths are covered, but registration tests do not render
the terminal row. A requested followup reviewer could not spawn because this
child session is already at the harness's subagent-depth limit; independent
parent-side review remains available without changing that setting.

## Related work

- [Cached retry planner](../../src/lib/retry-pacing.ts): existing evidence and
  pacing ownership; untouched by this delivery change.
- [Stall notifier](../../src/lib/parent-quota-failures.ts): existing grouping,
  reset timers and delivery retry behavior; untouched.
- [Observed reset notifications](../../src/lib/quota-reset-notifications.ts):
  a different, inherited opt-in transition detector; untouched.
- [Export demotion and ocyc clock research](../ocyc-integration/ocyc-integration.glm53fx.md):
  preserved descendant-tip research, not a new recovery scheduler commitment.
- `opqup-recovery-smart-notice`: future evidence policy for successful progress
  and fallback completion; still open, not implemented.
