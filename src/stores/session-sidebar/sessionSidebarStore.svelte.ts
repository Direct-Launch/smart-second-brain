import { TFile, type Plugin, debounce } from "obsidian";
import { getPlugin } from "../state.svelte";
import { getData } from "../dataStore.svelte";
import { toRows, type SessionRow } from "./logic";

export class SessionSidebarStore {
	rows = $state<SessionRow[]>([]);
	#refreshDebounced = debounce(() => void this.refresh(), 150, false);

	async refresh(): Promise<void> {
		const snapshots = await getPlugin().agentManager.getAllThreads();
		this.rows = toRows(snapshots, (id) => getData().getSessionFlags(id));
		// Mirror each thread's on-disk title into its flags. This is the writer
		// that keeps the mirror true across an external rename (a flag record is
		// not recreated by a file rename, so without this a renamed thread's
		// cached name would be the one it had when it first settled).
		for (const row of this.rows) getData().setSessionTitle(row.threadId, row.title);
	}

	init(plugin: Plugin): void {
		const isChat = (f: unknown): f is TFile => f instanceof TFile && f.extension === "chat";
		// ponytail: full re-read per .chat change; O(n) but n = chat count, fine for realistic vaults.
		plugin.registerEvent(
			plugin.app.vault.on("create", (f) => {
				if (isChat(f)) this.#refreshDebounced();
			}),
		);
		plugin.registerEvent(
			plugin.app.vault.on("delete", (f) => {
				if (isChat(f)) {
					getData().removeSessionFlags(f.path);
					this.#refreshDebounced();
				}
			}),
		);
		plugin.registerEvent(
			plugin.app.vault.on("rename", (f, oldPath) => {
				if (isChat(f)) {
					getData().renameSessionFlags(oldPath, f.path);
					this.#refreshDebounced();
				}
			}),
		);
		void this.refresh();
	}

	dispose(): void {
		this.rows = [];
	}
}

let singleton: SessionSidebarStore | null = null;
export function getSessionSidebarStore(): SessionSidebarStore {
	if (!singleton) singleton = new SessionSidebarStore();
	return singleton;
}
