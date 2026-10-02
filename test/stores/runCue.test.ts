import { describe, expect, it } from "vitest";
import { AssistantState } from "../../src/stores/chatTimeline";
import { CUE_DONE_HZ, CUE_FAIL_HZ, cueForOutcome, outcomeForAssistantState } from "../../src/stores/runCue";

describe("cueForOutcome", () => {
	const on = { sound: true, notification: true };
	const off = { sound: false, notification: false };

	it("stays silent for a run the user cancelled", () => {
		expect(cueForOutcome("cancelled", on)).toEqual({
			play: false,
			sound: null,
			body: null,
			name: null,
		});
	});

	it("carries the session name so a cue can say which chat settled", () => {
		expect(cueForOutcome("success", on, "Holiday plans").name).toBe("Holiday plans");
		expect(cueForOutcome("error", on, "Holiday plans").name).toBe("Holiday plans");
	});

	it("treats a blank or missing name as no name", () => {
		expect(cueForOutcome("success", on).name).toBeNull();
		expect(cueForOutcome("success", on, "").name).toBeNull();
		expect(cueForOutcome("success", on, "   ").name).toBeNull();
	});

	it("gives failure and completion distinguishable default tones", () => {
		expect(cueForOutcome("error", on).sound).toEqual({ kind: "default", frequency: CUE_FAIL_HZ });
		expect(cueForOutcome("success", on).sound).toEqual({
			kind: "default",
			frequency: CUE_DONE_HZ,
		});
		expect(CUE_FAIL_HZ).not.toBe(CUE_DONE_HZ);
	});

	it("plays a configured file in place of the default tone", () => {
		const cue = cueForOutcome("success", {
			...on,
			successSoundPath: "C:/Windows/Media/tada.wav",
		});
		expect(cue.sound).toEqual({ kind: "file", path: "C:/Windows/Media/tada.wav" });
	});

	it("picks each outcome's own file, so failure cannot sound like success", () => {
		const settings = {
			...on,
			successSoundPath: "/sounds/tada.wav",
			failureSoundPath: "/sounds/error.wav",
		};
		expect(cueForOutcome("success", settings).sound).toEqual({
			kind: "file",
			path: "/sounds/tada.wav",
		});
		expect(cueForOutcome("error", settings).sound).toEqual({
			kind: "file",
			path: "/sounds/error.wav",
		});
	});

	it("falls back to the default tone when an override is blank or whitespace", () => {
		for (const blank of ["", "   ", undefined]) {
			expect(cueForOutcome("success", { ...on, successSoundPath: blank }).sound).toEqual({
				kind: "default",
				frequency: CUE_DONE_HZ,
			});
		}
	});

	it("does not leak a success path into the failure cue", () => {
		expect(cueForOutcome("error", { ...on, successSoundPath: "/sounds/tada.wav" }).sound).toEqual({
			kind: "default",
			frequency: CUE_FAIL_HZ,
		});
	});

	it("keeps sound and notification independently toggleable", () => {
		expect(cueForOutcome("success", { sound: true, notification: false })).toMatchObject({
			sound: { kind: "default", frequency: CUE_DONE_HZ },
			body: null,
		});
		expect(cueForOutcome("success", { sound: false, notification: true })).toMatchObject({
			sound: null,
			body: "Chat run finished",
		});
	});

	it("mutes a configured file too when sound is off", () => {
		const cue = cueForOutcome("success", {
			sound: false,
			notification: false,
			successSoundPath: "C:/Windows/Media/tada.wav",
		});
		expect(cue.sound).toBeNull();
	});

	it("still settles with both cues off, emitting nothing", () => {
		const cue = cueForOutcome("success", off);
		expect(cue.play).toBe(true);
		expect(cue.sound).toBeNull();
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
