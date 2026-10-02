# S2B Session Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-leaf, resizable session-list sidebar to the S2B chat view — near 1:1 with the Claudian plugin — listing all `.chat` sessions with Pinned/Archived sections, search, sort, and per-row actions (open, rename, delete, pin, archive, restore).

**Architecture:** The sidebar renders inside `Chat.svelte` as a flex-row sibling of the existing chat column (`[sidebar][resizer][chat]`, order flipped by a setting), revealed at container width ≥600px with a dropdown fallback below. Session list data comes from the existing `AgentManager.getAllThreads()` (returns `ThreadSnapshot[]`, title from filename, sorted newest-first). Pin/archive flags live in **plugin data** (`sessionFlags` map) — NOT in the `.chat` codec — because the thread index never loads per-file metadata; the sidebar store merges snapshots with flags. A reactive `SessionSidebarStore` re-reads the list on `.chat` create/delete/rename events (debounced).

**Tech Stack:** Svelte 5 (runes: `$state`/`$derived`/`$props`, `mount()`), TypeScript, Obsidian API, Tailwind + `src/styles.css`, Vitest (jsdom, `obsidian` mocked), Biome, svelte-check.

**Spec:** `docs/superpowers/specs/2026-09-27-s2b-session-sidebar-design.md`

## Global Constraints

- Base branch: `feat/session-sidebar` off `Direct-Launch/smart-second-brain` `main`. PR target: fork `main`.
- No `THREAD_DATA_VERSION` bump; do not modify `threadDataCodec.ts` serialization.
- Reuse existing `AgentManager` methods for open/new/rename/delete — do not reimplement thread CRUD.
- Settings are added via: field on `PluginData` (`src/types/plugin.ts`) + default in `DEFAULT_SETTINGS` (`src/stores/dataStore.svelte.ts`) + getter/setter pair (setter calls `saveSettings()`) + a `SettingItem` control in a settings `.svelte`.
- `getData()` (from `src/stores/dataStore.svelte`) returns the settings singleton. `getPlugin()` (from `src/stores/state.svelte`) returns the plugin. `getSessionRegistry()` (from `src/stores/chatStore.svelte`) returns `SessionRegistry | null` — always null-check.
- Tests: `vitest run`; mock via `vi.mock("obsidian", () => import("../__mocks__/obsidian"))`; tests live under `test/` mirroring `src/`. Must also pass `npm run check` (svelte-check) and `npm run lint` (biome).
- CSS classes prefixed `s2b-session-`, using Obsidian theme vars (`--background-modifier-hover`, `--interactive-accent`, `--text-*`, `--color-red`).

---

### Task 1: Session flags storage (plugin data)

Pin/archive flags, keyed by thread path, persisted in plugin data. Whole-list read is O(1); no codec touch.

**Files:**
- Modify: `src/types/plugin.ts` (add `SessionFlags` type + `sessionFlags` field to `PluginData`)
- Modify: `src/stores/dataStore.svelte.ts` (default + getter + mutation helpers)
- Test: `test/stores/sessionFlags.test.ts`

**Interfaces:**
- Produces:
  - `interface SessionFlags { pinned?: boolean; pinnedAt?: number; archived?: boolean }`
  - `PluginData.sessionFlags: Record<string, SessionFlags>`
  - On the data store class: `getSessionFlags(path: string): SessionFlags` (returns `{}` if absent), `setSessionPinned(path: string, pinned: boolean): void`, `setSessionArchived(path: string, archived: boolean): void`, `renameSessionFlags(oldPath: string, newPath: string): void`, `removeSessionFlags(path: string): void`. Each mutation calls `saveSettings()`.

- [ ] **Step 1: Write failing test** — `test/stores/sessionFlags.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("obsidian", () => import("../__mocks__/obsidian"));

// Minimal harness: exercise flag helpers against a plain data object.
import { DataStore } from "../../src/stores/dataStore.svelte";

function makeStore() {
	const plugin = { saveData: vi.fn().mockResolvedValue(undefined) } as any;
	const store = new DataStore(plugin);
	return { store, plugin };
}

describe("sessionFlags", () => {
	let store: DataStore;
	let plugin: any;
	beforeEach(() => { ({ store, plugin } = makeStore()); });

	it("defaults to empty flags", () => {
		expect(store.getSessionFlags("Chats/a.chat")).toEqual({});
	});
	it("sets pinned with pinnedAt and persists", () => {
		store.setSessionPinned("Chats/a.chat", true);
		const f = store.getSessionFlags("Chats/a.chat");
		expect(f.pinned).toBe(true);
		expect(typeof f.pinnedAt).toBe("number");
		expect(plugin.saveData).toHaveBeenCalled();
	});
	it("unpin clears pinnedAt", () => {
		store.setSessionPinned("Chats/a.chat", true);
		store.setSessionPinned("Chats/a.chat", false);
		expect(store.getSessionFlags("Chats/a.chat").pinned).toBe(false);
	});
	it("archive toggles independently of pin", () => {
		store.setSessionPinned("Chats/a.chat", true);
		store.setSessionArchived("Chats/a.chat", true);
		const f = store.getSessionFlags("Chats/a.chat");
		expect(f.pinned).toBe(true);
		expect(f.archived).toBe(true);
	});
	it("rename migrates the key", () => {
		store.setSessionPinned("Chats/a.chat", true);
		store.renameSessionFlags("Chats/a.chat", "Chats/b.chat");
		expect(store.getSessionFlags("Chats/a.chat")).toEqual({});
		expect(store.getSessionFlags("Chats/b.chat").pinned).toBe(true);
	});
	it("remove deletes the key", () => {
		store.setSessionArchived("Chats/a.chat", true);
		store.removeSessionFlags("Chats/a.chat");
		expect(store.getSessionFlags("Chats/a.chat")).toEqual({});
	});
});
```

