export type SidebarSide = "left" | "right";
export const SIDEBAR_MIN = 180;
export const CHAT_RESERVED = 325; // 320 chat + 5 resizer

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
	setWidth: (w: number) => void;
	getContainerWidth: () => number;
	side: SidebarSide;
}

/** Svelte action for the sidebar's resize divider: pointer-drag and
 * ArrowLeft/ArrowRight (16px step) both clamp through {@link clampSidebarWidth}.
 * Adds/removes a body class while dragging so other UI (e.g. iframes) can
 * suspend pointer-event handling for the duration. */
export function sessionResizer(node: HTMLElement, opts: SessionResizerOptions) {
	let startX = 0;
	let startW = 0;

	const onMove = (e: PointerEvent) => {
		const dir = opts.side === "left" ? 1 : -1;
		const next = clampSidebarWidth(startW + (e.clientX - startX) * dir, opts.getContainerWidth(), opts.side);
		opts.setWidth(next);
	};
	const onUp = () => {
		document.body.classList.remove("s2b-resizing-session-sidebar");
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
	};
	const onDown = (e: PointerEvent) => {
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
			opts.setWidth(clampSidebarWidth(opts.getWidth() - step * dir, opts.getContainerWidth(), opts.side));
		} else if (e.key === "ArrowRight") {
			opts.setWidth(clampSidebarWidth(opts.getWidth() + step * dir, opts.getContainerWidth(), opts.side));
		} else {
			return;
		}
		e.preventDefault();
	};

	node.addEventListener("pointerdown", onDown);
	node.addEventListener("keydown", onKey);

	return {
		destroy() {
			node.removeEventListener("pointerdown", onDown);
			node.removeEventListener("keydown", onKey);
			onUp();
		},
	};
}
