---
type: Research
title: "opencode-quota-plus as ocyc's clock — architecture, the July-stale export, and the ocyc integration line"
description: Research pass for ocyc's scheduling/jobs line — how this toolkit records quotas, why the persisted export froze at 2026-07-21 on this host, what ocyc's `quota next` / `fleet arm` / jobs-history line actually consumes today, and the minimal changes (mapped to owners) that would make the clock load-bearing-safe.
resource: /home/rektide/src/opencode-quota-finer/.design/ocyc-integration/ocyc-integration.glm53fx.md
tags: [opencode-quota-plus, ocyc, quota, export, freshness, staleness, cli, integration, research]
status: draft
generated: { by: "model:glm-5.3-flash-max (zai-coding-plan/glm-5.3-flash#max research subagent, FX)", at: 2026-09-20 }
stale_after: 2026-12-20
sources:
  - id: export-pipeline
    resource: /home/rektide/src/opencode-quota-finer/src/lib/quota-export.ts
    title: "buildQuotaExport / writeQuotaExport / resolveExportPath — the export document builder (cache-only by construction)"
  - id: export-writer
    resource: /home/rektide/src/opencode-quota-finer/src/lib/tui-runtime.ts
    title: "writeTuiQuotaExportIfEnabled (lines 802–824) — the ONLY export writer, gated on config"
  - id: tui-loop
    resource: /home/rektide/src/opencode-quota-finer/src/tui.tsx
    title: "createHomeBottomResource afterApply (lines 276–281) + REFRESH_INTERVAL_MS = 60_000 (line 57)"
  - id: config-schema
    resource: /home/rektide/src/opencode-quota-finer/src/lib/types.ts
    title: "QuotaExportConfig (72–82), DEFAULT_CONFIG.export (323–326), minIntervalMs default 5 min (273)"
  - id: cli-show
    resource: /home/rektide/src/opencode-quota-finer/src/lib/cli-show.ts
    title: "show --json = in-memory rebuild from per-provider cache, fromCache: true hardcoded (236–256); human show fetches live (321–341)"
  - id: provider-cache
    resource: /home/rektide/src/opencode-quota-finer/src/lib/quota-state.ts
    title: "quota-provider-state cache: 24h retention prune (24–26), TTL-gated reads (412–447), fetch+persist (233–410)"
  - id: cli-bin
    resource: /home/rektide/src/opencode-quota-finer/src/bin/opencode-quota.ts
    title: "The five-verb CLI: init / show / status / update / provider add (6–33)"
  - id: external-integration-doc
    resource: /home/rektide/src/opencode-quota-finer/docs/readme/external-integration.md
    title: "The toolkit's own external-consumer contract doc (the doc ocyc's line should be measured against)"
  - id: upstream
    resource: /home/rektide/archive/slkiser/opencode-quota/src/lib/quota-export.ts
    title: "Upstream slkiser/opencode-quota writes version: 1 (line 153); export default false there too"
  - id: host-config
    resource: file:///home/rektide/.config/opencode/opencode-quota/quota-toast.json
    title: "This host's live sidecar config — `\"export\": { \"enabled\": false }` set EXPLICITLY (the staleness smoking gun)"
  - id: host-export
    resource: file:///home/rektide/.cache/opencode/quota-export.json
    title: "The frozen artifact: mtime 2026-07-21 01:45, version 1, exportedAt 1784612728, zai/deepseek/opencode-go ok"
  - id: host-cache
    resource: file:///home/rektide/.cache/opencode/quota-provider-state/
    title: "The LIVE artifact: zai/openai/deepseek entries written 2026-09-20 14:47 — the fetch loop is healthy"
  - id: ocyc-cli
    resource: /home/rektide/src/ocyc/src/quota/cli.ts
    title: "ocyc's consumer: shells `show --json` over the injectable seam, 'never through an export file' (1–9), fork-first bin resolution (117–146)"
  - id: ocyc-freshness
    resource: /home/rektide/src/ocyc/src/fleet/assess.ts
    title: "quotaObservationAgeMs (915–931) — prefers exportedAt, cacheAgeSeconds fallback; DEFAULT_QUOTA_STALE_MS 24h (373–379)"
  - id: ocyc-quota-index
    resource: /home/rektide/src/ocyc/src/quota/index.ts
    title: "QuotaEntry/QuotaExport shapes (15–49), isValidResetAt (71–74), nextResetAt (117–127)"
  - id: quota-horizon-design
    resource: /home/rektide/src/ocyc/design/quota-horizon/quota-horizon.glm53z.md
    title: "Part A `ocyc quota next` (not yet built), Part B `fleet arm` + per-window due-ness (filed P2)"
  - id: jobs-design
    resource: /home/rektide/src/ocyc/design/jobs/jobs.glm53z.md
    title: "Uniform jobs API — expectation-vs-actual record (§2.3), quota-log's missing expectation columns (line 124), verdict joins (line 390)"
  - id: fleet-init0
    resource: /home/rektide/src/ocyc/design/fleet/init0.glm53f.md
    title: "F5 correction (137–154): the export measured ~2 months stale; freshness gating became load-bearing"
