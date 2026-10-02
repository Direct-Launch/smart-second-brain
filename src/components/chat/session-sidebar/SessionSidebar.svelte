<script lang="ts">
import type { ThreadPathStore } from "../../../views/chat/threadPathStore.svelte";
import SessionList from "./SessionList.svelte";

interface Props {
	threadPathStore: ThreadPathStore;
}
const { threadPathStore }: Props = $props();
</script>

<div class="s2b-session-sidebar">
	<SessionList {threadPathStore} />
</div>

<style>
	.s2b-session-sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		overflow: hidden;
		border-right: 1px solid var(--background-modifier-border);
	}
</style>
