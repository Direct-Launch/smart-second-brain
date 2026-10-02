import { Notice } from "obsidian";
import { AssistantState } from "./chatTimeline";

/** The terminal outcome of a chat run. Mirrors the settled assistant state, so
 * there is one source of truth for "how did this turn end". */
export type RunOutcome = "success" | "error" | "cancelled";

export interface RunCueSettings {
	/** Play a sound when a run settles. */
	sound: boolean;
	/** Raise a native notification when a run settles. */
	notification: boolean;
	/** Absolute path to a sound file to play on success. Blank uses the
	 * built-in tone. Desktop-only: ignored where there is no filesystem. */
	successSoundPath?: string;
	/** Absolute path to a sound file to play on failure. Blank uses the
	 * built-in tone. Desktop-only: ignored where there is no filesystem. */
	failureSoundPath?: string;
}

/** What a settled run should play. `default` is the built-in synthesised cue;
 * `file` is a user-supplied audio file read at play time. */
export type CueSound = { kind: "default"; frequency: number } | { kind: "file"; path: string };

export interface RunCue {
	/** false for outcomes that must stay silent. */
	play: boolean;
	/** The sound to play, or null for silence. */
	sound: CueSound | null;
	/** Notification body, or null for no notification. */
	body: string | null;
	/** Display title for the notification — the session name, so a cue can say
	 * *which* chat settled. Null when the session has no name yet. */
	name: string | null;
}

/** How long the built-in tone is held. A cue, not a jingle. */
export const CUE_DURATION_MS = 140;
/** Distinct by ear: a failure must not sound like a completion. */
export const CUE_DONE_HZ = 880;
export const CUE_FAIL_HZ = 320;

/** A path that is only whitespace is not a setting. */
function trimmedOrNull(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

/**
 * Decide what a settled run should emit.
 *
 * `cancelled` is deliberately silent: the user asked for the stop, so a cue
 * would be noise rather than information. Pure, so the decision is testable
 * without an AudioContext or a renderer.
 */
export function cueForOutcome(
	outcome: RunOutcome,
	settings: RunCueSettings,
	sessionName?: string,
): RunCue {
	// The session name rides alongside the body rather than inside it: several
	// chats can be in flight, so "Chat run finished" on its own does not tell
	// the user which one it was.
	const name = trimmedOrNull(sessionName);
	if (outcome === "cancelled") return { play: false, sound: null, body: null, name: null };
	const failed = outcome === "error";
	// The user's own file wins over the built-in tone, but only when sound is
	// on at all — the toggle stays the master switch.
	const customPath = trimmedOrNull(failed ? settings.failureSoundPath : settings.successSoundPath);
	const sound: CueSound | null = settings.sound
		? customPath
			? { kind: "file", path: customPath }
			: { kind: "default", frequency: failed ? CUE_FAIL_HZ : CUE_DONE_HZ }
		: null;
	return {
		play: true,
		sound,
		body: settings.notification ? (failed ? "Chat run failed" : "Chat run finished") : null,
		name,
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

/** Decoded audio, keyed by file path, so a settle does not re-read and
 * re-decode the same file from disk on every run. */
const decodedSounds = new Map<string, AudioBuffer>();
/** Decodes already in flight, keyed the same way, so two settles in quick
 * succession do not both hit the disk for the same file. */
const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Called from a user gesture (send / submit). Chromium gates audio until a
 * gesture has happened, so this is the only reliable moment to open a context
 * that can actually be heard later. Best-effort: failure just means no sound.
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
		// A blocked or failed cue must never break the run's bookkeeping.
	}
}

/**
 * Read a file into an ArrayBuffer using Electron's real require.
 *
 * This is exactly the path a plugin bundle's Node `require` does NOT provide:
 * Obsidian injects a stub that returns null for builtins, while the renderer's
 * own `require` (window.require / globalThis.require) is Electron's real one.
 * Returns null wherever there is no filesystem, i.e. mobile.
 */
function readFileBytes(path: string): ArrayBuffer | null {
	try {
		const scope = globalThis as { require?: (id: string) => unknown };
		const req =
			scope.require ?? (window as unknown as { require?: (id: string) => unknown }).require;
		if (typeof req !== "function") return null;
		const fs = req("fs") as { readFileSync?: (p: string) => Uint8Array };
		if (typeof fs?.readFileSync !== "function") return null;
		const bytes = fs.readFileSync(path);
		// Slice out exactly this view: Buffer may be a window onto a shared pool.
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	} catch {
		// Missing file, permissions, unreadable format — all mean "no sound".
		return null;
	}
}

function playBuffer(buffer: AudioBuffer): void {
	if (!audioCtx || audioCtx.state !== "running") return;
	const source = audioCtx.createBufferSource();
	const gain = audioCtx.createGain();
	gain.gain.value = 1; // the file is already mastered; only the synth is attenuated
	source.buffer = buffer;
	source.connect(gain).connect(audioCtx.destination);
	source.start();
}

async function decodeSound(path: string): Promise<AudioBuffer | null> {
	try {
		if (!audioCtx) return null;
		const bytes = readFileBytes(path);
		if (!bytes) return null;
		const decoded = await audioCtx.decodeAudioData(bytes);
		decodedSounds.set(path, decoded);
		return decoded;
	} catch {
		return null;
	} finally {
		pendingDecodes.delete(path);
	}
}

/**
 * Play a user-supplied file. Falls back to the built-in tone for that outcome
 * when the file cannot be read or decoded — silence would hide the very event
 * the cue exists to announce.
 */
function playFile(path: string, fallbackHz: number): void {
	try {
		const cached = decodedSounds.get(path);
		if (cached) {
			playBuffer(cached);
			return;
		}
		if (!audioCtx || audioCtx.state !== "running") return;
		let pending = pendingDecodes.get(path);
		if (!pending) {
			pending = decodeSound(path);
			pendingDecodes.set(path, pending);
		}
		void pending.then((buffer) => {
			if (buffer) playBuffer(buffer);
			else playTone(fallbackHz);
		});
	} catch {
		// Never throw into a settled run.
	}
}

function notify(body: string, name: string | null): void {
	try {
		if (typeof Notification !== "undefined" && Notification.permission === "granted") {
			// The session name is the OS notification's title; the outcome is
			// its body. Falls back to the plugin name for an unnamed session.
			new Notification(name ?? "Smart Second Brain", { body });
			return;
		}
		// Notice is the guaranteed floor, and is not gated by permission. It
		// renders one string, so the name is composed in rather than dropped.
		new Notice(name ? `${name} — ${body}` : body);
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
export function emitRunCue(
	outcome: RunOutcome | null,
	readSettings: () => RunCueSettings,
	sessionName?: string,
): void {
	if (!outcome) return;
	let settings: RunCueSettings;
	try {
		settings = readSettings();
	} catch {
		return;
	}
	const cue = cueForOutcome(outcome, settings, sessionName);
	if (!cue.play) return;
	if (cue.sound) {
		if (cue.sound.kind === "default") playTone(cue.sound.frequency);
		else playFile(cue.sound.path, outcome === "error" ? CUE_FAIL_HZ : CUE_DONE_HZ);
	}
	if (cue.body) notify(cue.body, cue.name);
}