---

# opencode-quota-plus as ocyc's clock

## 0. Why this research exists

ocyc's fleet line — revive stalled sessions at quota reset, arm
self-perpetuating chains — is built but has never been armed on this host:
zero generation timers exist. [`ocyc-fleet-arm`](/home/rektide/src/ocyc/design/quota-horizon/quota-horizon.glm53z.md)
is filed (P2) as the consent verb. Both arming and firing now consume THIS
toolkit's output as their clock: ocyc's
[`src/quota/cli.ts`](/home/rektide/src/ocyc/src/quota/cli.ts) shells
`opencode-quota show --json` and treats the envelope's freshness fields as
load-bearing (stale ⇒ refuse). Meanwhile the OPS FACT from fleet init0 F5:
the persisted `~/.cache/opencode/quota-export.json` measured ~2 months
stale (July `exportedAt`, probed September 17). Whatever should keep that
file current wasn't running.

This document maps the toolkit's recording architecture, answers the
staleness question **from the code with host evidence** (§2 — the answer is
a config flip, not a daemon), and maps what ocyc's line needs next against
what exists (§3–§4). READ-ONLY pass: zero code changes here.

---

## 1. What it is — the recording architecture

### 1.1 Three tiers: fetch → per-provider cache → surfaces

The plugin is an OpenCode plugin + standalone CLI. Quota observation flows
through three tiers:

```
providers (30+ in src/providers/, per-provider auth + API adapters)
   │  fetch(ctx) → QuotaProviderResult { entries[], errors[], rawDetails? }
   ▼
per-provider disk cache  ~/.cache/opencode/quota-provider-state/<provider>-<key>.json
   │  written on every fetch (quota-state.ts:233–410, persisted at ~390)
   │  read is TTL-gated: older than minIntervalMs (default 5 min, types.ts:273) ⇒ miss
   │  pruned after 24h retention (quota-state.ts:24–26)
   ▼
surfaces
   ├─ TUI (sidebar/toasts/slash commands) — fetches live every 60s while a
   │   session is open (tui.tsx:57), refilling the cache
   ├─ CLI `show` (human) — fetches live via collectQuotaRenderData (cli-show.ts:321–341)
   ├─ CLI `show --json` — CACHE-ONLY rebuild, never fetches (cli-show.ts:236–256)
   └─ CLI `status` — diagnostics with live probes (cli-status.ts:24–32)
   ▼
export snapshot  ~/.cache/opencode/quota-export.json
   (written ONLY by the TUI loop, ONLY when export.enabled — §1.3)
```

The load-bearing subtlety: **the cache is the observation store; the export
is just a projection of it.** `buildQuotaExport` reads cached provider
results and performs "No live network fetches" (quota-export.ts:173–178).
`show --json` builds the same document in-memory and prints it — it neither
reads the export file nor writes it (cli-show.ts:236–256). The export file
and the JSON envelope are **sibling projections of the same cache**, and the
file is the only one that can go stale as a *file*.

### 1.2 The data model

Cache entries carry provider-reported accounting: `percentRemaining`,
`resetTimeIso`, a display `label` (e.g. `"5h:"`), and
`accounting { resultType, acquisitionMethod, ownership, authority,
sourceId }` (verified live: the zai cache entry for `[Z.ai] 5h` at 63%,
reset 2026-09-20T20:08:25Z, `authority: "provider_reported"`). The export
projection maps each entry to a [`QuotaExportEntry`](/home/rektide/src/opencode-quota-finer/src/lib/quota-export.ts)
(quota-export.ts:125–150):

