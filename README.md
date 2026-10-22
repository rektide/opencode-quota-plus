<p align="center">
  <a href="https://github.com/rektide/opencode-quota-plus">
    <picture>
      <source srcset="opencode-quota-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="opencode-quota-logo-light.svg" media="(prefers-color-scheme: light)">
      <img src="opencode-quota-logo-light.svg" alt="OpenCode Quota Plus logo">
    </picture>
  </a>
</p>
<p align="center">Quota, usage, and token visibility in OpenCode and your terminal — pace-aware, v2-forward.</p>
<p align="center">
  <a href="https://github.com/rektide/opencode-quota-plus/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/rektide/opencode-quota-plus/ci.yml?style=flat-square&branch=plus&label=CI" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" /></a>
  <a href="https://github.com/slkiser/opencode-quota"><img alt="upstream" src="https://img.shields.io/badge/fork%20of-slkiser%2Fopencode--quota-blue?style=flat-square" /></a>
</p>

**OpenCode Quota Plus** is a maintained fork of [slkiser/opencode-quota](https://github.com/slkiser/opencode-quota) that tracks upstream closely and layers a rendering-focused feature line on top. It is not a hard fork: every round is rebased over `main@origin`, so upstream fixes and providers flow through continuously.

## The headline: pro-rata burn-rate awareness

Every quota window knows how much of its *time* has elapsed. The fork renders that pace against your actual usage everywhere, so you can see at a glance whether you are burning quota faster or slower than the clock:

```
[OpenAI] (Pro)                 +10%      ← pace delta: usage minus elapsed time
Weekly              5.7d 71% done        ← countdown + window time elapsed
███████░░░░░░░░░░░░░░░░░░   29% used     ← quota actually used
```

Read it vertically: `71% done` (time) over `29% used` (quota), with the signed delta `+10%` hoisted onto the provider header. Under pace, the numbers match; over pace, you know by how much — before the wall hits. Providers with multiple windows stack their deltas on the header, top-most row right-most:

```
[OpenAI] (Pro)          -3% +8% -20%
5h                     2.5h 50% done
████████░░░░░░░░░░░░░░░░░   30% used
Weekly                 5.7d 19% done
███████░░░░░░░░░░░░░░░░░░░   27% used
Monthly               26.0d 13% done
███░░░░░░░░░░░░░░░░░░░░░░░   10% used
```

The indicator is default-on, works on every surface (sidebar, toasts, `/quota`, terminal `show`), and rounds to your configured percent precision. The same pacing math drives [conditional bar themes](docs/readme/configuration.md#conditional-themes), so bars can change color or glyphs as you drift off pace.

## What the fork adds

All of this sits atop the inherited upstream base — providers, toasts, slash commands, token reports, and the updater carry over unchanged.

| Adds | What you get |
| ---- | ------------ |
| **Pro-rata burn-rate indicator** | Signed usage-vs-pace delta on provider headers, window-elapsed `% done` on rows, all surfaces, default on |
| **Fractional precision** | `percentDecimals` and `resetTimeDecimals` render fractional percents, deltas, and countdowns (`74.4%`, `+2.5%`, `5.7d`) |
| **Composable bar themes** | 12 glyph themes (`classic`, `smooth`, `dots`, `rings`, …) as property stacks of characters and color, with conditional rules on pace delta, used percent, and hours remaining |
| **Row visibility** | `hiddenEntries` and `quietEntries` drop or dim individual windows without disabling the provider |
| **Sectioned sidebar rendering** | Structured per-provider sections with per-row color and quiet styling, plus a decoupled `footerLine` |
| **Expandable error rows** | Credential failures collapse to dimmed canned summaries (`bad credentials`); clicking reveals the full message with provider JSON bodies compacted onto their own line |
| **v2-first slot integration** | Typed local slot-tree claims across `sidebar.content`, `sidebar.footer`, and `prompt.footer.status`, with runtime provider-id resolution across v2 clients |
| **Credential-DB discovery** | Prefers OpenCode v2's *next* credential database, falling back to legacy stores |

Inherited from upstream and worth knowing about: session-token display with `sessionTokenScope: "current" | "tree"` (the tree scope folds child and subagent sessions into your totals), reset notifications, pricing from `models.dev`, and the guided updater.

`resetTimeDecimals` originated here and has been upstreamed.

## Where the fork lives

- **Repository:** [rektide/opencode-quota-plus](https://github.com/rektide/opencode-quota-plus), default branch `plus`
- **Upstream:** [slkiser/opencode-quota](https://github.com/slkiser/opencode-quota) — this fork rebases over `main@origin` every round; dated snapshot bookmarks preserve each integration state
- **Tooling:** in-repo `upstream:check` / `upstream:sync` / `upstream:prepare-review` scripts keep the upstream diff reviewable, and `verify:v4-history` plus package-contents gates run before releases

> [!NOTE]
> The npm package name is still `@slkiser/opencode-quota` while the fork's own packaging decision lands. The commands below install that base package; the fork's additions currently ship from this repository's `plus` branch.

## Quick start

```bash
npx @slkiser/opencode-quota init
```

> [!IMPORTANT]
> Node.js `>= 22` is required.

Upgrading from v3? Read the [v4 migration guide](docs/readme/v4-migration.md).

After installation:

1. Restart OpenCode.
2. Run a slash command in OpenCode, or use `opencode-quota show` from your terminal.
3. If you enabled the sidebar, open the session sidebar and look for `Quota`.
4. If you enabled the compact status line, look at the bottom of Home or below the message input.

## Updating

1. Close OpenCode.
2. Preview the update:

   ```bash
   npx @slkiser/opencode-quota@latest update --dry-run
   ```

3. Inspect the safe setting/cache changes and manual credential findings, then apply:

   ```bash
   npx @slkiser/opencode-quota@latest update
   ```

4. Restart OpenCode.

The updater prints the complete preview before its own config or cache changes. `--yes` authorizes only the previewed safe config edits and manifest-verified cache cleanup; it never moves or deletes secrets. See [Updating safely](docs/readme/updating.md) for detailed behavior and manual credential steps.

## Choose your setup

- **Sidebar panel** — the full pace-aware view in OpenCode's session sidebar: provider headers with their pro-rata deltas, `% done`/`% used` rows, themed bars, and dimmed expandable error rows.
- **TUI toast** — quota checks appear automatically while you work, with the same rendering at toast width.
- **Compact status line** — short quota text on Home and below the message input.
- **Token reports** — `/tokens_today`, `/tokens_weekly`, session reports, and more.

More ways to use it:

- Check quota anywhere: use `opencode-quota show` in a terminal or the same slash commands in the TUI, Web, and Desktop.
- Automate quota checks with JSON output for scripts, status bars, and CI. Optional OpenTelemetry metrics support monitoring tools.
- Customize the display with [`tuiPromptBar.enabled`](docs/readme/configuration.md#tui-settings), OpenCode Go's preferred collapsed-sidebar window, reset precision, and [`accountingDetail`](docs/readme/configuration.md#show-accounting-detail).
- Choose current-session or descendant-tree token totals. Get reset popups for selected windows with [`resetNotifications`](docs/readme/configuration.md#notify-when-quota-becomes-available-again).
- Route stalled-work recovery to a resumptive assistant message, a human-only toast, both, or neither with [`retryPacing.recoveryNotice`](docs/readme/configuration.md#choose-where-recovery-notices-go). The optional Composed/sidebar control changes this per session without editing config.
- Revive quota-stalled work after the exhausted provider window resets. This is on by default; roots are prompted to continue, quota-failed children are offered back to their parent, and independent forks retain direct paced retries.
- Troubleshoot authentication, quota sources, pricing, and maintainer notices.

See [Configuration](docs/readme/configuration.md) for UI options and [Manual install](docs/readme/manual-install.md) for setup details.

## Commands

### Core slash commands

| Command                                 | Use when                                                        |
| --------------------------------------- | --------------------------------------------------------------- |
| `/quota`                                | Show current quota                                              |
| `/quota_status`                         | Diagnose setup, authentication, providers, pricing, and notices |
| `/quota_announcements`                  | Read active bundled maintainer notices                          |
| `/pricing_refresh`                      | Refresh local runtime pricing from `models.dev`                 |
| `/tokens_today`                         | Show tokens used today                                          |
| `/tokens_daily`                         | Show tokens used in the last 24 hours                           |
| `/tokens_weekly`                        | Show tokens used in the last 7 days                             |
| `/tokens_monthly`                       | Show tokens used in the last 30 days, including pricing         |
| `/tokens_all`                           | Show tokens used across all local history                       |
| `/tokens_session`                       | Show tokens used in the current session                         |
| `/tokens_session_all`                   | Show current session plus descendant sessions                   |
| `/tokens_between YYYY-MM-DD YYYY-MM-DD` | Show tokens used between two dates                              |

### CLI commands

Use the CLI for setup, updates, terminal checks, and custom providers.

| Command                                                  | What it does                                |
| -------------------------------------------------------- | ------------------------------------------- |
| `npx @slkiser/opencode-quota@latest init`                | Set up OpenCode Quota                       |
| `npx @slkiser/opencode-quota@latest provider add`        | Add or update a custom provider             |
| `npx @slkiser/opencode-quota@latest show`                | Show current quota                          |
| `npx @slkiser/opencode-quota@latest status`              | Check configuration and provider problems  |
| `npx @slkiser/opencode-quota@latest update`              | Update an existing installation             |

Run `npx @slkiser/opencode-quota@latest --help` for command options. See [External integration](docs/readme/external-integration.md#1-get-json-from-a-command) for JSON, scripts, and CI examples.

## Providers

### Pre-configured American providers

<details open>
<summary><strong>Personal</strong></summary>

| Provider           | Auth/setup                                                     | Data from          | Reports            |
| ------------------ | -------------------------------------------------------------- | ------------------ | ------------------ |
| Anthropic (Claude) | [Needs setup](docs/readme/providers.md#anthropic-claude)       | Local CLI/OAuth    | Quota              |
| Chutes AI          | Automatic                                                      | Remote API         | Quota              |
| Cursor             | [Needs setup](docs/readme/providers.md#cursor)                 | Local estimate     | Budget and spend   |
| GitHub Copilot     | Automatic                                                      | Remote API         | Budget and usage   |
| Google AGY         | [Needs setup](docs/readme/providers.md#google-agy-quick-setup) | Remote API         | Quota              |
| Google Antigravity | [Needs setup](docs/readme/providers.md#google-antigravity)     | Remote API         | Quota              |
| Kilo Gateway       | Automatic                                                      | Remote API         | Quota and balance  |
| NanoGPT            | Automatic                                                      | Remote API         | Quota and balance  |
| Ollama Cloud       | Automatic                                                      | Remote API         | Quota and usage    |
| OpenAI             | Automatic                                                      | Remote API         | Quota              |
| OpenCode Go        | Automatic                                                      | Remote API         | Quota              |
| OpenCode Zen       | [Needs setup](docs/readme/providers.md#opencode-zen)           | Dashboard scraping | Budget and balance |
| OpenRouter         | Automatic                                                      | Remote API         | Budget and spend   |
| Synthetic          | Automatic                                                      | Remote API         | Quota              |
| xAI SuperGrok      | Automatic                                                      | Remote API         | Quota              |

</details>

<details>
<summary><strong>Business / Enterprise</strong></summary>

| Provider                | Auth/setup                                                     | Data from          | Reports            |
| ----------------------- | -------------------------------------------------------------- | ------------------ | ------------------ |
| Anthropic (Claude)      | [Needs setup](docs/readme/providers.md#anthropic-claude)       | Local CLI/OAuth    | Quota              |
| Chutes AI               | Automatic                                                      | Remote API         | Quota              |
| Cursor                  | [Needs setup](docs/readme/providers.md#cursor)                 | Local estimate     | Budget and spend   |
| Gemini CLI (deprecated) | [Existing setups only](docs/readme/providers.md#gemini-cli)    | Remote API         | Quota              |
| GitHub Copilot          | [Needs setup](docs/readme/providers.md#github-copilot)         | Remote API         | Budget and usage   |
| Google AGY              | [Needs setup](docs/readme/providers.md#google-agy-quick-setup) | Remote API         | Quota              |
| Google Antigravity      | [Needs setup](docs/readme/providers.md#google-antigravity)     | Remote API         | Quota              |
| NanoGPT                 | Automatic                                                      | Remote API         | Quota and balance  |
| OpenAI                  | Automatic                                                      | Remote API         | Quota              |
| OpenCode Zen            | [Needs setup](docs/readme/providers.md#opencode-zen)           | Dashboard scraping | Budget and balance |
| OpenRouter              | Automatic                                                      | Remote API         | Budget and spend   |
| Synthetic               | Automatic                                                      | Remote API         | Quota              |
| xAI SuperGrok           | Automatic                                                      | Remote API         | Quota              |

Gemini CLI quota support is deprecated for new installs. Existing v4 configurations still work, with removal planned for v5.0.0. See the [provider guide](docs/readme/providers.md#gemini-cli) before choosing a replacement.

</details>

### Pre-configured Chinese providers

<details open>
<summary><strong>Personal</strong></summary>

| Provider                 | Auth/setup                                          | Data from      | Reports            |
| ------------------------ | --------------------------------------------------- | -------------- | ------------------ |
| Alibaba Coding Plan      | Automatic                                           | Local estimate | Quota              |
| DeepSeek                 | Automatic                                           | Remote API     | Balance and status |
| Kimi Code                | Automatic                                           | Remote API     | Quota              |
| MiniMax Coding Plan      | Automatic                                           | Remote API     | Quota              |
| MiniMax Coding Plan (CN) | Automatic                                           | Remote API     | Quota              |
| Qwen Code                | [Needs setup](docs/readme/providers.md#qwen-code)   | Local estimate | Quota              |
| Xiaomi MiMo              | [Needs setup](docs/readme/providers.md#xiaomi-mimo) | Dashboard API  | Quota and balance  |
| Z.ai Coding Plan         | Automatic                                           | Remote API     | Quota              |
| Zhipu Coding Plan        | Automatic                                           | Remote API     | Quota              |

</details>

<details>
<summary><strong>Business / Team</strong></summary>

| Provider                 | Auth/setup | Data from  | Reports |
| ------------------------ | ---------- | ---------- | ------- |
| Kimi Code                | Automatic  | Remote API | Quota   |
| MiniMax Coding Plan      | Automatic  | Remote API | Quota   |
| MiniMax Coding Plan (CN) | Automatic  | Remote API | Quota   |
| Zhipu Coding Plan        | Automatic  | Remote API | Quota   |

These vendors offer team or business plans, but the current integrations report only the configured member API key rather than organization-wide usage.

</details>

### Custom providers

Add a provider that uses a remote quota API or tracks a local usage estimate:

```bash
npx @slkiser/opencode-quota@latest provider add
```

The guided setup previews the change before saving. See the [custom-provider guide](docs/readme/providers.md#custom-providers) for details.

## Troubleshooting

If quota or token data looks wrong:

1. Run `/quota_status` in OpenCode, or `opencode-quota status` from a terminal for the same diagnostics. Use `opencode-quota show` for a quick quota glance.
2. Confirm the expected provider appears in the detected provider list.
3. Confirm companion auth plugins are before `@slkiser/opencode-quota` in `opencode.json`.
4. If token reports are empty, start OpenCode once so it creates `opencode.db`, then run a session with model usage.
5. Check [Troubleshooting](docs/readme/troubleshooting.md) for common symptoms and provider-specific fixes.

## Reference

Project guides:

- [Manual install](docs/readme/manual-install.md)
- [Configuration](docs/readme/configuration.md)
- [Providers](docs/readme/providers.md)
- [Troubleshooting](docs/readme/troubleshooting.md)
- [External integration](docs/readme/external-integration.md)

External references:

- [OpenCode docs](https://opencode.ai/docs/)
- [OpenCode config](https://opencode.ai/docs/config/)
- [OpenCode plugins](https://opencode.ai/docs/plugins/)
- [OpenCode TUI](https://opencode.ai/docs/tui/)
- [models.dev pricing data](https://models.dev/)
- [Node.js downloads](https://nodejs.org/en/download)

## Contributors

The upstream project's contributors built the base this fork stands on — thank you.

<a href="https://github.com/slkiser/opencode-quota/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=slkiser/opencode-quota" />
</a>

## License

MIT

## Remarks

OpenCode Quota Plus is not built by the OpenCode team and is not affiliated with OpenCode, upstream OpenCode Quota, or any provider listed above.
