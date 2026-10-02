import { describe, expect, it } from "vitest";
import { AssistantState } from "../../src/stores/chatTimeline";
import { deriveRowStatus, deriveSessionStatus, SESSION_STATUS_DISPLAY } from "../../src/stores/session-sidebar/status";

describe("deriveSessionStatus", () => {
	it("reports running whenever the session is live, whatever the last message says", () => {
		expect(deriveSessionStatus(true, AssistantState.success)).toBe("running");
		expect(deriveSessionStatus(true, AssistantState.error)).toBe("running");
		expect(deriveSessionStatus(true, undefined)).toBe("running");
	});

	it("maps each terminal assistant state", () => {
		expect(deriveSessionStatus(false, AssistantState.success)).toBe("done");
		expect(deriveSessionStatus(false, AssistantState.error)).toBe("failed");
		expect(deriveSessionStatus(false, AssistantState.cancelled)).toBe("cancelled");
	});

	it("reports an orphaned stream as interrupted, not done and not failed", () => {
		// App closed mid-stream: the pair stays at streaming with nothing running.
		// Guessing an outcome here would put a false claim on a status surface.
		expect(deriveSessionStatus(false, AssistantState.streaming)).toBe("interrupted");
	});

	it("reports idle when the thread is not loaded - unknown, never assumed done", () => {
		expect(deriveSessionStatus(false, undefined)).toBe("idle");
		expect(deriveSessionStatus(false, AssistantState.idle)).toBe("idle");
	});

	it("keeps a settled outcome after the live session is gone", () => {
		// Navigating away evicts the parked idle session, so the in-memory pair
		// state disappears. The outcome is still known — it is persisted — and
		// reporting idle there made the row's icon vanish and presented a known
		// result as unknown. This was the reported bug (2026-10-01).
		expect(deriveRowStatus(false, undefined, AssistantState.success)).toBe("done");
		expect(deriveRowStatus(false, undefined, AssistantState.error)).toBe("failed");
		expect(deriveRowStatus(false, undefined, AssistantState.cancelled)).toBe("cancelled");
	});

	it("still reports idle for a thread that never settled and is not loaded", () => {
		// Idle keeps its honest meaning: nothing settled, nothing loaded.
		expect(deriveRowStatus(false, undefined, undefined)).toBe("idle");
		expect(deriveRowStatus(false, undefined, AssistantState.idle)).toBe("idle");
	});

	it("prefers the live session's state over the persisted one", () => {
		// Live is the fresher read: a second run may already be under way while
		// the flag still records the previous turn's outcome.
		expect(deriveRowStatus(true, AssistantState.success, AssistantState.error)).toBe("running");
		expect(deriveRowStatus(false, AssistantState.success, AssistantState.error)).toBe("done");
	});

	it("gives every status an icon AND a text label, so colour is never the only signal", () => {
		for (const [status, display] of Object.entries(SESSION_STATUS_DISPLAY)) {
			expect(display.icon, status).toBeTruthy();
			expect(display.label, status).toBeTruthy();
		}
	});
});
