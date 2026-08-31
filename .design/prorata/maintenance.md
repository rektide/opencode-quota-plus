---
type: Practice
title: Bookmark and re-integration maintenance practice
description: How this integration workspace argues its stack shape, tracks layers, and stamps rounds.
tags: [jj, bookmarks, integration, maintenance]
status: draft
generated: { by: "model:glm-5.3 (via opencode)", at: 2026-08-30T00:00:00Z }
verified: { by: unverified, at: never }
stale_after: 2026-11-01
sources:
  - id: v2-integration-readme
    resource: /design/v2-integration/README.md
    title: opencode-quota v2 integration README
    author: human:rektide + agents
    last_modified: 2026-08-20
---

# Maintenance practice: arguing the stack, tagging the rounds

This workspace ([`opencode-quota-finer`](/README.md)) composes three lines —
upstream **origin** (`slkiser/opencode-quota`), **dmmop-v2**
(`dmmop/opencode-quota-v2`), and **local** work — into one stack. Two things
need governing: the *shape* of the stack (what commits together, in what
order) and the *tagging* of rounds. They get different treatment.

**What is fixed** — the mechanics:

- Round loop: fetch → import → rebase → verify → close.
- Stamp rules: only layers that moved; dated fossils are immutable; date-only
  format; one canonical name per concept.
- Every round preserves, in this doc's Round log, the **reasoned argument**
  for the shape it actually built.

**What is never fixed** — the shape: the layer list, groupings, and sequence
are re-argued every round from the actual content, never copied forward by
inertia. The happenstance order of commits is evidence, not law. Commits are
not sacred: a round may regroup happenstance commits into logical ones.

## Arguing the shape

Each restructuring, answer three questions and record the answers:

1. **What are the concerns?** Group by what a change *is*, not when it was
   made. Adaptation fixes discovered weeks apart belong to one layer if they
   serve one concern ("make the import run here").
2. **What actually should commit together?** A commit is one concern's
   coherent step: it builds, its tests ride with it, and it doesn't mix
   concerns. `.design` addenda written during the work fold into the commit
   they document (the addendum pattern is for incremental work; rounds are
   when we pay it down). Repo hygiene chores join the round's meta commit.
3. **What sequence?** Order by dependency, and write the argument:
   - import before everything (it is the base);
   - adaptation before features (the plugin must build/load/auth before
     anything can render);
   - data before display (presentation reads `computeProRataDeltaPct`
     extracted from the prorata math);
   - format core between features and surfaces (pure formatting, consumed by
     UI layers, so it precedes them);
   - surfaces before decoration (rows render inside claimed slot surfaces, so
     slots precedes themes/visibility policy);
   - docs last, describing the settled shape.

Inversions vs happenstance are expected and worth naming: in the 2026-08-30
assessment the opentui pin (committed *before* prorata) moved down into
slots — it exists to match the host contract, not to enable the indicator —
and the grouped-formatter extraction (committed *after* the slot claims)
moved below slots, because the sectioned sidebar consumes it.

### Current assessment (2026-08-30)

| Layer | Concern | Absorbs (happenstance commits) |
| --- | --- | --- |
| `v2` import | dmmop's chain verbatim | their 8 rebased copies → their fresh realigned chain |
| adaptation | make the import run here | entrypoint build, credential DB discovery, prefer V2 next DB, provider-id resolution, biome |
| `prorata` | burn-rate feature | indicator + delta math |
| formatting | pure row/line formatting | grouped-formatter extraction |
| `slots` | host-contract surfaces | opentui pin, slot-tree typing, 3 claims, session-meta, sectioned sidebar, separator fix |
| presentation | visual & visibility policy | hiddenEntries/quietEntries, barTheme glyphs, composable specs, property-stack registry (+ spec tests) |
| meta | describe the shape | v2-integration README + addenda, gitignore, this doc |

## Rounds and stamps (mechanics)

A **round** is one re-integration cycle:

1. **Fetch** — origin and dmmop-v2. Remote force-pushes display as old
   revisions going **hidden**; that is normal, not data loss. Fossils keep
   every prior state reachable.
2. **Import** — if the remote rewrote the `v2` layer, drop our stale copies
   and graft local work onto their fresh chain; old copies survive under
   their dated stamps.
3. **Rebase** — onto the base that already contains the upstream
   reconciliation when one exists. Keep happenstance commits through
   conflict resolution (safer), then **regroup** into the argued logical
   commits before closing — that regroup is part of the round. (The 0830
   round closed before regrouping; see its actuals.)