> Note: confirm the exported class name of the data store (the extraction showed `getData()` returns a singleton; find the class — likely `DataStore`/`PluginDataStore`). If it is not directly newable in a test, test the helpers via the singleton `getData()` after `vi.mock`ing `saveData`. Adjust imports to the real class name; do not invent one.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run test/stores/sessionFlags.test.ts`
Expected: FAIL (`getSessionFlags` not a function / `sessionFlags` undefined).

- [ ] **Step 3: Add the type** — `src/types/plugin.ts`

```ts
export interface SessionFlags {
	pinned?: boolean;
	pinnedAt?: number;
	archived?: boolean;
}
```
Add to the `PluginData` interface (near `chatOpenLocation`):
```ts
	sessionFlags: Record<string, SessionFlags>;
```

- [ ] **Step 4: Default + helpers** — `src/stores/dataStore.svelte.ts`

Add to `DEFAULT_SETTINGS`:
```ts
	sessionFlags: {},
```
Add methods on the data store class (mirror the existing getter/setter style; `this.#data` is the backing object, `this.saveSettings()` persists):
```ts
	getSessionFlags(path: string): SessionFlags {
		return this.#data.sessionFlags?.[path] ?? {};
	}
	setSessionPinned(path: string, pinned: boolean): void {
		if (!this.#data.sessionFlags) this.#data.sessionFlags = {};
		const cur = this.#data.sessionFlags[path] ?? {};
		this.#data.sessionFlags[path] = pinned
			? { ...cur, pinned: true, pinnedAt: cur.pinnedAt ?? Date.now() }
			: { ...cur, pinned: false, pinnedAt: undefined };
		void this.saveSettings();
	}
	setSessionArchived(path: string, archived: boolean): void {
		if (!this.#data.sessionFlags) this.#data.sessionFlags = {};
		const cur = this.#data.sessionFlags[path] ?? {};
		this.#data.sessionFlags[path] = { ...cur, archived };
		void this.saveSettings();
	}
	renameSessionFlags(oldPath: string, newPath: string): void {
		const flags = this.#data.sessionFlags?.[oldPath];
		if (!flags) return;
		if (!this.#data.sessionFlags) this.#data.sessionFlags = {};
		this.#data.sessionFlags[newPath] = flags;
		delete this.#data.sessionFlags[oldPath];
		void this.saveSettings();
	}
	removeSessionFlags(path: string): void {
		if (this.#data.sessionFlags?.[path]) {
			delete this.#data.sessionFlags[path];
			void this.saveSettings();
		}
	}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run test/stores/sessionFlags.test.ts` → PASS. Then `npm run check`.

- [ ] **Step 6: Commit**

```bash
git add src/types/plugin.ts src/stores/dataStore.svelte.ts test/stores/sessionFlags.test.ts
git commit -m "feat(sessions): plugin-data-backed pin/archive flags"
```

---

### Task 2: AgentManager pin/archive with running-guard

Public API the sidebar calls; archive refused while a session is running (Claudian parity).

**Files:**
- Modify: `src/agent/AgentManager.ts` (add two methods)
- Test: `test/agent/sessionFlagsGuard.test.ts`

**Interfaces:**
- Consumes: data store helpers from Task 1; `getSessionRegistry()` from `src/stores/chatStore.svelte`; `getData()` from `src/stores/dataStore.svelte`.
- Produces (on `AgentManager`):
  - `setThreadPinned(threadId: string, pinned: boolean): void`
  - `setThreadArchived(threadId: string, archived: boolean): boolean` — returns `false` (and shows a `Notice`) if archiving a running session; `true` on success.

- [ ] **Step 1: Write failing test** — `test/agent/sessionFlagsGuard.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("obsidian", () => import("../__mocks__/obsidian"));

const flags = { setSessionArchived: vi.fn(), setSessionPinned: vi.fn() };
vi.mock("../../src/stores/dataStore.svelte", () => ({
	getData: () => flags,
}));
const registry = { sessionFor: vi.fn() };
vi.mock("../../src/stores/chatStore.svelte", async (orig) => ({
	...(await orig<any>()),
	getSessionRegistry: () => registry,
}));

import { AgentManager } from "../../src/agent/AgentManager";

describe("setThreadArchived guard", () => {
	let mgr: AgentManager;
	beforeEach(() => {
		vi.clearAllMocks();
		mgr = new AgentManager({} as any); // constructor only stores plugin ref
	});
	it("archives when not running", () => {
		registry.sessionFor.mockReturnValue({ isRunning: false });
		expect(mgr.setThreadArchived("Chats/a.chat", true)).toBe(true);
		expect(flags.setSessionArchived).toHaveBeenCalledWith("Chats/a.chat", true);
	});
	it("refuses to archive a running session", () => {
		registry.sessionFor.mockReturnValue({ isRunning: true });
		expect(mgr.setThreadArchived("Chats/a.chat", true)).toBe(false);
		expect(flags.setSessionArchived).not.toHaveBeenCalled();
	});
	it("restore (archived=false) is allowed while running", () => {
		registry.sessionFor.mockReturnValue({ isRunning: true });
		expect(mgr.setThreadArchived("Chats/a.chat", false)).toBe(true);
		expect(flags.setSessionArchived).toHaveBeenCalledWith("Chats/a.chat", false);
	});
});
```

> If `new AgentManager({})` does heavy work in the constructor (it builds `ObsidianChatManager`), instead cast a minimal object with the methods under test, or extract the two methods to only touch `getData()`/`getSessionRegistry()` (they should). Keep the constructor untouched; adjust the test harness to the real constructor needs.

- [ ] **Step 2: Run test, verify fails** — `npx vitest run test/agent/sessionFlagsGuard.test.ts` → FAIL (methods undefined).

- [ ] **Step 3: Implement** — `src/agent/AgentManager.ts`

