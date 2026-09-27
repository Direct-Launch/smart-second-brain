<script lang="ts">
import SessionList from "./SessionList.svelte";

interface Props {
	threadPath: string | null;
}
const { threadPath }: Props = $props();
</script>

<div class="s2b-session-sidebar">
	<SessionList {threadPath} />
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
