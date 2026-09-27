import { describe, expect, it } from "vitest";
import { clampSidebarWidth } from "../../src/components/chat/session-sidebar/resize";

describe("clampSidebarWidth", () => {
	it("clamps to min 180", () => {
		expect(clampSidebarWidth(50, 1000, "right")).toBe(180);
	});
	it("clamps to max containerWidth - 325", () => {
		expect(clampSidebarWidth(999, 600, "right")).toBe(275); // 600 - 325
	});
	it("passes through a valid width", () => {
		expect(clampSidebarWidth(300, 1000, "right")).toBe(300);
	});
	it("never returns below min even when container is tiny", () => {
		expect(clampSidebarWidth(300, 400, "left")).toBe(180); // max would be 75 < 180 -> min wins
	});
});
