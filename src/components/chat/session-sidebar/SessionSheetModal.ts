import type { App } from "obsidian";
import { SvelteModal } from "../../modal/SvelteModal";
import SessionList from "./SessionList.svelte";

/**
 * Full-height modal hosting the shared session list for narrow/mobile widths,
 * where the docked `SessionSidebar` has no room. Opening a chat from the list
 * closes the modal (`onOpenSession`).
 */
export class SessionSheetModal extends SvelteModal {
	constructor(
		app: App,
		private threadPath: string | null,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle("Sessions");
		this.modalEl.addClass("s2b-session-sheet");

		this.mountComponent(
			SessionList,
			{ threadPath: this.threadPath, onOpenSession: () => this.close() },
			{
				fullScreenOnPhone: true,
				width: "min(420px, 94vw)",
				maxWidth: "94vw",
				height: "min(840px, 92vh)",
				contentOverflow: "hidden",
			},
		);
	}
}