Add imports if missing: `import { Notice } from "obsidian";`, `import { getSessionRegistry } from "../stores/chatStore.svelte";`, `import { getData } from "../stores/dataStore.svelte";`. Add methods to the class:
```ts
	setThreadPinned(threadId: string, pinned: boolean): void {
		getData().setSessionPinned(threadId, pinned);
	}

	setThreadArchived(threadId: string, archived: boolean): boolean {
		if (archived) {
			const running = getSessionRegistry()?.sessionFor(threadId)?.isRunning;
			if (running) {
				new Notice("Cannot archive a running session");
				return false;
			}
		}
		getData().setSessionArchived(threadId, archived);
		return true;
	}
```

- [ ] **Step 4: Run test, verify pass** — `npx vitest run test/agent/sessionFlagsGuard.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/AgentManager.ts test/agent/sessionFlagsGuard.test.ts
git commit -m "feat(sessions): AgentManager pin/archive with running-guard"
```

---

### Task 3: Sidebar list logic (pure functions)

Sort, filter, and section-partition — pure and fully tested. The store (Task 4) and view (Task 5) consume these.

**Files:**
- Create: `src/stores/session-sidebar/logic.ts`
- Test: `test/stores/sessionSidebarLogic.test.ts`

**Interfaces:**
- Consumes: `ThreadSnapshot` (`src/agent/memory/ThreadStore`), `SessionFlags` (`src/types/plugin`).
- Produces:
```ts
export type SortMode = "last-updated" | "created";
export interface SessionRow {
	threadId: string;
	title: string;          // snapshot.title ?? "New conversation"
	createdAt: number;
	updatedAt: number;
	pinned: boolean;
	pinnedAt: number;
	archived: boolean;
}
export interface SessionSections { pinned: SessionRow[]; active: SessionRow[]; archived: SessionRow[] }

export function toRows(snapshots: ThreadSnapshot[], flagsFor: (id: string) => SessionFlags): SessionRow[];
export function sortRows(rows: SessionRow[], mode: SortMode): SessionRow[];   // desc; pinned section sorts by pinnedAt desc
export function filterRows(rows: SessionRow[], query: string): SessionRow[];  // case-insensitive title contains
export function partition(rows: SessionRow[]): SessionSections;               // pinned(non-archived) / active(non-archived,non-pinned) / archived
```

- [ ] **Step 1: Write failing test** — `test/stores/sessionSidebarLogic.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toRows, sortRows, filterRows, partition } from "../../src/stores/session-sidebar/logic";

const snap = (id: string, c: number, u: number, title?: string) => ({ threadId: id, title, createdAt: c, updatedAt: u });

describe("session sidebar logic", () => {
	it("toRows applies flags and title fallback", () => {
		const rows = toRows([snap("a.chat", 1, 2)], () => ({ pinned: true, pinnedAt: 5 }));
		expect(rows[0]).toMatchObject({ threadId: "a.chat", title: "New conversation", pinned: true, pinnedAt: 5, archived: false });
	});
	it("sortRows last-updated desc", () => {
		const rows = toRows([snap("a", 1, 10), snap("b", 1, 20)], () => ({}));
		expect(sortRows(rows, "last-updated").map(r => r.threadId)).toEqual(["b", "a"]);
	});
	it("sortRows created desc", () => {
		const rows = toRows([snap("a", 30, 1), snap("b", 10, 1)], () => ({}));
		expect(sortRows(rows, "created").map(r => r.threadId)).toEqual(["a", "b"]);
	});
	it("filterRows matches title case-insensitively", () => {
		const rows = toRows([snap("a", 1, 1, "Hello World"), snap("b", 1, 1, "Other")], () => ({}));
		expect(filterRows(rows, "hello").map(r => r.threadId)).toEqual(["a"]);
	});
	it("partition splits pinned/active/archived; archived beats pinned", () => {
		const rows = toRows(
			[snap("p", 1, 1), snap("a", 1, 1), snap("z", 1, 1)],
			(id) => id === "p" ? { pinned: true, pinnedAt: 9 } : id === "z" ? { pinned: true, archived: true } : {},
		);
		const s = partition(rows);
		expect(s.pinned.map(r => r.threadId)).toEqual(["p"]);
		expect(s.active.map(r => r.threadId)).toEqual(["a"]);
		expect(s.archived.map(r => r.threadId)).toEqual(["z"]);
	});
});
```

- [ ] **Step 2: Run, verify fails** — `npx vitest run test/stores/sessionSidebarLogic.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/stores/session-sidebar/logic.ts`

```ts
import type { ThreadSnapshot } from "../../agent/memory/ThreadStore";
import type { SessionFlags } from "../../types/plugin";

export type SortMode = "last-updated" | "created";

export interface SessionRow {
	threadId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	pinned: boolean;
	pinnedAt: number;
	archived: boolean;
}
export interface SessionSections { pinned: SessionRow[]; active: SessionRow[]; archived: SessionRow[] }

export function toRows(snapshots: ThreadSnapshot[], flagsFor: (id: string) => SessionFlags): SessionRow[] {
	return snapshots.map((s) => {
		const f = flagsFor(s.threadId);
		return {
			threadId: s.threadId,
			title: s.title ?? "New conversation",
			createdAt: s.createdAt,
			updatedAt: s.updatedAt,
			pinned: !!f.pinned,
			pinnedAt: f.pinnedAt ?? 0,
			archived: !!f.archived,
		};
	});
}

export function sortRows(rows: SessionRow[], mode: SortMode): SessionRow[] {
	const key = mode === "created" ? (r: SessionRow) => r.createdAt : (r: SessionRow) => r.updatedAt;
	return [...rows].sort((a, b) => key(b) - key(a));
}

export function filterRows(rows: SessionRow[], query: string): SessionRow[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((r) => r.title.toLowerCase().includes(q));
}

export function partition(rows: SessionRow[]): SessionSections {
	const pinned: SessionRow[] = [];
	const active: SessionRow[] = [];
	const archived: SessionRow[] = [];
	for (const r of rows) {
		if (r.archived) archived.push(r);
		else if (r.pinned) pinned.push(r);
		else active.push(r);
	}
	pinned.sort((a, b) => b.pinnedAt - a.pinnedAt);
	return { pinned, active, archived };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/stores/sessionSidebarLogic.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/session-sidebar/logic.ts test/stores/sessionSidebarLogic.test.ts
git commit -m "feat(sessions): pure sort/filter/partition logic"
```

