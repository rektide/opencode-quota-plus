# opencode-quota v2 integration

`~/src/opencode-quota-finer` is an integration workspace for
`@slkiser/opencode-quota` — a zero-context-window quota/usage plugin for
OpenCode. It does not fork the plugin; it composes three lines and adds local
work on top:

1. **origin** — `slkiser/opencode-quota`, the upstream release line.
2. **dmmop-v2** — `dmmop/opencode-quota-v2`, the v2 TUI fork (native v2
   sidebar, credential-database auth, local slash commands, collapsible
   panels).
3. **local** — credential DB discovery fixes, pro-rata burn-rate reporting,
   and the v2 slot-tree UI described below.

The local `resetTimeDecimals` (finer reset-countdown resolution) work landed
upstream and carries no local patch. The dual v1/v2 adapter experiment was
dropped — the plugin is full-in on the v2 TUI — and survives only under its
date-only bookmark (`v1-adapter-20260818`).

## Bookmark structure: tip, then the feature

Every accepted line gets a floating tip bookmark plus an immutable dated
snapshot:

| Bookmark | Dated | Points at |
| --- | --- | --- |
| `integration` | `integration-20260818` | accepted composition tip |
| `v2` | `v2-20260818` | dmmop's v2 chain rebased onto `main@origin` |
| `prorata` | `prorata-20260818` | pro-rata burn-rate work atop `v2` |
| `slots` | `slots-20260818` | v2 slot-tree UI atop `prorata` |

Older lines keep their own dated snapshots (`v2-20260810`, `prorata-20260810`,
`finer-snapshot-…`) and are never moved. Dated bookmarks are never reused; a
rebuild on the same date replaces the day's snapshot rather than adding a
second one.

## Stack shape (2026-08-18)

```
main@origin (upstream release)
└─ dmmop's 8 v2 commits ...................... v2
   ├─ feat(tui): V2 quota sidebar
   ├─ feat(auth): credential database fallback
   ├─ feat(tui): local quota slash commands
   ├─ feat(tui): collapsible quota sidebar
   ├─ feat(auth)!: drop auth.json fallback
   ├─ refactor(auth): credential DB path resolution
   └─ chore(deps): opentui bump
└─ fix: build and load the V2 TUI entrypoint
└─ fix: discover current credential databases
└─ fix: prefer the V2 next credential database
└─ feat(quota): pro-rata burn-rate indicator ... prorata
└─ chore(deps): opentui pin matching opencode
└─ refactor(tui-v2): full slot-tree typing
└─ feat(tui-v2): claim prompt.footer.status
└─ feat(tui-v2): claim sidebar.footer
└─ feat(tui-v2): claim home.footer
└─ refactor(tui-v2): session meta via context.data  slots = integration
```

## The neat part: living in OpenCode's slot tree

