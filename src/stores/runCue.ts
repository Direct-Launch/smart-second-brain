import { Notice } from "obsidian";
import { AssistantState } from "./chatTimeline";

/** The terminal outcome of a chat run. Mirrors the settled assistant state, so
 * there is one source of truth for "how did this turn end". */
export type RunOutcome = "success" | "error" | "cancelled";

export interface RunCueSettings {
	/** Play a short tone when a run settles. */
	sound: boolean;
	/** Raise a native notification when a run settles. */
	notification: boolean;
}

export interface RunCue {
	/** false for outcomes that must stay silent. */
	play: boolean;
	/** Tone frequency in Hz, or null for no sound. */
	frequency: number | null;
	/** Notification body, or null for no notification. */
	body: string | null;
}

/** How long the tone is held. A cue, not a jingle. */
export const CUE_DURATION_MS = 140;
/** Distinct by ear: a failure must not sound like a completion. */
export const CUE_DONE_HZ = 880;
export const CUE_FAIL_HZ = 320;

/**
 * Decide what a settled run should emit.
 *
 * `cancelled` is deliberately silent: the user asked for the stop, so a cue
 * would be noise rather than information. Pure, so the decision is testable
 * without an AudioContext or a renderer.
 */
export function cueForOutcome(outcome: RunOutcome, settings: RunCueSettings): RunCue {
	if (outcome === "cancelled") return { play: false, frequency: null, body: null };
	const failed = outcome === "error";
	return {
		play: true,
		frequency: settings.sound ? (failed ? CUE_FAIL_HZ : CUE_DONE_HZ) : null,
		body: settings.notification ? (failed ? "Chat run failed" : "Chat run finished") : null,
	};
}

/** Map a settled assistant state to an outcome. Anything not terminal returns
 * null and fires nothing. */
export function outcomeForAssistantState(state: AssistantState | undefined): RunOutcome | null {
	switch (state) {
		case AssistantState.success:
			return "success";
		case AssistantState.error:
			return "error";
		case AssistantState.cancelled:
			return "cancelled";
		default:
			return null;
	}
}

// --- emission: renderer-dependent, best-effort, must never throw ---

let audioCtx: AudioContext | null = null;

/**
 * Called from a user gesture (send / submit). Chromium gates audio until a
 * gesture has happened, so this is the only reliable moment to open a context
 * that can actually be heard later. Best-effort: failure just means no tone.
 */
export function primeAudio(): void {
	try {
		if (typeof AudioContext === "undefined") return;
		if (!audioCtx) audioCtx = new AudioContext();
		if (audioCtx.state === "suspended") void audioCtx.resume();
	} catch {
		audioCtx = null;
	}
}

function playTone(frequency: number): void {
	try {
		if (!audioCtx || audioCtx.state !== "running") return;
		const osc = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		osc.frequency.value = frequency;
		gain.gain.value = 0.05; // quiet: a cue, not an alarm
		osc.connect(gain).connect(audioCtx.destination);
		const now = audioCtx.currentTime;
		osc.start(now);
		osc.stop(now + CUE_DURATION_MS / 1000);
	} catch {
		// A blocked or failed cue must never break the run\u2019s bookkeeping.
	}
}

function notify(body: string): void {
	try {
		if (typeof Notification !== "undefined" && Notification.permission === "granted") {
			new Notification(body);
			return;
		}
		// Notice is the guaranteed floor, and is not gated by permission.
		new Notice(body);
	} catch {
		// Never throw into a settled run.
	}
}

/**
 * Emit the cue for a settled run. No-op when the outcome is not terminal.
 *
 * Settings arrive as a thunk and are read *inside* the guard, because the read
 * itself can throw: the run's `finally` can execute in a context with no plugin
 * (headless, or the unit tests for this path). A cue must never be able to break
 * the bookkeeping of a run that has already settled.
 */
export function emitRunCue(outcome: RunOutcome | null, readSettings: () => RunCueSettings): void {
	if (!outcome) return;
	let settings: RunCueSettings;
	try {
		settings = readSettings();
	} catch {
		return;
	}
	const cue = cueForOutcome(outcome, settings);
	if (!cue.play) return;
	if (cue.frequency !== null) playTone(cue.frequency);
	if (cue.body) notify(cue.body);
}
