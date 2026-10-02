<script lang="ts">
import { Menu } from "obsidian";
import { icon } from "../../../utils/utils";
import type { SessionRow } from "../../../stores/session-sidebar/logic";
import { SESSION_STATUS_DISPLAY, type SessionStatus } from "../../../stores/session-sidebar/status";

interface Props {
	row: SessionRow;
	active: boolean;
	status: SessionStatus;
	archivedView: boolean;
	onOpen: () => void;
	onRename: () => void;
	onDelete: () => void;
	onTogglePin: () => void;
	onToggleArchive: () => void;
}
const { row, active, status, archivedView, onOpen, onRename, onDelete, onTogglePin, onToggleArchive }: Props = $props();

/** running stays the single flag the row actions gate on; it is derived from the
 * one status value rather than passed separately, so the indicator and the
 * archive-disable can never disagree. */
const running = $derived(status === "running");
const statusDisplay = $derived(SESSION_STATUS_DISPLAY[status]);

const dateStr = $derived(new Date(row.updatedAt).toLocaleDateString());

/**
 * Touch fallback for the hover-only action buttons (see the `@media (hover:
 * none)` split below). Mirrors the same row actions in an Obsidian Menu.
 */
function openOverflowMenu(event: MouseEvent) {
	event.stopPropagation();
	const menu = new Menu();

	menu.addItem((item) => item.setTitle("Open").setIcon("panel-right-open").onClick(onOpen));

	if (archivedView) {
		menu.addItem((item) => item.setTitle("Restore").setIcon("undo-2").onClick(onToggleArchive));
	} else {
		menu.addItem((item) =>
			item
				.setTitle(row.pinned ? "Unpin" : "Pin")
				.setIcon(row.pinned ? "pin-off" : "pin")
				.onClick(onTogglePin),
		);
		menu.addItem((item) => {
			item.setTitle("Archive").setIcon("archive").onClick(onToggleArchive);
			if (running) item.setDisabled(true);
		});
		menu.addItem((item) => item.setTitle("Rename").setIcon("pencil").onClick(onRename));
	}

	menu.addItem((item) => item.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(onDelete));

	menu.showAtMouseEvent(event);
}
</script>

<div class="s2b-session-item" class:s2b-session-item-active={active} class:s2b-session-item-running={running}>
	<button class="s2b-session-item-content" onclick={onOpen} type="button">
		{#if status !== "idle"}
			<span
				class="s2b-session-item-status"
				class:s2b-session-item-status-progress={statusDisplay.tone === "progress"}
				class:s2b-session-item-status-good={statusDisplay.tone === "good"}
				class:s2b-session-item-status-bad={statusDisplay.tone === "bad"}
				class:s2b-session-item-status-neutral={statusDisplay.tone === "neutral"}
				class:s2b-session-item-status-spinning={status === "running"}
				title={statusDisplay.label}
			>
				<span class="s2b-session-item-status-icon" use:icon={statusDisplay.icon}></span>
				<span class="s2b-session-item-status-label">{statusDisplay.label}</span>
			</span>
		{/if}
		<span class="s2b-session-item-title">{row.title}</span>
		<span class="s2b-session-item-date">{dateStr}</span>
	</button>
	<div class="s2b-session-item-actions">
		{#if archivedView}
			<button class="s2b-session-action" aria-label="Restore" onclick={onToggleArchive} type="button">
				<span use:icon={"undo-2"}></span>
			</button>
		{:else}
			<button
				class="s2b-session-action"
				aria-label={row.pinned ? "Unpin" : "Pin"}
				onclick={onTogglePin}
				type="button"
			>
				<span use:icon={row.pinned ? "pin-off" : "pin"}></span>
			</button>
			<button
				class="s2b-session-action"
				aria-label={running ? "Cannot archive a running session" : "Archive"}
				disabled={running}
				onclick={onToggleArchive}
				type="button"
			>
				<span use:icon={"archive"}></span>
			</button>
			<button class="s2b-session-action" aria-label="Rename" onclick={onRename} type="button">
				<span use:icon={"pencil"}></span>
			</button>
		{/if}
		<button class="s2b-session-action s2b-session-delete" aria-label="Delete" onclick={onDelete} type="button">
			<span use:icon={"trash-2"}></span>
		</button>
	</div>
	<button
		class="s2b-session-overflow"
		aria-label="Session actions"
		onclick={openOverflowMenu}
		type="button"
	>
		<span use:icon={"ellipsis"}></span>
	</button>
</div>

<style>
	.s2b-session-item {
		display: flex;
		align-items: center;
		gap: var(--size-2-2);
		padding: var(--size-2-2) var(--size-4-2);
		border-radius: var(--radius-s);
		cursor: pointer;
	}

	.s2b-session-item:hover,
	.s2b-session-item-active {
		background: var(--background-modifier-hover);
	}

	.s2b-session-item-content {
		display: flex;
		align-items: center;
		flex: 1 1 auto;
		min-width: 0;
		gap: var(--size-2-2);
		background: transparent;
		border: none;
		box-shadow: none;
		padding: 0;
		margin: 0;
		font-size: inherit;
		text-align: left;
		cursor: pointer;
	}

	.s2b-session-item-title {
		flex: 1 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-normal);
	}

	.s2b-session-item-date {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
	}

	.s2b-session-item-status {
		display: inline-flex;
		flex: 0 0 auto;
		width: 1em;
		height: 1em;
	}

	.s2b-session-item-status-icon {
		display: inline-flex;
		width: 1em;
		height: 1em;
	}

	.s2b-session-item-status-progress {
		color: var(--text-accent);
	}

	.s2b-session-item-status-good {
		color: var(--color-green);
	}

	.s2b-session-item-status-bad {
		color: var(--color-red);
	}

	.s2b-session-item-status-neutral {
		color: var(--text-faint);
	}

	.s2b-session-item-status-spinning .s2b-session-item-status-icon {
		animation: s2b-session-item-spin 1.2s linear infinite;
	}

	/* Present in the DOM for assistive tech, invisible on screen: the row is too
	   narrow for a word, but colour must never be the only signal. */
	.s2b-session-item-status-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@keyframes s2b-session-item-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.s2b-session-item-actions {
		display: none;
		flex: 0 0 auto;
		gap: var(--size-2-1);
	}

	@media (hover: hover) {
		.s2b-session-item:hover .s2b-session-item-actions,
		.s2b-session-item:focus-within .s2b-session-item-actions {
			display: flex;
		}
	}

	@media (hover: none) {
		.s2b-session-item-actions {
			display: none !important;
		}
	}

	.s2b-session-overflow {
		display: none;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		width: var(--size-4-6);
		height: var(--size-4-6);
		padding: 0;
		background: transparent;
		border: none;
		box-shadow: none;
		border-radius: var(--radius-s);
		color: var(--text-muted);
		cursor: pointer;
	}

	@media (hover: none) {
		.s2b-session-overflow {
			display: inline-flex;
		}
	}

	@media (hover: hover) {
		.s2b-session-overflow {
			display: none;
		}
	}

	.s2b-session-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--size-4-6);
		height: var(--size-4-6);
		padding: 0;
		background: transparent;
		border: none;
		box-shadow: none;
		border-radius: var(--radius-s);
		color: var(--text-muted);
		cursor: pointer;
	}

	.s2b-session-action:hover:not(:disabled) {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.s2b-session-action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.s2b-session-delete:hover:not(:disabled) {
		color: var(--color-red);
	}
</style>
