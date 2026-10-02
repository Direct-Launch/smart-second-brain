import { describe, it, expect } from "vitest";
import { toRows, sortRows, filterRows, partition } from "../../src/stores/session-sidebar/logic";

const snap = (id: string, c: number, u: number, title?: string) => ({
	threadId: id,
	title,
	createdAt: c,
	updatedAt: u,
});

describe("session sidebar logic", () => {
	it("toRows applies flags and title fallback", () => {
		const rows = toRows([snap("a.chat", 1, 2)], () => ({ pinned: true, pinnedAt: 5 }));
		expect(rows[0]).toMatchObject({
			threadId: "a.chat",
			title: "New conversation",
			pinned: true,
			pinnedAt: 5,
			archived: false,
		});
	});
	it("sortRows last-updated desc", () => {
		const rows = toRows([snap("a", 1, 10), snap("b", 1, 20)], () => ({}));
		expect(sortRows(rows, "last-updated").map((r) => r.threadId)).toEqual(["b", "a"]);
	});
	it("sortRows created desc", () => {
		const rows = toRows([snap("a", 30, 1), snap("b", 10, 1)], () => ({}));
		expect(sortRows(rows, "created").map((r) => r.threadId)).toEqual(["a", "b"]);
	});
	it("filterRows matches title case-insensitively", () => {
		const rows = toRows([snap("a", 1, 1, "Hello World"), snap("b", 1, 1, "Other")], () => ({}));
		expect(filterRows(rows, "hello").map((r) => r.threadId)).toEqual(["a"]);
	});
	it("partition splits pinned/active/archived; archived beats pinned", () => {
		const rows = toRows([snap("p", 1, 1), snap("a", 1, 1), snap("z", 1, 1)], (id) =>
			id === "p" ? { pinned: true, pinnedAt: 9 } : id === "z" ? { pinned: true, archived: true } : {},
		);
		const s = partition(rows);
		expect(s.pinned.map((r) => r.threadId)).toEqual(["p"]);
		expect(s.active.map((r) => r.threadId)).toEqual(["a"]);
		expect(s.archived.map((r) => r.threadId)).toEqual(["z"]);
	});
});
