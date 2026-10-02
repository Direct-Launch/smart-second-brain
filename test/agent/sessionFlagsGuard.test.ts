import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("obsidian", () => import("../__mocks__/obsidian"));

const flags = { setSessionArchived: vi.fn(), setSessionPinned: vi.fn() };
vi.mock("../../src/stores/dataStore.svelte", () => ({
	getData: () => flags,
}));
const registry = { sessionFor: vi.fn() };
vi.mock("../../src/stores/chatStore.svelte", async (orig) => ({
	...(await orig<typeof import("../../src/stores/chatStore.svelte")>()),
	getSessionRegistry: () => registry,
}));

import { AgentManager } from "../../src/agent/AgentManager";

// Same mock plugin shape as test/agent/ObsidianChatManager.test.ts — AgentManager's
// constructor builds an ObsidianChatManager, which calls plugin.registerEvent(...)
// and plugin.app.vault.on(...), so a bare `{}` throws.
function createMockPlugin() {
	return {
		manifest: { id: "smart-second-brain", dir: "smart-second-brain" },
		registerEvent: vi.fn(),
		app: {
			vault: {
				on: vi.fn(),
				adapter: {
					exists: vi.fn().mockResolvedValue(false),
					read: vi.fn().mockResolvedValue(""),
					readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
					write: vi.fn().mockResolvedValue(undefined),
					writeBinary: vi.fn().mockResolvedValue(undefined),
					mkdir: vi.fn().mockResolvedValue(undefined),
					remove: vi.fn().mockResolvedValue(undefined),
					rmdir: vi.fn().mockResolvedValue(undefined),
					list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
					stat: vi.fn().mockResolvedValue({ ctime: 1000, mtime: 2000, size: 100 }),
				},
				configDir: ".obsidian",
			},
		},
	};
}

describe("setThreadArchived guard", () => {
	let mgr: AgentManager;
	beforeEach(() => {
		vi.clearAllMocks();
		mgr = new AgentManager(createMockPlugin() as never);
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

describe("setThreadPinned", () => {
	let mgr: AgentManager;
	beforeEach(() => {
		vi.clearAllMocks();
		mgr = new AgentManager(createMockPlugin() as never);
	});
	it("delegates to getData().setSessionPinned", () => {
		mgr.setThreadPinned("Chats/a.chat", true);
		expect(flags.setSessionPinned).toHaveBeenCalledWith("Chats/a.chat", true);
	});
});
