# S2B Session Sidebar — Design Spec

**Date:** 2026-09-27
**Status:** Approved (design). Implementation pending plan.
**Target:** `Direct-Launch/smart-second-brain`, branch `feat/session-sidebar` → PR into fork `main`.

## Goal

Near 1:1 replication of the **Claudian** plugin's chat-sessions sidebar inside Smart Second Brain (S2B). An in-leaf, resizable panel that lists all chat sessions with Pinned/Archived sections, search, sort, and per-row actions (open, rename, delete, pin, archive, restore).

## Decisions (approved)

1. **Placement:** in-leaf dual-pane (true 1:1), not a separate Obsidian leaf.
2. **Scope:** full parity including Pinned + Archived sections.
3. **Excluded:** Claudian's linked-content grouping (S2B has no linked-content concept).

## What already exists in S2B (reuse — no new persistence)

- **Storage:** one gzipped-JSON `.chat` file per conversation in `targetFolder` (default `Chats/`). `ThreadData` codec at `src/agent/threadDataCodec.ts` (`THREAD_DATA_VERSION = 2`). `ThreadData.metadata: Record<string, unknown>` is a free-form, persisted bag.
- **Index:** `ThreadSnapshot { threadId, title?, metadata?, createdAt, updatedAt }` (`src/agent/memory/ThreadStore.ts`). `ObsidianChatManager` keeps `threadIndex` (rebuilt from folder), `listThreads()` returns snapshots sorted by `updatedAt` desc.
- **CRUD on `AgentManager`:** `getAllThreads()` / `listThreads()`, `createNewChat()`, `deleteThread()`, `renameThread()`, `openChatByThreadId(id)`, `openInChatLeaf(file)`, `openLatestChat()`.
- **Live sessions:** `SessionRegistry` (`src/stores/chatStore.svelte.ts`) — `SvelteMap<threadPath, ChatSession>`, derived running-set, LRU parking. Per-tab active thread via `src/views/chat/threadPathStore.svelte.ts` (`ThreadPathStore.current`).
- **View:** `ChatView extends FileView`, `VIEW_TYPE_CHAT = "smart-second-brain-chat"`, mounts `Chat.svelte` (`<div class="chat-root ...">` → `<MessageContainer>` + `<Input>`). `chatOpenLocation` = tab|left|right.
- **Existing session actions:** rename/delete via file-menu/command; `new-chat` command + ribbon; vault create/delete/rename events already rekey caches.

## What to build

### A. Reactive index — `ThreadIndexStore`
`getAllThreads()` is a non-reactive snapshot. Add a Svelte `$state` store holding the current sorted `ThreadSnapshot[]`, rebuilt on:
- `.chat` file create/delete/rename (subscribe to the vault events already wired in `main.ts` / `ObsidianChatManager`).
- pin/archive metadata changes (see B).

The sidebar components subscribe to this store so all in-leaf copies stay in sync.

### B. Pinned / Archived — plugin-data-backed, no codec migration
**Storage location decided during planning:** `rebuildIndex()`/`listThreads()` only `stat` files and derive the title from the filename — they **never load per-thread `metadata`**. Storing flags in `ThreadData.metadata` would force gunzipping every `.chat` file to render the list. Instead, store flags in **plugin data**:
- `PluginData.sessionFlags: Record<threadPath, { pinned?: boolean; pinnedAt?: number; archived?: boolean }>` — O(1) whole-list read, migrated on rename, removed on delete. No codec touch.

Add to `AgentManager`:
- `setThreadPinned(id, boolean)` — delegates to the data store's flag helper.
- `setThreadArchived(id, boolean): boolean` — **guard: refuse to archive a session currently running** (check `SessionRegistry`), surface `new Notice(...)` and return `false`. Matches Claudian.

The sidebar store merges `getAllThreads()` snapshots with `getData().getSessionFlags(id)`.

### C. Sidebar UI (Svelte, in-leaf)
Mounted inside `Chat.svelte` as `[sidebar][resizer][chat surface]`, order flipped by `sessionSidebarSide`.

- **Reveal rule:** show panel when container width ≥ **600px**; below that render a **dropdown fallback** in the input row (Claudian parity).
- **Sections:** `Pinned` (max-height 50%, own scroll) + `Sessions`; an **Archived** toggle swaps the sessions section for archived items with a **Restore** action. Sort control: `last-updated` (default) | `created`.
- **Row:** title + relative date. Running spinner from `SessionRegistry`. Hover-revealed inline actions: **pin/unpin, archive, rename, delete** (archive→**restore** in archive view). Click row → `openChatByThreadId`; active row highlighted vs `ThreadPathStore.current`.
- **Search:** `type="search"` input, filters snapshot titles; empty states "No matching sessions" / "No conversations".
- **New:** `+ New` → `createNewChat()`.
- **Pagination:** `Load more (N remaining)` with a visible-count.
- **Metadata popover** (hover): **deferred to a fast-follow** — S2B stores no per-thread message count/usage (would need a per-thread gunzip), so the v1 diff stays focused on the approved core.
- Rename = inline edit; delete = confirm. Reuse existing `renameThread`/`deleteThread` + prompt/confirm helpers.

### D. Resize
CSS var `--s2b-session-sidebar-width`, default **240**, clamp **[180, containerWidth − 325]** (320 reserved for chat + 5 resizer). Pointer drag on `.s2b-session-resizer` (`role="separator"`); keyboard Arrow steps **16px**; direction flips with side. Body gets a `resizing` class during drag. Width **persisted** to plugin data (single global value).

### E. Settings
Add to the plugin data store: `enableSessionSidebar: boolean`, `sessionSidebarSide: "left" | "right"`, `sessionManagerSort: "last-updated" | "created"`, `sessionSidebarWidth: number`. Settings-tab controls for each.

### F. Styling
Port Claudian's CSS into `src/styles.css` under `s2b-`-prefixed classes, using Obsidian theme vars (`--background-modifier-hover`, `--interactive-accent`, `--text-*`, `--color-red`) so it themes automatically. Spinner + attention-pulse keyframes.

## Accepted trade-offs / risks

- **List duplication:** in-leaf placement means each open chat tab renders its own sidebar copy. Mitigated by the shared `ThreadIndexStore` (content stays in sync); DOM is repeated. Inherent to the 1:1 in-leaf choice.
- **Metadata-popover fidelity:** popover contents limited to what S2B tracks; may differ from Claudian's token usage.
- **Fork drift:** DL fork `main` is behind upstream (~2 weeks). Building on fork `main` per instruction; not merging upstream in this PR.

## Testing

Vitest (`vitest run`):
- `ThreadIndexStore` rebuilds on create/delete/rename and pin/archive.
- sort + title-filter logic (pure functions, extracted).
- pin/archive metadata **round-trip through the codec**.
- archive-guard-when-running returns error / no-op.

`npm run check` (svelte-check) + `npm run lint` (biome) must pass.

## Out of scope (fast-follow candidates)

- Linked-content grouping.
- Cross-device pin/archive reconciliation beyond what metadata sync gives for free.
