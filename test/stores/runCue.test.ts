import { describe, expect, it } from "vitest";
import { AssistantState } from "../../src/stores/chatTimeline";
import { CUE_DONE_HZ, CUE_FAIL_HZ, cueForOutcome, outcomeForAssistantState } from "../../src/stores/runCue";

describe("cueForOutcome", () => {
	const on = { sound: true, notification: true };
	const off = { sound: false, notification: false };

	it("stays silent for a run the user cancelled", () => {
		expect(cueForOutcome("cancelled", on)).toEqual({ play: false, frequency: null, body: null });
	});

	it("gives failure and completion distinguishable tones", () => {
		expect(cueForOutcome("error", on).frequency).toBe(CUE_FAIL_HZ);
		expect(cueForOutcome("success", on).frequency).toBe(CUE_DONE_HZ);
		expect(CUE_FAIL_HZ).not.toBe(CUE_DONE_HZ);
	});

	it("keeps sound and notification independently toggleable", () => {
		expect(cueForOutcome("success", { sound: true, notification: false })).toMatchObject({
			frequency: CUE_DONE_HZ,
			body: null,
		});
		expect(cueForOutcome("success", { sound: false, notification: true })).toMatchObject({
			frequency: null,
			body: "Chat run finished",
		});
	});

	it("still settles with both cues off, emitting nothing", () => {
		const cue = cueForOutcome("success", off);
		expect(cue.play).toBe(true);
		expect(cue.frequency).toBeNull();
		expect(cue.body).toBeNull();
	});
});

describe("outcomeForAssistantState", () => {
	it("maps the three terminal states", () => {
		expect(outcomeForAssistantState(AssistantState.success)).toBe("success");
		expect(outcomeForAssistantState(AssistantState.error)).toBe("error");
		expect(outcomeForAssistantState(AssistantState.cancelled)).toBe("cancelled");
	});

	it("fires nothing for a state that is not terminal", () => {
		expect(outcomeForAssistantState(AssistantState.streaming)).toBeNull();
		expect(outcomeForAssistantState(AssistantState.idle)).toBeNull();
		expect(outcomeForAssistantState(undefined)).toBeNull();
	});
});
