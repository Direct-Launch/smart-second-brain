import { describe, expect, it } from "vitest";
import { AssistantState } from "../../src/stores/chatTimeline";
import { deriveSessionStatus, SESSION_STATUS_DISPLAY } from "../../src/stores/session-sidebar/status";

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

	it("gives every status an icon AND a text label, so colour is never the only signal", () => {
		for (const [status, display] of Object.entries(SESSION_STATUS_DISPLAY)) {
			expect(display.icon, status).toBeTruthy();
			expect(display.label, status).toBeTruthy();
		}
	});
});
