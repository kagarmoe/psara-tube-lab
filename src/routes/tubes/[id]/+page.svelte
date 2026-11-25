<script lang="ts">
	import TubeDetailPanel from '$lib/components/TubeDetailPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.detail.reference.referenceDesignation} — PSARA Tube Lab</title>
</svelte:head>

<div class="mb-4">
	<a
		href="/"
		class="inline-flex min-h-12 items-center rounded-xl border-2 border-stone-800 bg-white px-5 py-2 text-base font-bold text-stone-950 hover:bg-stone-100"
	>
		← Back to Find a Tube
	</a>
</div>

<TubeDetailPanel detail={data.detail} />
