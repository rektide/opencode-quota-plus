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
   commits before closing — that regroup is part of the round.
4. **Verify** — biome, typecheck, build, full suite; commands and quirks in
   the [v2-integration README § Verification](/design/v2-integration/README.md#verification).
5. **Close** — move floating bookmarks to true layer boundaries; stamp; log
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

### 2026-08-30 (in flight)

- Fetch: dmmop realigned their fork with upstream through 08-23 and added
  five commits; origin added #240 (Windows portability, 6 commits) — deferred
  to a later round. Base chosen: `main@dmmop-v2`.
- Shape argument: as assessed above (seven layers; two named inversions).
- Plan: rebase happenstance stack as-is, resolve conflicts, regroup into the
  argued layers, reset `v2` to the imported chain top, verify, close with
  stamps `v2-20260830`, `prorata-20260830` (created although prorata is
  content-idle — the rebase moved its commit), `slots-20260830`,
  `integration-20260830`. `prorata`/`slots` boundaries stay semantic (the
  indicator commit; the session-meta commit) — regrouping reassigns the
  polish week's commits but does not move historical boundaries.
- Actuals: *(appended at close)*

## Cross-references

- [`/design/v2-integration/README.md`](/design/v2-integration/README.md) —
  the design doc this practice maintains; its "Bookmark structure" section
  (written 08-18) predates the only-moved rule, the shape-re-argument rule,
  and the drift fix, and defers to this doc where they disagree.
- [`/README.md`](/README.md) — user-facing plugin docs; the maintenance
  practice is invisible there by design.
