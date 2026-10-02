import type { ThreadSnapshot } from "../../agent/memory/ThreadStore";
import type { SessionFlags } from "../../types/plugin";

export type SortMode = "last-updated" | "created";

export interface SessionRow {
	threadId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	pinned: boolean;
	pinnedAt: number;
	archived: boolean;
}
export interface SessionSections {
	pinned: SessionRow[];
	active: SessionRow[];
	archived: SessionRow[];
}

export function toRows(snapshots: ThreadSnapshot[], flagsFor: (id: string) => SessionFlags): SessionRow[] {
	return snapshots.map((s) => {
		const f = flagsFor(s.threadId);
		return {
			threadId: s.threadId,
			title: s.title ?? "New conversation",
			createdAt: s.createdAt,
			updatedAt: s.updatedAt,
			pinned: !!f.pinned,
			pinnedAt: f.pinnedAt ?? 0,
			archived: !!f.archived,
		};
	});
}

export function sortRows(rows: SessionRow[], mode: SortMode): SessionRow[] {
	const key = mode === "created" ? (r: SessionRow) => r.createdAt : (r: SessionRow) => r.updatedAt;
	return [...rows].sort((a, b) => key(b) - key(a));
}

export function filterRows(rows: SessionRow[], query: string): SessionRow[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((r) => r.title.toLowerCase().includes(q));
}

export function partition(rows: SessionRow[]): SessionSections {
	const pinned: SessionRow[] = [];
	const active: SessionRow[] = [];
	const archived: SessionRow[] = [];
	for (const r of rows) {
		if (r.archived) archived.push(r);
		else if (r.pinned) pinned.push(r);
		else active.push(r);
	}
	pinned.sort((a, b) => b.pinnedAt - a.pinnedAt);
	return { pinned, active, archived };
}