- `window` — a semantic label ("5h", "Weekly", "MCP") derived from the row
  label via `classifyQuotaWindowText` (quota-export.ts:112–123, labels
  defined at 31–41). **This is the field ocyc's G2 per-window due-ness
  matches on.**
- `resetAt` — Unix seconds, from `resetTimeIso` (quota-export.ts:91–96).
- `percentRemaining` or `value` — `renderType: "percent" | "value"`.
- `observedAt` — per-entry observation time **when the provider supplies
  one** (quota-export.ts:129,137; absent on zai rows today).
- Envelope-level freshness: `version: 2`, `exportedAt` (Unix s),
  `fromCache`, `cacheAgeSeconds` — plus per-provider `status` (`ok |
  partial | error | unavailable`), per-provider `fetchedAt` (the cache
  timestamp, quota-export.ts:217), and for the aggregate source a
  per-credential `sources[]` status array (quota-export.ts:152–171).

The fork's pro-rata line adds pace awareness (elapsed-window-% vs
used-%) to *rendering*; the exported data model is upstream-compatible
except `version: 2` additions (v4 migration notes the JSON export v2:
[external-integration.md](/home/rektide/src/opencode-quota-finer/docs/readme/external-integration.md)).

### 1.3 The export lifecycle — who writes, when

Exactly one code path writes the file:

- [`writeTuiQuotaExportIfEnabled`](/home/rektide/src/opencode-quota-finer/src/lib/tui-runtime.ts)
  (tui-runtime.ts:802–824): resolves config, **returns silently unless
  `config.enabled && config.export.enabled`** (806–810), then builds from
  cache and `writeQuotaExport` (atomic write, quota-export.ts:277–282).
- Its only caller is the TUI home-bottom refresh loop's `afterApply`
  (tui.tsx:276–281) — fire-and-forget, "a failed write must never affect
  TUI rendering". The loop runs every 60s (tui.tsx:57) and on
  session/message events, **only while an OpenCode TUI session is open**.

There is no daemon, no systemd unit, no standalone `export` CLI verb. The
[external-integration doc](/home/rektide/src/opencode-quota-finer/docs/readme/external-integration.md)
is honest about this ("The TUI refreshes the file about once a minute") but
the config surface (`export.enabled`, default **false** — types.ts:73,
323–326; documented at configuration.md:566) makes the file an opt-in
artifact whose writer lives inside an interactive editor session.

### 1.4 The CLI surface ocyc shells to

Five verbs ([bin/opencode-quota.ts:6–33](/home/rektide/src/opencode-quota-finer/src/bin/opencode-quota.ts)):
`init`, `show`, `status`, `update`, `provider add`. ocyc's contract is
`show --json [--provider <id>]`:

- Cache-only; `fromCache: true` hardcoded (cli-show.ts:252–256); `--json`
  help says "reads from cache" (cli-show.ts:32).
- `--threshold <pct>` exit codes: 0 above / 1 below / 2 incomplete
  (cli-show.ts:259–290) — a ready-made scripting gate ocyc doesn't use.
- Errors are per-provider (`status: "error"` + message), never fatal to the
  envelope: a provider with dead credentials reads `unavailable`, not a
  failed process.

### 1.5 Config & conventions

