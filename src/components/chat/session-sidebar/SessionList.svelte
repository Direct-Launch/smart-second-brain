<script lang="ts">
import { getSessionRegistry } from "../../../stores/chatStore.svelte";
import { getData } from "../../../stores/dataStore.svelte";
import { getPlugin } from "../../../stores/state.svelte";
import { getSessionSidebarStore } from "../../../stores/session-sidebar/sessionSidebarStore.svelte";
import { filterRows, partition, sortRows } from "../../../stores/session-sidebar/logic";
import { deriveRowStatus, type SessionStatus } from "../../../stores/session-sidebar/status";
import { icon } from "../../../utils/utils";
import { confirmDelete } from "../../modal/ConfirmModal";
import { promptText } from "../../modal/PromptModal";
import type { ThreadPathStore } from "../../../views/chat/threadPathStore.svelte";
import SessionSidebarItem from "./SessionSidebarItem.svelte";

interface Props {
	threadPathStore: ThreadPathStore;
	onOpenSession?: () => void;
}
const { threadPathStore, onOpenSession }: Props = $props();
const threadPath = $derived(threadPathStore.current);

const plugin = getPlugin();
const store = getSessionSidebarStore();
const registry = getSessionRegistry();
const data = getData();

let query = $state("");
let showArchived = $state(false);
let visibleCount = $state(50);

const filtered = $derived(filterRows(sortRows(store.rows, data.sessionManagerSort), query));
const sections = $derived(partition(filtered));
const listRows = $derived(showArchived ? sections.archived : sections.active);
const visibleRows = $derived(listRows.slice(0, visibleCount));
const remaining = $derived(Math.max(0, listRows.length - visibleCount));

/** Status for a row, from the live session when there is one and from the flag
 * the settle handler persisted when there is not. See `deriveRowStatus`. */
function statusFor(id: string): SessionStatus {
	const session = registry?.sessionFor(id);
	return deriveRowStatus(
		session?.isRunning ?? false,
		session?.lastAssistantState,
		data.getSessionFlags(id).lastStatus,
	);
}

async function newChat() {
	await plugin.agentManager.createNewChat();
}

async function open(id: string) {
	await plugin.agentManager.openChatByThreadId(id);
	onOpenSession?.();
}

async function del(id: string, title: string) {
	if (await confirmDelete(plugin.app, title)) await plugin.agentManager.deleteThread(id);
}

async function rename(id: string, title: string) {
	const next = await promptText(plugin.app, "Rename chat", title, "Rename");
	if (next && next !== title) await plugin.agentManager.renameThread(id, next);
}

function togglePin(id: string, pinned: boolean) {
	plugin.agentManager.setThreadPinned(id, !pinned);
	void store.refresh();
}

function toggleArchive(id: string, archived: boolean) {
	const ok = plugin.agentManager.setThreadArchived(id, !archived);
	if (ok) void store.refresh();
}
</script>

<div class="s2b-session-header">
	<button class="s2b-session-new" onclick={newChat} type="button">
		<span use:icon={"plus"}></span>
		New chat
	</button>
	<button
		class="s2b-session-archive-toggle"
		aria-label={showArchived ? "Show sessions" : "Show archived"}
		class:s2b-session-archive-toggle-active={showArchived}
		onclick={() => (showArchived = !showArchived)}
		type="button"
	>
		<span use:icon={"archive"}></span>
	</button>
</div>

<div class="s2b-session-controls">
	<input
		class="s2b-session-search"
		type="search"
		placeholder={showArchived ? "Search archived sessions" : "Search sessions"}
		aria-label={showArchived ? "Search archived sessions" : "Search sessions"}
		bind:value={query}
		autocomplete="off"
	/>
	<select
		class="s2b-session-sort dropdown"
		aria-label="Sort sessions"
		bind:value={data.sessionManagerSort}
	>
		<option value="last-updated">Last updated</option>
		<option value="created">Created</option>
	</select>
</div>

{#if !showArchived && sections.pinned.length}
	<div class="s2b-session-section s2b-session-section-pinned">
		<div class="s2b-session-section-label">Pinned</div>
		{#each sections.pinned as row (row.threadId)}
			<SessionSidebarItem
				{row}
				active={row.threadId === threadPath}
				status={statusFor(row.threadId)}
				archivedView={false}
				onOpen={() => open(row.threadId)}
				onRename={() => rename(row.threadId, row.title)}
				onDelete={() => del(row.threadId, row.title)}
				onTogglePin={() => togglePin(row.threadId, row.pinned)}
				onToggleArchive={() => toggleArchive(row.threadId, row.archived)}
			/>
		{/each}
	</div>
{/if}

<div class="s2b-session-section s2b-session-section-list">
	<div class="s2b-session-section-label">{showArchived ? "Archived" : "Sessions"}</div>
	{#if visibleRows.length === 0}
		<div class="s2b-session-empty">{query ? "No matching sessions" : "No conversations"}</div>
	{/if}
	{#each visibleRows as row (row.threadId)}
		<SessionSidebarItem
			{row}
			active={row.threadId === threadPath}
			status={statusFor(row.threadId)}
			archivedView={showArchived}
			onOpen={() => open(row.threadId)}
			onRename={() => rename(row.threadId, row.title)}
			onDelete={() => del(row.threadId, row.title)}
			onTogglePin={() => togglePin(row.threadId, row.pinned)}
			onToggleArchive={() => toggleArchive(row.threadId, row.archived)}
		/>
	{/each}
	{#if remaining > 0}
		<button class="s2b-session-load-more" onclick={() => (visibleCount += 50)} type="button">
			Load more ({remaining} remaining)
		</button>
	{/if}
</div>

<style>
	.s2b-session-header {
		display: flex;
		align-items: center;
		gap: var(--size-2-2);
		padding: var(--size-4-2);
		flex: 0 0 auto;
	}

	.s2b-session-new {
		display: flex;
		align-items: center;
		gap: var(--size-2-2);
		flex: 1 1 auto;
		justify-content: center;
	}

	.s2b-session-archive-toggle {
		flex: 0 0 auto;
	}

	.s2b-session-archive-toggle-active {
		color: var(--text-accent);
	}

	.s2b-session-controls {
		display: flex;
		gap: var(--size-2-2);
		padding: 0 var(--size-4-2) var(--size-4-2);
		flex: 0 0 auto;
	}

	.s2b-session-search {
		flex: 1 1 auto;
		min-width: 0;
	}

	.s2b-session-sort {
		flex: 0 0 auto;
	}

	.s2b-session-section {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.s2b-session-section-pinned {
		flex: 0 1 auto;
		max-height: 50%;
		overflow-y: auto;
	}

	.s2b-session-section-list {
		flex: 1 1 auto;
		overflow-y: auto;
	}

	.s2b-session-section-label {
		padding: var(--size-2-1) var(--size-4-2);
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
		text-transform: uppercase;
	}

	.s2b-session-empty {
		padding: var(--size-4-2);
		color: var(--text-faint);
		font-size: var(--font-ui-small);
	}

	.s2b-session-load-more {
		margin: var(--size-2-2) var(--size-4-2);
	}
</style>
