<script lang="ts">
	import TubeDetailPanel from '$lib/components/TubeDetailPanel.svelte';
	import type { SearchTubeSummary, TubeDetailResponse } from '$lib/server/tubes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state(data.filters.q);
	let inStockOnly = $state(data.filters.inStockOnly);
	let baseFilter = $state(data.filters.base);
	let pinCountFilter = $state(data.filters.pinCount);
	let boxFilter = $state(data.filters.boxNo);
	let testFilter = $state(data.filters.testStatus);

	let items = $state<SearchTubeSummary[]>(data.searchResult.items);
	let totalMatched = $state(data.searchResult.totalMatched);
	let quarantinedMatchHidden = $state(data.searchResult.quarantinedMatchHidden);
	let detail = $state<TubeDetailResponse | null>(data.initialDetail);
	let selectedId = $state<string>(data.filters.tube);

	let searching = $state(false);
	let loadingDetail = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const QUICK_PICKS = ['6SN7', '6L6', '12AX7', '5U4', '0A2', '6SK7'];

	function buildSearchParams(overrideLimit = 60): URLSearchParams {
		const sp = new URLSearchParams();
		if (query.trim()) sp.set('q', query.trim());
		if (inStockOnly) sp.set('inStockOnly', 'true');
		if (baseFilter) sp.set('base', baseFilter);
		if (pinCountFilter) sp.set('pinCount', pinCountFilter);
		if (boxFilter) sp.set('boxNo', boxFilter);
		if (testFilter) sp.set('testStatus', testFilter);
		sp.set('limit', String(overrideLimit));
		return sp;
	}

	async function runSearch(autoSelectFirst = false) {
		searching = true;
		try {
			const sp = buildSearchParams(80);
			const res = await fetch(`/api/tubes/search?${sp.toString()}`);
			if (!res.ok) return;
			const payload = await res.json();
			items = payload.items;
			totalMatched = payload.totalMatched;
			quarantinedMatchHidden = payload.quarantinedMatchHidden;

			if (autoSelectFirst && items.length > 0) {
				await selectTube(items[0].tubeRefId);
			} else if (items.length === 0) {
				detail = null;
				selectedId = '';
			}
		} finally {
			searching = false;
		}
	}

	function scheduleSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			void runSearch(true);
		}, 180);
	}

	async function selectTube(tubeRefId: string) {
		selectedId = tubeRefId;
		loadingDetail = true;
		try {
			const res = await fetch(`/api/tubes/${encodeURIComponent(tubeRefId)}`);
			if (res.ok) {
				detail = await res.json();
			}
		} finally {
			loadingDetail = false;
		}
	}

	function resetFilters() {
		query = '';
		inStockOnly = false;
		baseFilter = '';
		pinCountFilter = '';
		boxFilter = '';
		testFilter = '';
		void runSearch(true);
	}

	function tierBadge(tier: number | null): string | null {
		if (tier === 1) return 'Exact Match';
		if (tier === 2) return 'Prefix';
		if (tier === 3) return 'Substitute';
		if (tier === 4) return 'Keyword';
		return null;
	}
</script>

<svelte:head>
	<title>Find a Tube — PSARA Tube Lab</title>
</svelte:head>