---

### Task 4: Reactive SessionSidebarStore

Holds the live snapshot list, refreshes on `.chat` vault events (debounced), and exposes reactive derived sections.

**Files:**
- Create: `src/stores/session-sidebar/sessionSidebarStore.svelte.ts`
- Test: `test/stores/sessionSidebarStore.test.ts`

**Interfaces:**
- Consumes: `AgentManager.getAllThreads()`; `getData().getSessionFlags`; `logic.ts`; Obsidian `Plugin.registerEvent` + `vault.on`.
- Produces:
```ts
export class SessionSidebarStore {
	rows: SessionRow[];                 // $state, raw (unsorted/unfiltered)
	init(plugin: SecondBrainPlugin): void;   // registers vault listeners, kicks first refresh
	refresh(): Promise<void>;           // re-read getAllThreads + merge flags
	dispose(): void;
}
export function getSessionSidebarStore(): SessionSidebarStore;   // singleton
```

- [ ] **Step 1: Write failing test** — `test/stores/sessionSidebarStore.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("obsidian", () => import("../__mocks__/obsidian"));

const getAllThreads = vi.fn();
const flags = { getSessionFlags: vi.fn(() => ({})) };
vi.mock("../../src/stores/state.svelte", () => ({
	getPlugin: () => ({ agentManager: { getAllThreads } }),
}));
vi.mock("../../src/stores/dataStore.svelte", () => ({ getData: () => flags }));

import { getSessionSidebarStore } from "../../src/stores/session-sidebar/sessionSidebarStore.svelte";

describe("SessionSidebarStore", () => {
	beforeEach(() => vi.clearAllMocks());
	it("refresh loads rows from getAllThreads and merges flags", async () => {
		getAllThreads.mockResolvedValue([{ threadId: "a.chat", title: "A", createdAt: 1, updatedAt: 2 }]);
		flags.getSessionFlags.mockReturnValue({ pinned: true, pinnedAt: 7 });
		const store = getSessionSidebarStore();
		await store.refresh();
		expect(store.rows).toHaveLength(1);
		expect(store.rows[0]).toMatchObject({ threadId: "a.chat", title: "A", pinned: true });
	});
	it("registers a delete+rename+create listener on init", () => {
		const registerEvent = vi.fn();
		const on = vi.fn(() => ({}));
		const plugin: any = { registerEvent, app: { vault: { on } }, agentManager: { getAllThreads } };
		getAllThreads.mockResolvedValue([]);
		getSessionSidebarStore().init(plugin);
		const events = on.mock.calls.map((c) => c[0]);
		expect(events).toEqual(expect.arrayContaining(["create", "delete", "rename"]));
	});
});
```

- [ ] **Step 2: Run, verify fails** — `npx vitest run test/stores/sessionSidebarStore.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/stores/session-sidebar/sessionSidebarStore.svelte.ts`

```ts
import { TFile, type Plugin, debounce } from "obsidian";
import { getPlugin } from "../state.svelte";
import { getData } from "../dataStore.svelte";
import { toRows, type SessionRow } from "./logic";

export class SessionSidebarStore {
	rows = $state<SessionRow[]>([]);
	#refreshDebounced = debounce(() => void this.refresh(), 150, false);

	async refresh(): Promise<void> {
		const snapshots = await getPlugin().agentManager.getAllThreads();
		this.rows = toRows(snapshots, (id) => getData().getSessionFlags(id));
	}

	init(plugin: Plugin): void {
		const isChat = (f: unknown): f is TFile => f instanceof TFile && f.extension === "chat";
		// ponytail: full re-read per .chat change; O(n) but n = chat count, fine for realistic vaults.
		plugin.registerEvent(plugin.app.vault.on("create", (f) => { if (isChat(f)) this.#refreshDebounced(); }));
		plugin.registerEvent(plugin.app.vault.on("delete", (f) => { if (isChat(f)) this.#refreshDebounced(); }));
		plugin.registerEvent(plugin.app.vault.on("rename", (f) => { if (isChat(f)) this.#refreshDebounced(); }));
		void this.refresh();
	}

	dispose(): void {
		this.rows = [];
	}
}

let singleton: SessionSidebarStore | null = null;
export function getSessionSidebarStore(): SessionSidebarStore {
	if (!singleton) singleton = new SessionSidebarStore();
	return singleton;
}
```