Upstream OpenCode (#41189) rebuilt plugin UI placement as a **hierarchical
slot tree**: dot-paths where a path *contains* every path it prefixes, claimed
with `prepend` / `append` (inside a boundary), `before` / `after` (sibling),
or `replace` (takeover). Claims at unpublished paths degrade to the nearest
surviving ancestor. OpenCode's own footers are plugins claiming this same
tree — so good citizenship here means composing exactly like the host does.

The plugin's `src/tui-v2.tsx` now:

- **Types the full v2 slot API locally** (`SlotMap` / `SlotClaim`, all five
  placements, every published path), so TypeScript catches drift against the
  host contract instead of silently accepting a stale shape.
- **Claims four additive surfaces**, all `append`, never `replace` — every
  claim leaves room for the host and other plugins at the same anchor:

  | Path | Surface | Gated by |
  | --- | --- | --- |
  | `sidebar.content` | per-session quota panel (dmmop's collapsible view) | `tuiSidebarPanel.enabled` |
  | `prompt.footer.status` | compact one-line status beside the prompt input | `tuiCompactStatus.sessionPrompt` |
  | `sidebar.footer` | aggregate — active provider count + soonest reset | `tuiSidebarPanel.enabled` |
  | `home.footer` | sessionless compact line on the home screen | `tuiCompactStatus.homeBottom` |

  The same `collectQuotaForSession` core feeds all four; each surface is a
  thin render + refresh-on-`session.step.ended` shell. The compact lines
  reuse the plugin's existing `buildCompactQuotaStatusLine` formatter, so
  percent display modes and reset-countdown decimals behave consistently with
  the toast/sidebar surfaces.
- **Prefers `context.data.session.get()`** (OpenCode's live store, reactive,
  no round-trip) for session model metadata, keeping the client call as
  fallback.

That last item is the general theme: claim precisely, degrade politely, read
from the store before the client.

## Verification

At the `slots`/`integration` tip (2026-08-18): biome `check` clean,
`typecheck` clean, `build` clean, full suite **1968 tests** green,
`verify:package-contents` green.

Commands (this workspace needs the flags below — see quirks):

```sh
pnpm --config.verify-deps-before-run=false run build
V4_HISTORY_REPO=~/tmp-opencode/v4-history \
  pnpm --config.verify-deps-before-run=false test
```

## Workspace quirks

- This directory is a jj **workspace** of the colocated
  `~/archive/slkiser/opencode-quota` repo. There is no local `.git`, which
  breaks two things: the lefthook `prepare` script (use
  `--config.verify-deps-before-run=false` on every pnpm invocation) and the
  v4-history release gate (point `V4_HISTORY_REPO` at a git mirror; one lives
  at `~/tmp-opencode/v4-history` — refresh with
  `git fetch --update-head-ok` from the colocated repo's `.git`, then
  `git checkout --detach <commit>`).
- opentui is pinned exactly to whatever the opencode source checkout pins in
  its workspace catalog, so plugin and host render through the same
  opentui. The pin is enforced by `verify:typescript-version` and manifest
  tests. The repo's 24h `minimumReleaseAge` guard excludes `@opentui/*` so a
  same-day release can be matched.
- `tests/tui-dist-packaging.test.ts` occasionally flakes under full-suite
  parallel load; it passes standalone and on reruns. Pre-existing, unrelated
  to the integration work.

## Open questions

- The four claims re-collect quota independently per surface; a shared
  per-session reactive resource (one collect, many renders) would cut
  duplicate runtime work when several surfaces are visible at once.
- `sidebar.footer`'s aggregate line is hand-formatted; consider folding it
  into the compact formatter so width/percent policy stays in one place.
- Toast triggers (`showOnIdle` / `showOnCompact` / `showOnQuestion`) still
  ride an inert `app` claim that registers on first render; if the host ever
  publishes a lifecycle-only hook, move registration there and drop the
  `app` claim.

## Addendum: runtime provider ids under v2 (2026-08-19)

Symptom: after upgrading OpenCode to v2, the Z.ai Coding Plan quota stopped
reporting in the TUI, and the panel showed only
`OpenRouter: Invalid openrouter-key-v1 response` — as if rendering had
stopped at the error.

Root cause: v2 replaced the SDK's `client.config.providers()` with
`client.provider.list()` (`GET /api/provider`, envelope
`{ location, data: Provider.Info[] }`). `tui-v2.tsx` passed the host client
through unchanged, so `createRuntimeProviderIdResolver`'s legacy call threw;
`isCanonicalProviderAvailable` swallowed it and, with `fallbackOnError:
false`, every provider gated on the runtime list (Z.ai, Zhipu, MiniMax, …)
was silently marked unavailable. OpenRouter's availability check only looks
for a configured key (a stale `OPENROUTER_API_KEY` in the shell
environment), so it alone fetched and failed — leaving an entries-empty
render where the error row was the only content. The formatters already
draw entries first and errors last; the bug was upstream of rendering.

Fix: `src/lib/tui-v2-client.ts` adapts the host client into the runtime's
expected shape, resolving provider ids through a failure-tolerant chain —
v2 `provider.list()`, legacy `config.providers()`, then the file-based CLI
resolution (config files + credential stores). Same theme as the session
meta work: degrade politely, and never let one broken host surface blank
the report. Verified end to end against the live server list shape (see
`.test-agent/v2-client-check/`): Z.ai 5h/MCP entries render, with the
Claude/OpenRouter errors trailing after the working rows.

## Addendum: entry visibility and sectioned sidebar (2026-08-19)

Question raised: should each provider (and each quota row) become its own
host slot? Answer: no — the host slot tree places *surfaces* via claims
registered at setup; per-row slot claims would fight the dynamic row set
and slots carry no config-binding for hiding. Instead the sidebar slot
now composes **one section per provider and one row per entry**
internally (`src/lib/tui-sidebar-sections.ts`, backed by a
`formatGroupedQuotaEntryLines` extraction from the grouped formatter so
rows format identically without re-emitting headers), and display
control moved into config:

- `hiddenEntries` / `quietEntries` — `provider[:window|accounting]`
  patterns (`zai:mcp`, `deepseek:balance`, `*:mcp`), validated with
  per-index issues, applied in `collectQuotaRenderData` after fetch and
  before projection so hidden rows cannot win single-window selection or
  fire reset notifications. `/quota_status` and JSON export stay
  unfiltered.
- OpenCode v2 plugin entry `options` (`{ package, options }` in
  `plugins`) are read from `context.options` and applied with the
  highest precedence, above the quota-toast sidecar and
  `experimental.quotaToast`.
- Quiet rows render with the host theme's `textMuted` color in the v2
  sidebar; flat text surfaces keep them visible.

Config layering discovered along the way (highest wins):
`plugin.options` → `opencode-quota/quota-toast.json` sidecar →
`experimental.quotaToast` in opencode.json layers. The user's live
suppression (`zai:mcp`, `deepseek:balance`) lives in
`~/.config/opencode/opencode-quota/quota-toast.json`.

