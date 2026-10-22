---
type: ImplementationReport
title: Quota recovery destinations and optional composed control
description: History landing, native delivery contracts, explicit recovery policy and verification for the quota-plus delivery change.
resource: .design/recovery/delivery0.gpt61s.md
status: implementation-in-progress
generated:
  by: model:openai/gpt-6.1-sol#high
  at: 2026-10-22
sources:
  - resource: opencode://ses_e9a28f3e7ffew6oW1GjFiTODAW
    title: Inspect history, fast-forward the clear revival tip and implement configurable reporting
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