Config resolves from the sidecar `opencode-quota/quota-toast.json(c)` (plus
legacy `experimental.quotaToast` sync; config.ts:37–38) — this host's sidecar
is [`~/.config/opencode/opencode-quota/quota-toast.json`](file:///home/rektide/.config/opencode/opencode-quota/quota-toast.json).
`minIntervalMs` (default 300000, types.ts:273) is both the fetch throttle
and the cache-read TTL.

**Rebrand state:** the repo now presents as **OpenCode Quota Plus** — a
maintained fork of slkiser/opencode-quota that rebases over `main@origin`
every round (default branch `plus`; README, "Where the fork lives"). The
npm package name is **still `@slkiser/opencode-quota`** "while the fork's
own packaging decision lands" (README note). The older posture survives in
[`.design/v2-integration/README.md`](/home/rektide/src/opencode-quota-finer/.design/v2-integration/README.md)
("integration workspace composing three lines") — treat that as history;
the README's fork posture is current. This host runs the fork from
`~/src/opencode-quota-finer/dist` (v4.8.2, dist built 2026-09-05), which is
also ocyc's last-resort binary resolution target (ocyc cli.ts:26–29).

---

## 2. The staleness question — answered

### 2.1 The artifact forensics

| Evidence | Value |
| --- | --- |
| `~/.cache/opencode/quota-export.json` mtime | **2026-07-21 01:45** |
| Its content | `version: 1`, `exportedAt: 1784612728` (= 2026-07-21T05:45:28Z), `cacheAgeSeconds: 18`, zai (2 entries) / deepseek / opencode-go `ok`, everything else `unavailable` |
| Current code writes | `version: 2` (quota-export.ts:264); upstream writes `version: 1` (upstream quota-export.ts:153) |
| `~/.cache/opencode/quota-provider-state/` | **zai, openai, deepseek entries written 2026-09-20 14:47 — two hours before this research** |
| Live sidecar config | `"export": { "enabled": false }` — **explicitly**, not by omission |
| `experimental.quotaToast` in opencode.json (and the 2026-07-21 backup) | `{}` |

### 2.2 The answer

**The export was never a background service — it is an opt-in TUI byproduct,
and the opt-in is currently OFF.** Specifically:

1. **What should refresh it:** only the TUI home-bottom loop
   (tui.tsx:276–281 → tui-runtime.ts:802–824), gated on
   `export.enabled`. Default is `false` in this fork **and upstream**
   (types.ts:323–326; upstream DEFAULT_CONFIG) — it has never been
   on-by-default in the v3+ line.
2. **What actually happened on this host:** the frozen file is
   `version: 1` — written by **upstream v3-era code** on July 21, when some
   since-lost config enabled the export (the current sidecar and every
   opencode.json backup I can read carry no `export.enabled: true`; config
   went through several rewrites that day — `bak-2026-07-21_01-06` among
   them). The operator then migrated to the fork (v4.x). The fork's TUI
   **is running and healthy** — the per-provider cache refreshed two hours
   before this research — but its export writer checks
   `config.export.enabled` → `false` (explicitly set in the sidecar) and
   returns silently (tui-runtime.ts:806–810). The file has been frozen
   since the last upstream-era write.
3. **Not the cause:** no cache-only-mode trap, no daemon crash, no pruning
   accident. The 24h cache prune (quota-state.ts:24–26) explains why a
   *cold* host would read all-`unavailable` — but this host's cache is
   warm. The one-word cause is: **the exporter is disabled.**

### 2.3 The load-bearing caveat: ocyc doesn't read this file

ocyc's consumer header says it outright: *"ocyc reads quota exclusively by
invoking the opencode-quota CLI (`show --json`), **never through an export
file**"* ([ocyc cli.ts:1–9](/home/rektide/src/ocyc/src/quota/cli.ts)). So
the July-stale file never corrupted ocyc's clock — the F5 probe hit an
artifact ocyc doesn't consume. The real ocyc-facing freshness story is
different and subtler (§3.2): the CLI envelope is either **<5 min old** (per
provider) or **`unavailable`** — it cannot carry months-old rows — but its
top-level `exportedAt` is set to **invocation time** (quota-export.ts:261),
which quietly blinds ocyc's freshness classifier (§3.2).

### 2.4 What would make it reliable-by-default

Ranked, smallest first:

1. **Flip the host config** (operator action, zero code):
   `export.enabled: true` in `quota-toast.json`. Immediately the file
   refreshes every ~60s while any OpenCode TUI is open. This fixes the OPS
   FACT today but does NOT fix reliability: close the laptop's TUI and the
   file ages freely again.
2. **A standalone `opencode-quota export` verb** (toolkit change): the
   writer already exists as a pure function — `buildQuotaExport` +
   `writeQuotaExport` (quota-export.ts:179–282). A CLI verb over
   `resolveExportPath` + the existing `createCliQuotaClient` would let any
   scheduler (ocyc fleet arm, a systemd timer, cron) refresh the snapshot
   headlessly. This converts "TUI byproduct" into "producible artifact"
   without adding a daemon.
3. **Fresh-on-read option for `show --json`** (toolkit change): a
   `--refresh` flag that performs the live fetch path (the human `show`
   already does this via `collectQuotaRenderData`, cli-show.ts:321–341)
   before the cache-only rebuild. ocyc's wake-time read would then be
   seconds-fresh instead of "whatever the last TUI/human show left".

---

## 3. What ocyc's line needs next — honest gap map

### 3.1 Structured per-window events (start/end derivability)

- **Exists:** the v2 envelope's `window` labels ("5h", "Weekly", "MCP" —
  quota-export.ts:31–41,112–123) are exactly what ocyc's G2 per-window
  due-ness matches on; `resetAt` is a clean Unix-seconds end-instant.
