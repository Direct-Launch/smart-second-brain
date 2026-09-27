import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("obsidian", () => import("../__mocks__/obsidian"));

// Mock secretStorage — PluginDataStore's constructor path doesn't need it here, but
// other store tests mock it to keep provider-auth code paths inert; harmless to include.
vi.mock("../../src/lib/secretStorage", () => ({
	getSecret: vi.fn(() => null),
	setSecret: vi.fn(),
	listSecrets: vi.fn(() => []),
}));

import { PluginDataStore, DEFAULT_SETTINGS } from "../../src/stores/dataStore.svelte";

function createMockPlugin() {
	return {
		app: {
			vault: {
				adapter: { exists: vi.fn(), read: vi.fn(), write: vi.fn() },
				getName: vi.fn().mockReturnValue("Test Vault"),
				getAbstractFileByPath: vi.fn(),
				getFolderByPath: vi.fn().mockReturnValue(null),
				createFolder: vi.fn().mockResolvedValue(undefined),
				// PluginDataStore subscribes to vault renames in its constructor.
				on: vi.fn().mockReturnValue({}),
			},
			appId: "test-vault-id",
		},
		manifest: { id: "smart-second-brain", dir: "smart-second-brain" },
		saveData: vi.fn().mockResolvedValue(undefined),
		registerEvent: vi.fn(),
	};
}

function makeStore() {
	const plugin = createMockPlugin();
	const data = structuredClone(DEFAULT_SETTINGS);
	const store = new PluginDataStore(plugin as never, data as never);
	return { store, plugin };
}

describe("sessionFlags", () => {
	let store: PluginDataStore;
	let plugin: ReturnType<typeof createMockPlugin>;
	beforeEach(() => {
		({ store, plugin } = makeStore());
	});

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
		expect(store.getSessionFlags("Chats/a.chat").pinnedAt).toBeUndefined();
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