> `debounce` is Obsidian's exported util (already used in `ObsidianChatManager`). If `$state` at class-field scope in a `.svelte.ts` file needs the file to be compiled by the Svelte plugin, confirm other `*.svelte.ts` stores use the same pattern (they do — `chatStore.svelte.ts`). The test mocks `obsidian`, so `debounce` resolves to the mock; ensure the mock exports a passthrough `debounce`. If not present in `test/__mocks__/obsidian.ts`, add `export const debounce = (fn: any) => fn;` there.

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/stores/sessionSidebarStore.test.ts` → PASS. Then `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add src/stores/session-sidebar/sessionSidebarStore.svelte.ts test/stores/sessionSidebarStore.test.ts test/__mocks__/obsidian.ts
git commit -m "feat(sessions): reactive session sidebar store"
```

---

### Task 5: Sidebar Svelte components + resize

The panel UI. Pure-view Svelte; correctness gate is `npm run check` + the extracted resize-clamp unit test. Rows/sections use Task 3 logic; actions call Task 2 + `AgentManager`.

**Files:**
- Create: `src/components/chat/session-sidebar/SessionSidebar.svelte`
- Create: `src/components/chat/session-sidebar/SessionSidebarItem.svelte`
- Create: `src/components/chat/session-sidebar/resize.ts` (pure clamp) + Svelte action
- Test: `test/components/sessionResize.test.ts`

**Interfaces:**
- Consumes: `getSessionSidebarStore()`, `sortRows`/`filterRows`/`partition` (Task 3), `getPlugin().agentManager` (`openChatByThreadId`, `createNewChat`, `renameThread`, `deleteThread`, `setThreadPinned`, `setThreadArchived`), `getSessionRegistry()` for running state, `getData()` for `sessionManagerSort`/`sessionSidebarWidth` (Task 6), `setIcon` from obsidian, `threadPath` prop for active highlight.
- Produces: `<SessionSidebar {threadPath} />` default export; `clampSidebarWidth(desired, containerWidth, side)` from `resize.ts`.

- [ ] **Step 1: Write failing test for clamp** — `test/components/sessionResize.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { clampSidebarWidth } from "../../src/components/chat/session-sidebar/resize";

describe("clampSidebarWidth", () => {
	it("clamps to min 180", () => {
		expect(clampSidebarWidth(50, 1000, "right")).toBe(180);
	});
	it("clamps to max containerWidth - 325", () => {
		expect(clampSidebarWidth(999, 600, "right")).toBe(275); // 600 - 325
	});
	it("passes through a valid width", () => {
		expect(clampSidebarWidth(300, 1000, "right")).toBe(300);
	});
	it("never returns below min even when container is tiny", () => {
		expect(clampSidebarWidth(300, 400, "left")).toBe(180); // max would be 75 < 180 -> min wins
	});
});
```

- [ ] **Step 2: Run, verify fails** — `npx vitest run test/components/sessionResize.test.ts` → FAIL.

- [ ] **Step 3: Implement `resize.ts`**

```ts
export type SidebarSide = "left" | "right";
export const SIDEBAR_MIN = 180;
export const CHAT_RESERVED = 325; // 320 chat + 5 resizer

export function clampSidebarWidth(desired: number, containerWidth: number, _side: SidebarSide): number {
	const max = containerWidth - CHAT_RESERVED;
	const upper = Math.max(SIDEBAR_MIN, max);
	return Math.min(Math.max(desired, SIDEBAR_MIN), upper);
}

// Svelte action: pointer + keyboard resize on the divider element.
export function sessionResizer(
	node: HTMLElement,
	opts: { getWidth: () => number; setWidth: (w: number) => void; getContainerWidth: () => number; side: SidebarSide },
) {
	let startX = 0;
	let startW = 0;
	const onMove = (e: PointerEvent) => {
		const dir = opts.side === "left" ? 1 : -1;
		const next = clampSidebarWidth(startW + (e.clientX - startX) * dir, opts.getContainerWidth(), opts.side);
		opts.setWidth(next);
	};
	const onUp = () => {
		document.body.classList.remove("s2b-resizing-session-sidebar");
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
	};
	const onDown = (e: PointerEvent) => {
		startX = e.clientX; startW = opts.getWidth();
		document.body.classList.add("s2b-resizing-session-sidebar");
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		e.preventDefault();
	};
	const onKey = (e: KeyboardEvent) => {
		const step = 16;
		const dir = opts.side === "left" ? 1 : -1;
		if (e.key === "ArrowLeft") opts.setWidth(clampSidebarWidth(opts.getWidth() - step * dir, opts.getContainerWidth(), opts.side));
		else if (e.key === "ArrowRight") opts.setWidth(clampSidebarWidth(opts.getWidth() + step * dir, opts.getContainerWidth(), opts.side));
		else return;
		e.preventDefault();
	};
	node.addEventListener("pointerdown", onDown);
	node.addEventListener("keydown", onKey);
	return { destroy() { node.removeEventListener("pointerdown", onDown); node.removeEventListener("keydown", onKey); onUp(); } };
}
```

- [ ] **Step 4: Run clamp test, verify pass** — `npx vitest run test/components/sessionResize.test.ts` → PASS.

- [ ] **Step 5: Implement `SessionSidebarItem.svelte`**

```svelte
<script lang="ts">
	import { setIcon } from "obsidian";
	import type { SessionRow } from "../../../stores/session-sidebar/logic";

	interface Props {
		row: SessionRow;
		active: boolean;
		running: boolean;
		archivedView: boolean;
		onOpen: () => void;
		onRename: () => void;
		onDelete: () => void;
		onTogglePin: () => void;
		onToggleArchive: () => void;
	}
	const { row, active, running, archivedView, onOpen, onRename, onDelete, onTogglePin, onToggleArchive }: Props = $props();

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return { update: (n: string) => setIcon(node, n) };
	}
	const dateStr = $derived(new Date(row.updatedAt).toLocaleDateString());
</script>

