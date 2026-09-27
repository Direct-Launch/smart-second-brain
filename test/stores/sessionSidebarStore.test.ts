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
		const on = vi.fn((_event: string, _cb: (...args: unknown[]) => unknown) => ({}));
		interface MockPlugin {
			registerEvent: typeof registerEvent;
			app: { vault: { on: typeof on } };
			agentManager: { getAllThreads: typeof getAllThreads };
		}
		const plugin: MockPlugin = { registerEvent, app: { vault: { on } }, agentManager: { getAllThreads } };
		getAllThreads.mockResolvedValue([]);
		getSessionSidebarStore().init(plugin as never);
		const events = on.mock.calls.map((c) => c[0]);
		expect(events).toEqual(expect.arrayContaining(["create", "delete", "rename"]));
	});
});
