import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointHistoryItem } from "../../src/agent/Agent";
import { ChatSession } from "../../src/stores/chatStore.svelte";
import {
	AssistantState,
	type CheckpointGraphState,
	type MessagePair,
	buildCheckpointGraph,
} from "../../src/stores/chatTimeline";
import { emitRunCue } from "../../src/stores/runCue";

/* --------------------------------------------------------------------------
 * ChatSession — the settle cue must not depend on the pair identity surviving.
 *
 * Verified live 2026-10-01: a successful run fired no cue. The trace read
 * `settledPair=MISSING ... emit outcome=null` — the decision logic was correct,
 * but `findPairAcrossRebuild` had found nothing to hand it.
 *
 * Why it misses: `findPairAcrossRebuild` prefers `stableKey`, yet the optimistic
 * pair `sendMessage` builds carries NO `stableKey` — it is only added later by
 * `rebuildMessagePairs`, which also mints a fresh `MessagePair.id`. So once the
 * settle rebuild runs, the captured `id` is stale and there is no key to fall
 * back on. The cue reads the settled state from the pair it already holds, and
 * treats the lookup only as a preference.
 *
 * The existing cue tests never caught this because they call the pure decision
 * functions directly and never run a rebuild — i.e. they skip the seam the bug
 * lives in. These tests run `runStream` with a rebuild that replaces the pair,
 * which is the only way to exercise it.
 * ------------------------------------------------------------------------*/

vi.mock("../../src/stores/runCue", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/stores/runCue")>();
	return { ...actual, emitRunCue: vi.fn() };
});

// The settle handler also records the outcome against the thread. Stub the store
// so the assertions can see what it wrote without standing up plugin settings.
const store = {
	setSessionStatus: vi.fn(),
	setSessionTitle: vi.fn(),
	getSessionFlags: vi.fn(() => ({ title: "Holiday plans" })),
	runSoundEnabled: true,
	runNotificationEnabled: true,
};
vi.mock("../../src/stores/dataStore.svelte", () => ({ getData: () => store }));

const THREAD_ID = "Chats/Run Cue.chat";

function checkpoint(
	checkpointId: string,
	step: number,
	messages: (HumanMessage | AIMessage)[],
	parentCheckpointId?: string,
): CheckpointHistoryItem {
	return { checkpointId, step, messages, parentCheckpointId, ts: new Date(2026, 0, 1, 0, step + 2).toISOString() };
}

function buildGraph(): CheckpointGraphState {
	const h1 = new HumanMessage({ content: "hello", id: "h1" });
	const ai1 = new AIMessage({ content: "hi", id: "ai1" });
	const graph = buildCheckpointGraph([
		checkpoint("r", -1, []),
		checkpoint("a", 0, [h1], "r"),
		checkpoint("b", 1, [h1, ai1], "a"),
	]);
	graph.activeCheckpointId = "b";
	return graph;
}

/** Exactly the pair `sendMessage` builds: a fresh id, and NO `stableKey`. */
function optimisticPair(): MessagePair {
	return {
		id: "optimistic-pair",
		userMessage: { content: "hello" },
		assistantMessage: { state: AssistantState.idle, content: "" },
	} as unknown as MessagePair;
}

type RunStreamInternals = {
	runStream(
		pairId: string,
		getStream: (signal: AbortSignal) => AsyncIterable<unknown>,
		options: { beforeCheckpointIds: Set<string>; reloadAfter?: boolean; parentCheckpointId?: string },
	): Promise<void>;
	consumeStream: (...args: unknown[]) => Promise<void>;
	syncGraphAfterRun: (...args: unknown[]) => Promise<void>;
};

function makeSession(): { session: ChatSession; internals: RunStreamInternals } {
	const session = new ChatSession(THREAD_ID, {
		graphState: buildGraph(),
		errorCount: 0,
		selectedAgentId: "",
	});
	// A single in-flight turn, created the way `sendMessage` creates it.
	session.messages = [optimisticPair()];
	const internals = session as unknown as RunStreamInternals;
	internals.consumeStream = vi.fn().mockResolvedValue(undefined);
	internals.syncGraphAfterRun = vi.fn().mockResolvedValue(undefined);
	return { session, internals };
}

/** Replace `messages` the way a settle rebuild does: fresh id, stableKey added. */
function simulateRebuild(session: ChatSession, state: AssistantState): void {
	const current = session.messages.at(-1);
	if (!current) throw new Error("expected a message pair");
	session.messages = [
		{
			...current,
			id: "rebuilt-pair-id",
			stableKey: "h1",
			assistantMessage: { ...current.assistantMessage, state },
		} as MessagePair,
	];
}

async function run(session: ChatSession, internals: RunStreamInternals): Promise<void> {
	const pair = session.messages.at(-1);
	if (!pair) throw new Error("expected a message pair");
	await internals.runStream.call(session, pair.id, () => (async function* () {})(), {
		beforeCheckpointIds: new Set(["r", "a", "b"]),
	});
}

describe("ChatSession — the settle cue survives a rebuilt pair identity", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(emitRunCue).mockClear();
		store.setSessionStatus.mockClear();
		store.getSessionFlags.mockReturnValue({ title: "Holiday plans" });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fires the success cue when the rebuild replaced the pair it started with", async () => {
		const { session, internals } = makeSession();
		// The rebuild lands before the `finally` reads the outcome, exactly as
		// `syncGraphAfterRun` does in a real run.
		internals.syncGraphAfterRun = vi.fn().mockImplementation(async () => {
			simulateRebuild(session, AssistantState.success);
		});

		await run(session, internals);

		expect(emitRunCue).toHaveBeenCalledTimes(1);
		expect(vi.mocked(emitRunCue).mock.calls[0]?.[0]).toBe("success");
	});

	it("still fires the failure cue when the identity was lost", async () => {
		const { session, internals } = makeSession();
		// A real failure: the stream throws *and* the pair is rebuilt underneath it
		// before the catch runs, so the lookup cannot find the turn either.
		internals.consumeStream = vi.fn().mockImplementation(async () => {
			simulateRebuild(session, AssistantState.success);
			throw new Error("model refused");
		});

		await run(session, internals);

		// The fallback reads the settled pair, not the (unreachable) lookup — so a
		// real failure must not be reported as a success.
		expect(vi.mocked(emitRunCue).mock.calls[0]?.[0]).toBe("error");
	});

	it("fires exactly one cue per run, however many panes are open", async () => {
		const { session, internals } = makeSession();

		await run(session, internals);

		expect(emitRunCue).toHaveBeenCalledTimes(1);
		expect(vi.mocked(emitRunCue).mock.calls[0]?.[0]).toBe("success");
	});

	it("records the settled outcome against the thread, so the sidebar keeps it", async () => {
		const { session, internals } = makeSession();

		await run(session, internals);

		// Without this write the row falls back to "unknown" as soon as the
		// session is parked and evicted — the vanishing-icon bug.
		expect(store.setSessionStatus).toHaveBeenCalledWith(THREAD_ID, AssistantState.success);
	});

	it("records a failure as failed, not as success", async () => {
		const { session, internals } = makeSession();
		internals.consumeStream = vi.fn().mockRejectedValue(new Error("model refused"));

		await run(session, internals);

		expect(store.setSessionStatus).toHaveBeenCalledWith(THREAD_ID, AssistantState.error);
	});

	it("passes the session name to the cue, so the notification names the chat", async () => {
		const { session, internals } = makeSession();

		await run(session, internals);

		expect(vi.mocked(emitRunCue).mock.calls[0]?.[2]).toBe("Holiday plans");
	});
});