<div class="s2b-session-item" class:active class:running>
	<button class="s2b-session-item-content" onclick={onOpen} type="button">
		{#if running}<span class="s2b-session-item-spinner" use:icon={"loader-2"}></span>{/if}
		<span class="s2b-session-item-title">{row.title}</span>
		<span class="s2b-session-item-date">{dateStr}</span>
	</button>
	<div class="s2b-session-item-actions">
		{#if archivedView}
			<button class="s2b-session-action" aria-label="Restore" onclick={onToggleArchive} type="button"><span use:icon={"undo-2"}></span></button>
		{:else}
			<button class="s2b-session-action" aria-label={row.pinned ? "Unpin" : "Pin"} onclick={onTogglePin} type="button"><span use:icon={row.pinned ? "pin-off" : "pin"}></span></button>
			<button class="s2b-session-action" aria-label={running ? "Cannot archive a running session" : "Archive"} disabled={running} onclick={onToggleArchive} type="button"><span use:icon={"archive"}></span></button>
			<button class="s2b-session-action" aria-label="Rename" onclick={onRename} type="button"><span use:icon={"pencil"}></span></button>
		{/if}
		<button class="s2b-session-action s2b-session-delete" aria-label="Delete" onclick={onDelete} type="button"><span use:icon={"trash-2"}></span></button>
	</div>
</div>
```

- [ ] **Step 6: Implement `SessionSidebar.svelte`**

```svelte
<script lang="ts">
	import { setIcon, Notice } from "obsidian";
	import { getPlugin } from "../../../stores/state.svelte";
	import { getData } from "../../../stores/dataStore.svelte";
	import { getSessionRegistry } from "../../../stores/chatStore.svelte";
	import { getSessionSidebarStore } from "../../../stores/session-sidebar/sessionSidebarStore.svelte";
	import { sortRows, filterRows, partition, type SortMode } from "../../../stores/session-sidebar/logic";
	import SessionSidebarItem from "./SessionSidebarItem.svelte";

	interface Props { threadPath: string | null }
	const { threadPath }: Props = $props();

	const plugin = getPlugin();
	const store = getSessionSidebarStore();
	const registry = getSessionRegistry();
	const data = getData();

	let query = $state("");
	let showArchived = $state(false);
	let visibleCount = $state(50);

	const sortMode = $derived<SortMode>(data.sessionManagerSort);
	const filtered = $derived(filterRows(sortRows(store.rows, sortMode), query));
	const sections = $derived(partition(filtered));
	const listRows = $derived(showArchived ? sections.archived : sections.active);
	const visibleRows = $derived(listRows.slice(0, visibleCount));
	const remaining = $derived(Math.max(0, listRows.length - visibleCount));

	const isRunning = (id: string) => !!registry?.sessionFor(id)?.isRunning;

	async function newChat() { await plugin.agentManager.createNewChat(); }
	async function open(id: string) { await plugin.agentManager.openChatByThreadId(id); }
	async function del(id: string) {
		if (confirm("Delete this chat?")) await plugin.agentManager.deleteThread(id);
	}
	async function rename(id: string, title: string) {
		const next = prompt("Rename chat", title);
		if (next && next !== title) await plugin.agentManager.renameThread(id, next);
	}
	function togglePin(id: string, pinned: boolean) { plugin.agentManager.setThreadPinned(id, !pinned); store.refresh(); }
	function toggleArchive(id: string, archived: boolean) {
		const ok = plugin.agentManager.setThreadArchived(id, !archived);
		if (ok) store.refresh();
	}
	function iconAction(node: HTMLElement, name: string) { setIcon(node, name); return {}; }
</script>

<div class="s2b-session-sidebar">
	<div class="s2b-session-section-header">
		<button class="s2b-session-new" onclick={newChat} type="button"><span use:iconAction={"plus"}></span> New chat</button>
		<button class="s2b-session-archive-toggle" onclick={() => (showArchived = !showArchived)} type="button">
			<span use:iconAction={showArchived ? "message-square" : "archive"}></span>
		</button>
	</div>
	<div class="s2b-session-controls">
		<input class="s2b-session-search" type="search" placeholder={showArchived ? "Search archived sessions" : "Search sessions"} bind:value={query} autocomplete="off" />
		<select class="s2b-session-sort" bind:value={data.sessionManagerSort}>
			<option value="last-updated">Last updated</option>
			<option value="created">Created</option>
		</select>
	</div>

	{#if !showArchived && sections.pinned.length}
		<div class="s2b-session-section s2b-session-section-pinned">
			<div class="s2b-session-section-label">Pinned</div>
			{#each sections.pinned as row (row.threadId)}
				<SessionSidebarItem {row} active={row.threadId === threadPath} running={isRunning(row.threadId)} archivedView={false}
					onOpen={() => open(row.threadId)} onRename={() => rename(row.threadId, row.title)} onDelete={() => del(row.threadId)}
					onTogglePin={() => togglePin(row.threadId, row.pinned)} onToggleArchive={() => toggleArchive(row.threadId, row.archived)} />
			{/each}
		</div>
	{/if}

	<div class="s2b-session-section s2b-session-section-list">
		<div class="s2b-session-section-label">{showArchived ? "Archived" : "Sessions"}</div>
		{#if visibleRows.length === 0}
			<div class="s2b-session-empty">{query ? "No matching sessions" : "No conversations"}</div>
		{/if}
		{#each visibleRows as row (row.threadId)}
			<SessionSidebarItem {row} active={row.threadId === threadPath} running={isRunning(row.threadId)} archivedView={showArchived}
				onOpen={() => open(row.threadId)} onRename={() => rename(row.threadId, row.title)} onDelete={() => del(row.threadId)}
				onTogglePin={() => togglePin(row.threadId, row.pinned)} onToggleArchive={() => toggleArchive(row.threadId, row.archived)} />
		{/each}
		{#if remaining > 0}
			<button class="s2b-session-load-more" onclick={() => (visibleCount += 50)} type="button">Load more ({remaining} remaining)</button>
		{/if}
	</div>
</div>
```

> `confirm`/`prompt` are placeholders for the codebase's existing dialog helpers if present (the extraction mentioned `promptText`/`confirmDelete` in Claudian, not confirmed in S2B). During implementation, grep S2B for an existing confirm/prompt modal (e.g. in `src/components/modal`); if one exists, use it instead of window `confirm`/`prompt`. If none, window dialogs are acceptable for v1 (desktop-only plugin).

- [ ] **Step 7: `npm run check`** — fix any svelte-check type errors. Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/session-sidebar/ test/components/sessionResize.test.ts
git commit -m "feat(sessions): sidebar components + resize action"
```

---

### Task 6: Settings + integrate into Chat.svelte

Wire the sidebar into the chat leaf with the reveal rule, add the four settings, and init the store in `main.ts`.

**Files:**
- Modify: `src/types/plugin.ts` (3 new fields)
- Modify: `src/stores/dataStore.svelte.ts` (defaults + getters/setters)
- Modify: `src/views/settings/AgentsSettings.svelte` (controls)
- Modify: `src/views/chat/Chat.svelte` (layout + reveal)
- Modify: `src/main.ts` (init store)

**Interfaces:**
- Consumes: everything above.
- Produces settings: `enableSessionSidebar: boolean` (default `true`), `sessionSidebarSide: "left" | "right"` (default `"right"`), `sessionManagerSort: SortMode` (default `"last-updated"`), `sessionSidebarWidth: number` (default `240`). Getter/setter pairs as per existing pattern.

- [ ] **Step 1: Add settings fields + defaults + accessors**

`src/types/plugin.ts` (in `PluginData`):
```ts
	enableSessionSidebar: boolean;
	sessionSidebarSide: "left" | "right";
	sessionManagerSort: "last-updated" | "created";
	sessionSidebarWidth: number;
```
`DEFAULT_SETTINGS` (`dataStore.svelte.ts`):
```ts
	enableSessionSidebar: true,
	sessionSidebarSide: "right",
	sessionManagerSort: "last-updated",
	sessionSidebarWidth: 240,
```
Accessors (mirror `chatOpenLocation` getter/setter, each setter calls `saveSettings()`), one pair per field.

- [ ] **Step 2: Settings controls** — `src/views/settings/AgentsSettings.svelte` (below the `chatOpenLocation` control)

```svelte
<SettingItem name="Session sidebar" desc="Show a list of all chat sessions inside the chat view">
	<Toggle checked={pluginData.enableSessionSidebar} onchange={(v) => (pluginData.enableSessionSidebar = v)} />
</SettingItem>
<SettingItem name="Session sidebar side" desc="Which side of the chat the session list appears on">
	<Dropdown type="options" dropdown={[{ display: "Right", value: "right" }, { display: "Left", value: "left" }]}
		selected={pluginData.sessionSidebarSide} onchange={(v) => (pluginData.sessionSidebarSide = v)} />
</SettingItem>
```
(Sort is also controllable inline in the panel; the setting persists it.)

- [ ] **Step 3: Integrate into `Chat.svelte`**

Add imports:
```ts
	import SessionSidebar from "../../components/chat/session-sidebar/SessionSidebar.svelte";
	import { sessionResizer } from "../../components/chat/session-sidebar/resize";
	import { getData } from "../../stores/dataStore.svelte";
```
Add reactive state near the top of `<script>`:
```ts
	const data = getData();
	let rootEl = $state<HTMLElement | null>(null);
	let containerWidth = $state(0);
	const wide = $derived(data.enableSessionSidebar && containerWidth >= 600);
	function observeWidth(node: HTMLElement) {
		rootEl = node;
		const ro = new ResizeObserver((entries) => { containerWidth = entries[0].contentRect.width; });
		ro.observe(node);
		return { destroy: () => ro.disconnect() };
	}
	$effect(() => { if (rootEl) rootEl.style.setProperty("--s2b-session-sidebar-width", `${data.sessionSidebarWidth}px`); });
```
Restructure the root so the chat column and sidebar are flex-row siblings. Replace the `.chat-root` block with:
```svelte
<QueryClientProvider client={plugin.queryClient}>
	<div class="s2b-chat-shell" class:s2b-wide-session={wide} class:s2b-session-left={data.sessionSidebarSide === "left"} use:observeWidth>
		{#if wide}
			<SessionSidebar {threadPath} />
			<div class="s2b-session-resizer" role="separator" aria-orientation="vertical" aria-label="Resize conversation sessions" tabindex="0"
				use:sessionResizer={{ getWidth: () => data.sessionSidebarWidth, setWidth: (w) => (data.sessionSidebarWidth = w), getContainerWidth: () => containerWidth, side: data.sessionSidebarSide }}></div>
		{/if}
		<div class="chat-root relative h-full flex flex-col gap-0 overflow-hidden" data-testid="chat-root" role="region"
			ondragenter={handleRootDragEnter} ondragover={handleRootDragOver} ondragleave={handleRootDragLeave} ondrop={handleRootDrop}
			use:messageNavHotkeys use:portalComposer>
			<!-- existing MessageContainer + Input + drag overlay unchanged -->
		</div>
	</div>
</QueryClientProvider>
```
Keep the existing `{#if registry} ... {/if}` and drag overlay exactly as-is inside `.chat-root`. The `s2b-session-left` class flips flex order in CSS.

> Dropdown fallback below 600px: for v1, when `!wide` the sidebar is simply hidden (chat unchanged) — matching Claudian's "hide under threshold". A compact history dropdown in the input row is deferred to a fast-follow (note it in the PR description). This keeps the diff focused; the ≥600px in-leaf panel is the approved core.

- [ ] **Step 4: Init store in `main.ts`** (after `this.agentManager = new AgentManager(this);` and after `createSessionRegistry(...)`):

```ts
	import { getSessionSidebarStore } from "./stores/session-sidebar/sessionSidebarStore.svelte";
	// ...in onload, after agentManager + registry are created:
	getSessionSidebarStore().init(this);
```

- [ ] **Step 5: Verify** — `npm run check` && `npm run lint` && `npx vitest run`. All green.

- [ ] **Step 6: Commit**

```bash
git add src/types/plugin.ts src/stores/dataStore.svelte.ts src/views/settings/AgentsSettings.svelte src/views/chat/Chat.svelte src/main.ts
git commit -m "feat(sessions): integrate sidebar into chat view + settings"
```

---

### Task 7: Styles (port Claudian look)

**Files:**
- Modify: `src/styles.css`

**Interfaces:** consumes the `s2b-session-*` / `s2b-chat-shell` classes from Tasks 5–6.

- [ ] **Step 1: Append styles** — `src/styles.css`

```css
.s2b-chat-shell { display: flex; flex-direction: row; height: 100%; min-height: 0; }
.s2b-chat-shell.s2b-session-left { flex-direction: row-reverse; }
.s2b-chat-shell .chat-root { flex: 1 1 auto; min-width: 0; }

.s2b-session-sidebar { flex: 0 0 var(--s2b-session-sidebar-width, 240px); display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--background-primary); }
.s2b-session-resizer { flex: 0 0 5px; cursor: col-resize; touch-action: none; position: relative; }
.s2b-session-resizer::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: 2px; width: 1px; background: transparent; transition: background .15s; }
.s2b-session-resizer:hover::after, .s2b-resizing-session-sidebar .s2b-session-resizer::after { background: var(--interactive-accent); }
.s2b-resizing-session-sidebar { cursor: col-resize; user-select: none; }

.s2b-session-section-header { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 8px; }
.s2b-session-new { flex: 1 1 auto; display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; }
.s2b-session-new:hover, .s2b-session-archive-toggle:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.s2b-session-archive-toggle { padding: 6px; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; }
.s2b-session-controls { display: flex; gap: 6px; padding: 0 8px 8px; }
.s2b-session-search { flex: 1 1 auto; border: 0; background: var(--background-modifier-form-field); border-radius: 6px; padding: 4px 8px; font-size: 13px; color: var(--text-normal); }
.s2b-session-sort { font-size: 12px; background: var(--background-modifier-form-field); border-radius: 6px; color: var(--text-muted); }

.s2b-session-section { display: flex; flex-direction: column; overflow-y: auto; }
.s2b-session-section-pinned { max-height: 50%; flex: 0 0 auto; }
.s2b-session-section-list { flex: 1 1 auto; }
.s2b-session-section-label { padding: 8px 12px; color: var(--text-faint); font-size: 13px; font-weight: 500; }
.s2b-session-empty { padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.s2b-session-load-more { margin: 8px; padding: 6px; font-size: 12px; color: var(--text-muted); background: transparent; cursor: pointer; }

.s2b-session-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; position: relative; }
.s2b-session-item:hover { background: var(--background-modifier-hover); }
.s2b-session-item.active { background: var(--background-modifier-hover); }
.s2b-session-item.active .s2b-session-item-title { color: var(--text-normal); }
.s2b-session-item-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; background: transparent; cursor: pointer; text-align: start; }
.s2b-session-item-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; color: var(--text-muted); }
.s2b-session-item-date { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
.s2b-session-item-spinner svg { animation: s2b-spin 1s linear infinite; }

.s2b-session-item-actions { display: none; gap: 6px; }
.s2b-session-item:hover .s2b-session-item-actions, .s2b-session-item:focus-within .s2b-session-item-actions { display: flex; }
.s2b-session-action { width: 20px; height: 20px; display: grid; place-items: center; padding: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
.s2b-session-action:hover { color: var(--text-normal); }
.s2b-session-action:disabled { color: var(--text-faint); opacity: .6; cursor: not-allowed; }
.s2b-session-delete:hover { color: var(--color-red); }

@keyframes s2b-spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 2: Build + eyeball** — `npm run build` succeeds. (Manual visual check happens in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(sessions): session sidebar styling"
```

---

### Task 8: Full verification + PR

- [ ] **Step 1: Full gates** — `npm run check && npm run lint && npx vitest run && npm run build`. All pass.

- [ ] **Step 2: Manual smoke test** — copy `main.js`, `styles.css`, `manifest.json` from the build into a test vault's `.obsidian/plugins/smart-second-brain/`, reload Obsidian. Verify: open a chat in the main area wide ≥600px → sidebar shows on the right; list populates; click a row opens it; active row highlighted; new/rename/delete work; pin moves to Pinned; archive moves to Archived (and is refused while a session streams); restore returns it; resize drag + arrow keys work and width persists across reload; search + sort + load-more work; narrow the leaf <600px → sidebar hides cleanly.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/session-sidebar
gh pr create --repo Direct-Launch/smart-second-brain --base main --head feat/session-sidebar \
  --title "feat: chat session sidebar (Claudian-style)" \
  --body "Adds an in-leaf, resizable session-list sidebar to the chat view with Pinned/Archived sections, search, sort, and per-row open/rename/delete/pin/archive/restore. Pin/archive flags stored in plugin data. Deferred: sub-600px dropdown fallback; linked-content grouping. See docs/superpowers/specs/2026-09-27-s2b-session-sidebar-design.md."
```

---

## Self-Review

- **Spec coverage:** placement/in-leaf/≥600px reveal → Task 6; Pinned/Archived → Tasks 1–3,5; sort/search/new/open/rename/delete/load-more → Tasks 5; running spinner + archive-guard → Tasks 2,5; resize + width persist → Tasks 5,6; settings → Task 6; styling → Task 7; tests → Tasks 1–5,8. Excluded (linked-content grouping, rich token popover) noted as deferred. **Deviation from spec §B:** flags stored in plugin data, not `ThreadData.metadata` (index never loads metadata). Spec updated to match.
- **Metadata popover:** the spec's hover popover is **deferred** for v1 (kept the diff focused on the approved core; message-count needs a per-thread gunzip). Called out here and in the PR body.
- **Placeholder scan:** the only `confirm`/`prompt` and data-store class-name spots carry explicit "verify against real codebase" notes with a concrete fallback — not silent TODOs.
- **Type consistency:** `SessionRow`, `SortMode`, `SessionFlags`, `SessionSections`, `clampSidebarWidth`, `getSessionSidebarStore` used consistently across tasks.
