import { describe, expect, it, vi } from "vitest";
import { sessionResizer, type SidebarSide } from "../../src/components/chat/session-sidebar/resize";

/** Mount the resizer on a detached node with counting spies, so a test can
 * assert *how many times* a gesture persists — not just where it ends up. */
function mount(initial = 240, side: SidebarSide = "right") {
	let width = initial;
	const previews: number[] = [];
	const commits: number[] = [];
	const node = document.createElement("div");
	const action = sessionResizer(node, {
		getWidth: () => width,
		previewWidth: (w) => {
			width = w;
			previews.push(w);
		},
		commitWidth: (w) => {
			commits.push(w);
		},
		getContainerWidth: () => 1200,
		side,
	});
	document.body.appendChild(node);
	return { node, action, previews, commits, width: () => width };
}

const down = (x: number) => window.dispatchEvent(new MouseEvent("pointerdown", { clientX: x }));
const move = (x: number) => window.dispatchEvent(new MouseEvent("pointermove", { clientX: x }));
const up = () => window.dispatchEvent(new MouseEvent("pointerup"));

describe("sessionResizer persistence", () => {
	it("previews every move but persists exactly once for a whole drag", () => {
		vi.useFakeTimers();
		const d = mount();
		d.node.dispatchEvent(new MouseEvent("pointerdown", { clientX: 1000 }));
		for (let i = 1; i <= 50; i++) move(1000 - i * 3);

		expect(d.previews.length).toBe(50);
		expect(d.commits.length).toBe(0); // nothing written mid-gesture

		up();
		vi.useRealTimers();
		expect(d.commits.length).toBe(1);
		expect(d.commits[0]).toBe(d.previews[d.previews.length - 1]);
	});

	it("does not persist mid-drag even when the drag outlasts the debounce", () => {
		// The regression this guards: a slow drag must not become a write burst.
		vi.useFakeTimers();
		const d = mount();
		d.node.dispatchEvent(new MouseEvent("pointerdown", { clientX: 1000 }));
		move(990);
		vi.advanceTimersByTime(5000);
		expect(d.commits.length).toBe(0);
		up();
		vi.useRealTimers();
		expect(d.commits.length).toBe(1);
	});

	it("coalesces a held arrow key into a single persist", () => {
		vi.useFakeTimers();
		const d = mount();
		for (let i = 0; i < 5; i++) {
			d.node.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
			vi.advanceTimersByTime(20); // faster than the commit debounce
		}
		expect(d.commits.length).toBe(0);
		vi.advanceTimersByTime(500);
		vi.useRealTimers();
		expect(d.commits.length).toBe(1);
	});

	it("commits the final width, so the size survives a reload", () => {
		// Guards the opposite failure: silencing the write while losing the value.
		const d = mount();
		d.node.dispatchEvent(new MouseEvent("pointerdown", { clientX: 1000 }));
		move(950);
		up();
		expect(d.width()).toBe(290); // 240 + 50
		expect(d.commits).toEqual([290]);
	});
});