- **Missing:** the **window length is not in the envelope.** ocyc
  re-derives it by parsing display strings (`display.ts:41–51`:
  `5h`→5, `weekly`→168h — the quota-horizon design flags this). The toolkit
  knows the semantic `AccountingWindow` at export time (that's where the
  label comes from) and could emit `windowHours` per entry in one small
  change. That single field makes window **start** derivable
  (`resetAt − windowHours`) without ocyc string-parsing this toolkit's
  display vocabulary.
- **Missing:** no event semantics. A row is a snapshot; "this window
  rolled" or "a new window began" is ocyc's inference. That's the right
  division (see §3.4) as long as the snapshot carries enough to infer —
  `windowHours` closes the gap.

### 3.2 Reliable freshness — the trap in the current contract

The envelope's freshness fields are **not all honest**:

- `exportedAt` = `Date.now()` at envelope build (quota-export.ts:261) — for
  `show --json`, that is **invocation time, every time**. ocyc's
  [`quotaObservationAgeMs`](/home/rektide/src/ocyc/src/fleet/assess.ts)
  (assess.ts:915–931) **prefers** `exportedAt` and only falls back to
  `cacheAgeSeconds` — so on the live CLI path the age computes ≈0 and the
  24h staleness bar (assess.ts:373–379) **cannot trip from data age**. The
  gate is structurally blind where it matters.
- The *honest* ages are already in the envelope: per-provider `fetchedAt`
  (the cache timestamp, quota-export.ts:217 — ocyc's `ProviderQuota`
  already declares it, index.ts:36) and top-level `cacheAgeSeconds`
  (quota-export.ts:258–259).
- Two further wrinkles: `cacheAgeSeconds` is **0 when nothing is cached**
  (quota-export.ts:258–259 — "no data" masquerades as "brand new"), and
  with an empty `fetchedAtValues` the only age signal left is the lying
  `exportedAt`.
- **Why ocyc is still safe in practice:** the cache-read TTL (5 min) means
  any provider older than `minIntervalMs` reads `unavailable`
  (quota-state.ts:412–447), and ocyc's due bar requires usable rows — so
  firing on genuinely stale data is prevented by the TTL, not by the
  freshness gate. But the **stale ⇒ refuse** discipline as *designed* (F5)
  is not what's *enforced*; and if `minIntervalMs` were ever raised, the
  gate would stay silent while data aged.

**The fix is one field away on each side:** the toolkit should emit an
honest top-level `dataAsOf`/per-entry `observedAt` (it already computes the
inputs), and ocyc's `quotaObservationAgeMs` should prefer per-provider
`fetchedAt` over `exportedAt`. Neither breaks the other.

### 3.3 Provider enumeration

Better than ocyc's design assumed: the envelope carries **all configured
providers with explicit status** — `ok | partial | error | unavailable`
with error messages and per-credential `sources[]` for the aggregate
(quota-export.ts:152–171,219–244). ocyc's "unobserved providers render
honestly" open question (quota-horizon §Open q.1) is answerable from the
envelope alone: a configured-but-failing provider says *why* it's absent.
One wrinkle: `MAINTAINED_LOCAL_ESTIMATE_IDS` (`qwen-code`,
`alibaba-coding-plan` — quota-providers.ts:12) are local estimates whose
sources are filtered from the export; ocyc should treat their rows as
estimates, not provider-reported facts (the `authority` accounting field —
`provider_reported` vs local — is the discriminator and already flows into
`rawDetails`-adjacent accounting).

### 3.4 Historical recording — the jobs event-log's recorder question