4. **Verify** — biome, typecheck, build, full suite; commands and quirks in
   the [v2-integration README § Verification](/design/v2-integration/README.md#verification).
5. **Close** — move floating bookmarks to true layer boundaries; stamp;
   restore any fossil the rebase auto-moved (jj moves bookmarks on rebased
   commits; fossils must be pinned back to their pre-rebase commits); log
   the round's argument and actuals below; commit docs with the state.

Stamp rules:

- Stamp **only layers that moved** since their latest stamp. A layer moved if
  its boundary commit is not the same (change-id) copy its latest stamp holds
  — so rebase rounds stamp every layer (all commit ids change); local-only
  rounds stamp only layers that grew. A stamp identical to the previous
  round's means "alive but idle".
- Dated stamps are **immutable fossils**: never moved, never reused; a
  same-day rebuild replaces that day's snapshot. Divergence under an old
  stamp (e.g. `prorata-20260810`) is expected — it pins a pre-rebase copy.
  Never "fix" a fossil.
- Dropped experiments are archived as dated-only bookmarks with no floating
  parent (`v1-adapter-20260818`); deleting the floating bookmark is the
  archive act.

Naming: one canonical spelling per concept (`prorata`, never `pro-rata`).
Legacy fossils are left alone: `pro-rata`, `pro-rata-v2`, `v2main`,
`finer-snapshot-20260810T192821Z` (full-timestamp format is reserved for
intra-round safety pins only). Floating bookmarks mark layer boundaries, not
"recently touched" — the 08-19 drift of `v2` onto a polish commit is the
cautionary tale; resets happen at round boundaries.

## Round log

### 2026-08-30

- Fetch: dmmop realigned their fork with upstream through 08-23 and added
  five commits (displayed as deletions when their force-push hid old copies —
  expected); origin added #240 (Windows portability, 6 commits) — deferred to
  the next round. Base chosen: `main@dmmop-v2`.
- Shape argument: as assessed above (seven layers; two named inversions).
- Actuals:
  - 24 local commits rebased; ~12 conflict sites across 15 files resolved
    bottom-up in `jj edit` mode (amend each conflicted commit, descendants
    auto-rebase). One stray divergent working-copy commit (a `nnsxxlpu`
    duplicate created by the edit-mode rebases) was abandoned.
  - `prepare-tui-dist.mjs`: took dmmop's dual-entrypoint babel loop, kept our
    `tui-v2.d.ts → tui.d.ts` copy.
  - Credential rows: adopted dmmop's richer schema (id/label/active,
    active-first ordering); our DB discovery and V2-next preference survive
    — the primary-path test now expects `opencode-next.db`.
  - Upstream moved the toast format call into `quota-toast-runtime.ts`; our
    `showProRataIndicator` and `barTheme` config lines were re-applied there
    rather than in `plugin.ts`.
  - `formatGroupedQuotaEntryLines` (our extraction) was re-implemented on
    upstream's `interpretAccountingRow` model — value/atomic branches,
    percentValueCol threading, basis detail lines, and the pro-rata
    countdown all ported; 91 formatter tests held at the port point.
  - Boolean-entry compatibility (upstream's new `QuotaBooleanEntry`):
    `formatProRataIndicator`, `computeProRataDeltaPct`, and
    `BarThemeMetrics` now treat `percentRemaining` as optional.
  - **Inversion decision**: the five-hour window label. Ours was
    "Five-hour"; upstream pins "5h" in eight tests plus the accounting
    aliases, and the compact label fits the narrow-toast width policy. Ours
    yielded; the sections test was updated. Recorded here because the
    happenstance order can't be trusted to explain this one.
  - Verify: typecheck clean, build clean, full suite **192 files / 2296
    tests** green (up from 1968 at the 0818 tip — upstream's tests included).
  - Close: `v2` reset to the imported chain top (backwards move allowed —
    the drift fix); `prorata`/`slots` rode the rebase automatically;
    `integration` moved to the round tip. Stamps created: `v2-20260830`,
    `prorata-20260830`, `slots-20260830`, `integration-20260830`. The 0818
    fossils (`prorata-20260818`, `slots-20260818`, `integration-20260818`)
    were restored to their pre-rebase commits after the rebase auto-moved
    them — jj moves bookmarks on rebased commits; practice says fossils
    never move, so this restore is now an explicit close step.
  - Deferred to a follow-up: regrouping the polish-week commits into the
    argued layers (the round closed on happenstance commits plus one merge
    fixup), and origin's #240.

## Cross-references

- [`/design/v2-integration/README.md`](/design/v2-integration/README.md) —
  the design doc this practice maintains; its "Bookmark structure" section
  (written 08-18) predates the only-moved rule, the shape-re-argument rule,
  and the drift fix, and defers to this doc where they disagree.
- [`/README.md`](/README.md) — user-facing plugin docs; the maintenance
  practice is invisible there by design.
