import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentManager } from "../../src/agent/AgentManager";
import { SessionRegistry } from "../../src/stores/chatStore.svelte";
import { AssistantState } from "../../src/stores/chatTimeline";

/* --------------------------------------------------------------------------
 * Regression: a thread that settled BEFORE it was ever loaded kept no outcome.
 *
 * The sidebar's per-row status reads the live session first and falls back to
 * the outcome persisted on the thread's flags. `setSessionStatus` had exactly
 * one caller - the run's `finally` - so a thread only ever got a status if it
 * settled WHILE loaded. Every thread that settled earlier, or before this
 * feature existed, reached its row with no live session and no persisted
 * status, so `deriveRowStatus` returned `idle` and the row's icon vanished.
 * Reported 2026-10-01: only MAX_PARKED_SESSIONS + 1 chats kept their icons.
 *
 * Loading is the first moment a thread's outcome is readable without
 * re-parsing the whole thread, so the fix persists it there. These tests
 * cover the load path rather than the settle path, which is the seam the
 * existing cue/status tests do not touch.
 * ------------------------------------------------------------------------*/

// Declared before `vi.mock` and captured by the factory, matching
// test/agent/sessionFlagsGuard.test.ts.
const store = {
	setSessionStatus: vi.fn(),
	setSessionTitle: vi.fn(),
	selectedAgentId: "agent-1",
};
vi.mock("../../src/stores/dataStore.svelte", () => ({ getData: () => store }));

type CheckpointShape = {
	checkpointId: string;
	step: number;
	messages: unknown[];
	parentCheckpointId?: string;
	ts: string;
};

function checkpoint(
	checkpointId: string,
	step: number,
	messages: unknown[],
	parentCheckpointId?: string,
): CheckpointShape {
	return {
		checkpointId,
		step,
		messages,
		parentCheckpointId,
		ts: new Date(2026, 0, 1, 0, step + 2).toISOString(),
	};
}

/** A settled turn: one human message and its assistant reply. */
function settledTurn(): unknown[] {
	return [
		new HumanMessage({ content: "hello", id: "h1" }),
		new AIMessage({ content: "hi", id: "ai1" }),
	];
}

function makeRegistry(messages: unknown[], errorCount = 0): SessionRegistry {
	const history = [
		checkpoint("r", -1, []),
		checkpoint("b", 0, messages, "r"),
	];
	const stub = {
		isThreadEmpty: async () => false,
		getThreadHistory: async () => ({ messages, metadata: {}, errorCount }),
		getCheckpointHistory: async () => history,
		setLastViewedCheckpoint: async () => {},
		onNextInitialized: () => {},
	} as unknown as AgentManager;
	const registry = new SessionRegistry(stub);
	// Agent selection is orthogonal here and would need a fully constructed
	// PluginDataStore; stub it to a fixed id, as sessionRegistry.test.ts does.
	(
		registry as unknown as { restoreSelectionFromLoadedMessages: () => Promise<string> }
	).restoreSelectionFromLoadedMessages = async () => "agent-1";
	return registry;
}

async function load(registry: SessionRegistry, path: string): Promise<void> {
	await registry.loadSession({ path } as unknown as Parameters<SessionRegistry["loadSession"]>[0]);
}

const PATH = "Chats/Settled Before Load.chat";

describe("persisting a loaded thread's outcome", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("persists the settled outcome of a thread loaded for the first time", async () => {
		const registry = makeRegistry(settledTurn());
		await load(registry, PATH);
		expect(store.setSessionStatus).toHaveBeenCalledWith(PATH, AssistantState.success);
	});

	it("writes nothing for a thread with no settled turn", async () => {
		// No pairs at all, so there is no outcome to record. Guessing `idle`
		// would be a claim, and the guard deliberately leaves it unset.
		const registry = makeRegistry([]);
		await load(registry, PATH);
		expect(store.setSessionStatus).not.toHaveBeenCalled();
	});

	it("still loads when the settings store is unavailable", async () => {
		// A headless or unit-test load has no PluginDataStore. The status icon
		// is cosmetic, so losing it must never break the load itself.
		store.setSessionStatus.mockImplementationOnce(() => {
			throw new Error("Plugin does not exist");
		});
		const registry = makeRegistry(settledTurn());
		await expect(load(registry, PATH)).resolves.toBeUndefined();
		expect(registry.sessionFor(PATH)).toBeTruthy();
	});
});