ocyc's jobs design wants expectation-vs-actual quota outcomes as evidence
(jobs.glm53z.md §2.3; verdict joins at line 390). Today **nothing in this
toolkit persists history**: the cache prunes at 24h (quota-state.ts:25),
the export file is overwritten in place, `minIntervalMs` throttles to a
5-minute observation cadence. There is no window-start event, no
reset-confirmation record, no percent-at-reset history.

Could quota-finer be the recorder? **Yes, and it's the best-positioned
component** — it observes every window's `resetAt` arrive (each TUI refresh
compares snapshots) with `authority`-tagged provider-reported numbers. The
natural shape is a tiny append-only per-window event log written by the same
`afterApply` hook that writes the export (tui.tsx:276–281): on observed
`resetAt` rollover, append `{provider, window, resetAt, percentBefore,
percentAfter, observedAtIso}`. That record is precisely the "actual" side of
ocyc's expectation-vs-actual pairing, and it would also validate cotail's
parsed-from-error-text reset instants against ground truth.

**Division of labor (complementary, not competing):**

| Owner | Role |
| --- | --- |
| **quota-finer (this toolkit)** | Observation authority: live fetches, per-window semantics (`window`, `windowHours`, `resetAt`), honest freshness fields, optional rollover history |
| **ocyc** | Scheduling policy: freshness gating, arming, due-ness, declarations, expectation records, verdicts |
| **cotail** | Death-event evidence: parses structured reset instants from provider error text in the session DB (`cotail quota`, quota.ts:169–176) — the independent per-event clock F5 already ranked "more authoritative per-event" |

### 3.5 What does NOT belong here

Activation semantics (the hello that starts a window), scheduling, consent
verbs, or any ocyc-state — this toolkit is correctly a snapshot observer;
every gap above is an *enrichment of its output*, not an absorption of
ocyc's responsibilities.

---

## 4. The integration contract, today and minimally-hardened

### 4.1 Today's contract (what `ocyc quota next` / `fleet arm` inherit)

- Invocation: `show --json [--provider <id>]`, 30s timeout, 1MB stdout cap
  (ocyc cli.ts:35–37,159–166); binary resolution `--quota-bin`/`OCYC_QUOTA_BIN`
  → PATH → **this fork's dist** (ocyc cli.ts:117–146). That resolution order
  is a deliberate trust decision — the fork is "the canonical implementation…
  the published package can silently diverge" (cli.ts:3–5). The rebrand's
  pending npm rename (`opencode-quota-plus`) does not disturb it (the
  fallback is a filesystem path, not a package name), but **the rename
  should keep the `bin` entry name stable** (`opencode-quota`) or ocyc's
  PATH resolution needs a sync.
- Envelope: ocyc coerces missing `entries` to `[]` and accepts
  `ok|partial|error|unavailable` (cli.ts:135–141; index.ts:29–49).
  `nextResetAt` gates on `isValidResetAt` (index.ts:71–74) — invalid values
  never anchor scheduling.
- Freshness: `quotaObservationAgeMs` (exportedAt-preferring — the §3.2
  blindness) + `DEFAULT_QUOTA_STALE_MS` = 24h.

### 4.2 Minimal changes for robustness (each independent)

