export type SidebarSide = "left" | "right";
export const SIDEBAR_MIN = 180;
export const CHAT_RESERVED = 325; // 320 chat + 5 resizer

/** How long a run of discrete width changes (held arrow key) is coalesced
 * before being persisted. Drag gestures never wait on this — they persist on
 * pointerup. */
export const COMMIT_DEBOUNCE_MS = 250;

/** Clamp a desired sidebar width to `[SIDEBAR_MIN, containerWidth - CHAT_RESERVED]`,
 * falling back to `SIDEBAR_MIN` when the container is too small to leave room
 * for the chat pane. `_side` is unused today (both sides share the same clamp)
 * but kept so callers don't need to special-case direction here. */
export function clampSidebarWidth(desired: number, containerWidth: number, _side: SidebarSide): number {
	const max = containerWidth - CHAT_RESERVED;
	const upper = Math.max(SIDEBAR_MIN, max);
	return Math.min(Math.max(desired, SIDEBAR_MIN), upper);
}

interface SessionResizerOptions {
	getWidth: () => number;
	/** On-screen only: update the rendered width. Must NOT persist. */
	previewWidth: (w: number) => void;
	/** Persist the settled width. Called at most once per gesture. */
	commitWidth: (w: number) => void;
	getContainerWidth: () => number;
	side: SidebarSide;
}

/** Svelte action for the sidebar's resize divider: pointer-drag and
 * ArrowLeft/ArrowRight (16px step) both clamp through {@link clampSidebarWidth}.
 * Adds/removes a body class while dragging so other UI (e.g. iframes) can
 * suspend pointer-event handling for the duration.
 *
 * Persistence is deliberately separated from rendering. A drag previews on every
 * `pointermove` but writes **once**, on `pointerup`; a held arrow key is
 * coalesced through a short debounce. Writing settings per pointer move is what
 * corrupted `data.json` on 2026-09-27 — the store's setter saves on every
 * assignment, so a single drag produced a burst of whole-file writes. */
export function sessionResizer(node: HTMLElement, opts: SessionResizerOptions) {
	let startX = 0;
	let startW = 0;
	let dragging = false;
	let commitTimer: ReturnType<typeof setTimeout> | null = null;
	let pending: number | null = null;

	const clearCommitTimer = () => {
		if (commitTimer !== null) {
			clearTimeout(commitTimer);
			commitTimer = null;
		}
	};

	/** Write the settled width, if one is outstanding. Idempotent. */
	const flush = () => {
		clearCommitTimer();
		if (pending === null) return;
		const w = pending;
		pending = null;
		opts.commitWidth(w);
	};

	/** Preview immediately; mark the width as needing a commit. */
	const apply = (w: number) => {
		opts.previewWidth(w);
		pending = w;
	};

	const onMove = (e: PointerEvent) => {
		if (!dragging) return;
		const dir = opts.side === "left" ? 1 : -1;
		// Preview only. The commit happens on pointerup, so a long or slow drag
		// cannot turn into a stream of settings writes.
		apply(clampSidebarWidth(startW + (e.clientX - startX) * dir, opts.getContainerWidth(), opts.side));
	};
	const onUp = () => {
		if (!dragging) return;
		dragging = false;
		document.body.classList.remove("s2b-resizing-session-sidebar");
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		flush();
	};
	const onDown = (e: PointerEvent) => {
		dragging = true;
		startX = e.clientX;
		startW = opts.getWidth();
		document.body.classList.add("s2b-resizing-session-sidebar");
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		e.preventDefault();
	};
	const onKey = (e: KeyboardEvent) => {
		const step = 16;
		const dir = opts.side === "left" ? 1 : -1;
		if (e.key === "ArrowLeft") {
			apply(clampSidebarWidth(opts.getWidth() - step * dir, opts.getContainerWidth(), opts.side));
		} else if (e.key === "ArrowRight") {
			apply(clampSidebarWidth(opts.getWidth() + step * dir, opts.getContainerWidth(), opts.side));
		} else {
			return;
		}
		// Discrete presses with no "release" signal, so coalesce a held key.
		if (commitTimer === null) commitTimer = setTimeout(flush, COMMIT_DEBOUNCE_MS);
		e.preventDefault();
	};

	node.addEventListener("pointerdown", onDown);
	node.addEventListener("keydown", onKey);

	return {
		destroy() {
			node.removeEventListener("pointerdown", onDown);
			node.removeEventListener("keydown", onKey);
			// Do not lose a width the user already chose.
			flush();
			onUp();
		},
	};
}