{#if data.notice === 'admin-required'}
	<div
		role="status"
		class="mb-5 rounded-xl border-2 border-amber-800 bg-amber-50 p-4 text-base font-bold text-amber-950"
	>
		Manage Inventory requires an Admin or Curator account. You can switch views in Demo Mode or
		<a href="/login" class="underline">sign in here</a>.
	</div>
{/if}

<section aria-labelledby="search-heading" class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 id="search-heading" class="text-2xl font-extrabold text-stone-950 sm:text-3xl">
			Find a Vacuum Tube
		</h1>
		<p class="text-base font-semibold text-stone-800">
			Showing <span class="font-extrabold tabular-nums">{items.length}</span> of
			<span class="font-extrabold tabular-nums">{totalMatched}</span> verified tube types
		</p>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			void runSearch(true);
		}}
		class="mt-4 space-y-4"
	>
		<div class="flex flex-col gap-3 sm:flex-row">
			<div class="relative flex-1">
				<label for="tube-search-input" class="sr-only">
					Search by tube number, box label, family, function, or notes
				</label>
				<input
					id="tube-search-input"
					type="search"
					bind:value={query}
					oninput={scheduleSearch}
					placeholder="Type tube number (e.g. 6SN7, 5U4, 12AX7) or keyword (rectifier, audio)..."
					class="min-h-13 w-full rounded-xl border-2 border-stone-900 bg-white px-4 py-3 text-lg font-medium text-stone-950 placeholder:text-stone-500 focus:border-amber-800 focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				class="min-h-13 cursor-pointer rounded-xl bg-stone-950 px-6 py-3 text-lg font-bold text-white hover:bg-stone-800"
			>
				{searching ? 'Searching...' : 'Search'}
			</button>
			<button
				type="button"
				onclick={resetFilters}
				class="min-h-13 cursor-pointer rounded-xl border-2 border-stone-700 bg-stone-100 px-5 py-3 text-base font-bold text-stone-950 hover:bg-stone-200"
			>
				Reset
			</button>
		</div>

		<!-- Quick Preset Buttons -->
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm font-bold text-stone-800">Quick examples:</span>
			{#each QUICK_PICKS as pick}
				<button
					type="button"
					onclick={() => {
						query = pick;
						void runSearch(true);
					}}
					class="min-h-10 cursor-pointer rounded-lg border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-950 hover:bg-amber-100"
				>
					{pick}
				</button>
			{/each}
		</div>

		<!-- Filter Row -->
		<div class="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-5">
			<label
				class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 text-base font-bold transition-colors {inStockOnly
					? 'border-emerald-800 bg-emerald-50 text-emerald-950'
					: 'border-stone-500 bg-stone-50 text-stone-950'}"
			>
				<input
					type="checkbox"
					bind:checked={inStockOnly}
					onchange={() => void runSearch(true)}
					class="h-5 w-5 accent-emerald-800"
				/>
				In Club Stock Only
			</label>

			<div>
				<label for="base-filter" class="sr-only">Base type</label>
				<select
					id="base-filter"
					bind:value={baseFilter}
					onchange={() => void runSearch(true)}
					class="min-h-12 w-full rounded-xl border-2 border-stone-500 bg-white px-3 py-2 text-base font-semibold text-stone-950"
				>
					<option value="">All Base Sockets</option>
					{#each data.filterOptions.bases as base}
						<option value={base}>{base}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="pin-filter" class="sr-only">Pin count</label>
				<select
					id="pin-filter"
					bind:value={pinCountFilter}
					onchange={() => void runSearch(true)}
					class="min-h-12 w-full rounded-xl border-2 border-stone-500 bg-white px-3 py-2 text-base font-semibold text-stone-950"
				>
					<option value="">Any Pin Count</option>
					{#each data.filterOptions.pinCounts as pins}
						<option value={String(pins)}>{pins} pins</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="box-filter" class="sr-only">Storage box</label>
				<select
					id="box-filter"
					bind:value={boxFilter}
					onchange={() => void runSearch(true)}
					class="min-h-12 w-full rounded-xl border-2 border-stone-500 bg-white px-3 py-2 text-base font-semibold text-stone-950"
				>
					<option value="">All Storage Boxes</option>
					{#each data.filterOptions.boxes as box}
						<option value={box}>Box {box}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="test-filter" class="sr-only">Test status</label>
				<select
					id="test-filter"
					bind:value={testFilter}
					onchange={() => void runSearch(true)}
					class="min-h-12 w-full rounded-xl border-2 border-stone-500 bg-white px-3 py-2 text-base font-semibold text-stone-950"
				>
					<option value="">Any Test Status</option>
					<option value="Tested">Tested</option>
					<option value="Untested">Untested</option>
					<option value="Weak">Weak</option>
					<option value="Bad">Bad</option>
				</select>
			</div>
		</div>
	</form>

	{#if quarantinedMatchHidden}
		<div
			role="note"
			class="mt-4 rounded-xl border-2 border-amber-800 bg-amber-50 p-4 text-base font-semibold text-amber-950"
		>
			Note: An unverified record matching "{query}" is currently quarantined under Unidentified
			status for curator review and is hidden from club member lookup.
		</div>
	{/if}
</section>

<!-- Split Workbench: Ranked Results + Detail Panel -->
<div class="mt-6 grid gap-6 lg:grid-cols-12">
	<!-- Left: Matching Tubes List -->
	<section
		aria-label="Matching tubes"
		class="space-y-3 lg:col-span-5 xl:col-span-4"
	>
		{#if items.length === 0}
			<div class="rounded-2xl border-2 border-stone-400 bg-white p-6 text-center">
				<p class="text-xl font-extrabold text-stone-950">No matching tubes found</p>
				<p class="mt-2 text-base text-stone-800">
					Try clearing filters, checking the spelling, or using the Mystery Tube Helper for
					unmarked tubes.
				</p>
				<button
					type="button"
					onclick={resetFilters}
					class="mt-4 min-h-12 cursor-pointer rounded-xl bg-stone-900 px-5 py-2.5 text-base font-bold text-white"
				>
					Show All Active Tubes
				</button>
			</div>
		{:else}
			<ul class="space-y-2.5">
				{#each items as tube}
					{@const badge = tierBadge(tube.matchTier)}
					<li>
						<button
							type="button"
							onclick={() => void selectTube(tube.tubeRefId)}
							aria-current={selectedId === tube.tubeRefId ? 'true' : undefined}
							class="w-full cursor-pointer rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline-3 focus-visible:outline-amber-800 {selectedId ===
							tube.tubeRefId
								? 'border-stone-950 bg-amber-50 shadow-sm'
								: 'border-stone-400 bg-white hover:border-stone-800 hover:bg-stone-50'}"
						>
							<div class="flex items-start justify-between gap-2">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-xl font-extrabold text-stone-950">
											{tube.referenceDesignation}
										</span>
										{#if badge}
											<span
												class="rounded-md px-2 py-0.5 text-xs font-bold {tube.matchTier === 1
													? 'bg-stone-900 text-white'
													: tube.matchTier === 3
														? 'bg-blue-100 text-blue-950'
														: 'bg-stone-200 text-stone-900'}"
											>
												{badge}
											</span>
										{/if}
									</div>
									{#if tube.generalFunction || tube.internalStructure}
										<p class="mt-1 text-sm font-medium text-stone-800">
											{[tube.internalStructure, tube.generalFunction].filter(Boolean).join(' · ')}
										</p>
									{/if}
								</div>

								<span
									class="shrink-0 rounded-lg px-3 py-1 text-sm font-extrabold tabular-nums {tube.totalQty > 0 ||
									tube.hasUnknownQty
										? 'bg-emerald-100 text-emerald-950'
										: 'bg-stone-200 text-stone-800'}"
								>
									{tube.totalQty}{tube.hasUnknownQty ? '+' : ''} in stock
								</span>
							</div>

							<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-stone-700">
								{#if tube.base}
									<span>{tube.base}</span>
								{/if}
								{#if tube.basingCode}
									<span>Basing: {tube.basingCode}</span>
								{/if}
								{#if tube.boxes.length > 0}
									<span>Boxes: {tube.boxes.join(', ')}</span>
								{/if}
							</div>

							{#if tube.matchTier === 3 && tube.matchReason}
								<p class="mt-1.5 text-xs font-bold text-blue-950">
									Why suggested: {tube.matchReason}
								</p>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Right: Selected Tube Detail -->
	<section aria-label="Selected tube details" class="lg:col-span-7 xl:col-span-8">
		{#if loadingDetail}
			<div class="rounded-2xl border-2 border-stone-400 bg-white p-8 text-center">
				<p class="text-xl font-bold text-stone-800">Loading tube reference &amp; diagrams...</p>
			</div>
		{:else if detail}
			<TubeDetailPanel {detail} onSelectTube={(id) => void selectTube(id)} />
		{:else}
			<div class="rounded-2xl border-2 border-stone-400 bg-white p-8 text-center">
				<p class="text-xl font-bold text-stone-900">Select a tube on the left to view full specs.</p>
			</div>
		{/if}
	</section>
</div>