| # | Change | Owner | Effort |
| --- | --- | --- | --- |
| 1 | Flip `export.enabled: true` in `quota-toast.json` (fixes the OPS FACT artifact; enables the tmux/status-bar consumer class the docs advertise) | **operator** (host config) | one line |
| 2 | Emit `windowHours` per export entry (from the semantic `AccountingWindow` already in hand at quota-export.ts:112–123) — makes window starts derivable, retires ocyc's display-string parsing | **quota-finer** | small |
| 3 | Emit honest data age: per-entry `observedAt` where providers supply it (already coded, quota-export.ts:129,137) + a top-level `dataAsOf` (min per-provider `fetchedAt`); document `exportedAt` as *invocation* time | **quota-finer** | small |
| 4 | `cacheAgeSeconds: 0` → `null` when no cached data (quota-export.ts:258–259) so absence can't read as fresh | **quota-finer** | tiny |
| 5 | `show --json --refresh`: run the live fetch path before the cache-only rebuild (machinery exists, cli-show.ts:321–341) — wake-time reads become seconds-fresh | **quota-finer** | medium-small |
| 6 | `opencode-quota export` verb over `buildQuotaExport`+`writeQuotaExport` — headless snapshot refresh for schedulers; optionally ocyc arms it on a timer | **quota-finer** | medium-small |
| 7 | `quotaObservationAgeMs`: prefer per-provider `fetchedAt` (already in `ProviderQuota`, index.ts:36), then `cacheAgeSeconds`, then `exportedAt`; treat `cacheAgeSeconds === 0 && no entries` as unobservable | **ocyc** | small |
| 8 | Keep the `opencode-quota` bin name through the plus rename (or ship both), so PATH resolution keeps working | **quota-finer** (packaging decision pending) | decision |
| 9 | Rollover event log (the §3.4 recorder): append `{provider, window, resetAt, percentBefore/After}` on observed rollovers from the TUI hook | **quota-finer** (recorder) / **ocyc** (consumer) | medium |
| 10 | Cross-check policy: when cotail parsed a reset instant for the same provider+window, prefer it per-event (F5's ruling) and use the envelope as the interval-level cross-check | **ocyc** | policy |

Items 2–6 are the toolkit's highest-leverage moves for ocyc's line; item 7
is ocyc's mirror-image fix and lands the F5 discipline for real.

---

## 5. Open questions for the operator

1. **Was the export ever deliberately enabled?** The July write implies
   yes, but no surviving config shows it. If it was accidental (an older
   default or a since-rewritten config), item 1 in §4.2 is a *new* decision,
   not a restore — worth a conscious yes/no, since it also re-ignites the
   status-bar consumer path.
2. **Is a TUI-independent refresh wanted at all** (item 6), or is
   "fresh when OpenCode is in use, unavailable otherwise" the honest
   contract for a host where ocyc runs unattended? The latter is defensible;
   it just means ocyc's wake-time reads want item 5 (`--refresh`) more than
   item 1.
3. **Should `minIntervalMs` become part of the envelope** (it defines the
   staleness semantics of `unavailable`)? ocyc currently assumes the 5-min
   default; if the operator ever raises it for rate-limit reasons, ocyc's
   TTL-dependent safety margin silently widens.
4. **Recorder granularity** (item 9): per-credential rows (the `sources[]`
   split) vs per-provider aggregates — ocyc's verdicts want the credential
   grain when a provider has several.
5. **npm rename**: confirm `bin` name stability through the
   opencode-quota-plus packaging decision.

## 6. Cross-references

- [`/design/prorata/maintenance.md`](/home/rektide/src/opencode-quota-finer/.design/prorata/maintenance.md) — the live integration practice for this repo's fork lines; this doc's §1.5 rebrand summary defers to it.
- [`.design/v2-integration/README.md`](/home/rektide/src/opencode-quota-finer/.design/v2-integration/README.md) — the earlier integration-workspace posture (historical).
- [`docs/readme/external-integration.md`](/home/rektide/src/opencode-quota-finer/docs/readme/external-integration.md) — the toolkit's own consumer contract; ocyc's line is a stricter consumer than any it currently documents.
- [ocyc `quota-horizon.glm53z.md`](/home/rektide/src/ocyc/design/quota-horizon/quota-horizon.glm53z.md) — Part A/B designs this research supplies the upstream half of; its A.1 map rows for the envelope and freshness classifiers are corrected in §3.2 here (exportedAt blindness).
- [ocyc `jobs.glm53z.md`](/home/rektide/src/ocyc/design/jobs/jobs.glm53z.md) — the expectation-vs-actual record (§2.3) that §3.4's rollover log would feed.
- [ocyc `fleet/init0.glm53f.md` F5](/home/rektide/src/ocyc/design/fleet/init0.glm53f.md) — the staleness correction this document explains mechanically; §2.3 also confirms F5's "parsed timestamp is the more authoritative per-event clock" ranking against cotail's parser.
- [ocyc `src/quota/cli.ts`](/home/rektide/src/ocyc/src/quota/cli.ts) / [`src/quota/index.ts`](/home/rektide/src/ocyc/src/quota/index.ts) — the consumer seam and selection machinery; item 7 in §4.2 is the one ocyc-side edit this research argues for.
