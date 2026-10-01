import { AssistantState } from "../chatTimeline";

/** At-a-glance state of a chat session in the sidebar.
 *
 * `idle` is the honest unknown: the thread is not loaded into a live session,
 * so the plugin genuinely does not know what happened to its last turn. It is
 * deliberately not coloured green — a status surface must never guess. */
export type SessionStatus = "running" | "done" | "failed" | "cancelled" | "interrupted" | "idle";

export interface SessionStatusDisplay {
	/** Obsidian (lucide) icon name. */
	icon: string;
	/** Text label. Always rendered — colour alone is never the only signal. */
	label: string;
	/** CSS class suffix; the colour lives in the stylesheet, not here. */
	tone: "neutral" | "progress" | "good" | "bad";
}

export const SESSION_STATUS_DISPLAY: Record<SessionStatus, SessionStatusDisplay> = {
	running: { icon: "loader-circle", label: "Running", tone: "progress" },
	done: { icon: "circle-check", label: "Done", tone: "good" },
	failed: { icon: "circle-alert", label: "Failed", tone: "bad" },
	cancelled: { icon: "circle-slash", label: "Stopped", tone: "neutral" },
	interrupted: { icon: "circle-dashed", label: "Interrupted", tone: "neutral" },
	idle: { icon: "circle", label: "Not loaded", tone: "neutral" },
};

/**
 * Derive a row's status.
 *
 * `isRunning` is the live registry flag (`ChatSession.isRunning`). Otherwise the
 * answer comes from the *last* message pair's assistant state, which the session
 * holds reactively in memory.
 *
 * `streaming` with nothing running means the app was closed mid-stream: the pair
 * stays in that state forever, but nothing is actually happening. It is neither
 * done nor failed, so it reports `interrupted` rather than inventing an outcome.
 */
export function deriveSessionStatus(
	isRunning: boolean,
	lastAssistantState: AssistantState | undefined,
): SessionStatus {
	if (isRunning) return "running";
	switch (lastAssistantState) {
		case AssistantState.success:
			return "done";
		case AssistantState.error:
			return "failed";
		case AssistantState.cancelled:
			return "cancelled";
		case AssistantState.streaming:
			return "interrupted";
		default:
			return "idle";
	}
}

/**
 * Status for a sidebar row, which may have no live session at all.
 *
 * `running` needs a live session: only it knows a stream is in flight, so that
 * can never be inferred from persistence. But a *settled* outcome outlives the
 * session — the registry keeps only a few parked idle sessions and evicts the
 * rest, so after navigating away the in-memory state is simply gone. Reading
 * `idle` there presented a known outcome as unknown and the row's icon
 * disappeared; the persisted outcome is what the row should fall back to.
 *
 * Live state wins when it is present, because it is the fresher of the two.
 */
export function deriveRowStatus(
	isRunning: boolean,
	lastAssistantState: AssistantState | undefined,
	persistedState: AssistantState | undefined,
): SessionStatus {
	if (isRunning) return "running";
	const state = lastAssistantState ?? persistedState;
	return state === undefined ? "idle" : deriveSessionStatus(false, state);
}
