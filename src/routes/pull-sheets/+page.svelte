<script lang="ts">
	import type { PullSheetItemView, PullSheetView } from '$lib/server/pullSheets';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let sheets = $state<PullSheetView[]>(data.sheets);
	let statusTab = $state<'All' | 'Pending' | 'Pulled' | 'Returned' | 'Closed'>('All');
	let busyKey = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// New Pull Sheet form
	let newMemberName = $state(data.defaultMemberName);
	let newPurpose = $state('');

	// Per-item return modal/drawer state
	let returnTarget = $state<PullSheetItemView | null>(null);
	let returnQty = $state(1);
	let returnTestStatus = $state('');
	let returnStockCondition = $state('');
	let returnNotes = $state('');

	let filteredSheets = $derived(
		statusTab === 'All' ? sheets : sheets.filter((s) => s.status === statusTab)
	);

	async function refreshSheets() {
		const res = await fetch('/api/pull-sheets');
		if (res.ok) {
			const payload = await res.json();
			sheets = payload.sheets;
		}
	}

	async function createSheet(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		successMessage = null;
		busyKey = 'create';
		try {
			const res = await fetch('/api/pull-sheets', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					memberName: newMemberName,
					purpose: newPurpose
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				errorMessage = payload.error ?? 'Could not create pull sheet.';
				return;
			}
			newPurpose = '';
			successMessage = `Created pull sheet ${payload.sheet.requestCode}. Search tubes under "Find a Tube" to add boxes.`;
			await refreshSheets();
		} finally {
			busyKey = null;
		}
	}

	async function handlePull(item: PullSheetItemView, qtyToPull: number) {
		errorMessage = null;
		successMessage = null;
		busyKey = `pull-${item.id}`;
		try {
			const res = await fetch(`/api/pull-sheets/items/${item.id}/pull`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ qtyToPull })
			});
			const payload = await res.json();
			if (!res.ok) {
				errorMessage = payload.error ?? 'Unable to record pull.';
				return;
			}
			successMessage = `Pulled ${qtyToPull} × ${item.designation} from Box ${item.boxNo ?? '—'} (Layer ${item.boxLayer ?? '—'}).`;
			await refreshSheets();
		} finally {
			busyKey = null;
		}
	}

	function openReturnDrawer(item: PullSheetItemView) {
		returnTarget = item;
		returnQty = Math.max(1, item.qtyPulled - item.qtyReturned);
		returnTestStatus = item.lotTestStatus ?? 'Tested';
		returnStockCondition = item.lotStockCondition ?? 'Unknown';
		returnNotes = '';
	}

	async function submitReturn(e: SubmitEvent) {
		e.preventDefault();
		if (!returnTarget) return;
		errorMessage = null;
		successMessage = null;
		busyKey = `return-${returnTarget.id}`;
		try {
			const res = await fetch(`/api/pull-sheets/items/${returnTarget.id}/return`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					qtyToReturn: Number(returnQty),
					updatedTestStatus: returnTestStatus || null,
					updatedStockCondition: returnStockCondition || null,
					notes: returnNotes
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				errorMessage = payload.error ?? 'Unable to record return.';
				return;
			}
			successMessage = `Returned ${returnQty} × ${returnTarget.designation} back to Box ${returnTarget.boxNo ?? '—'} (${returnTestStatus}).`;
			returnTarget = null;
			await refreshSheets();
		} finally {
			busyKey = null;
		}
	}

	async function removeItem(item: PullSheetItemView) {
		errorMessage = null;
		successMessage = null;
		busyKey = `del-${item.id}`;
		try {
			const res = await fetch(`/api/pull-sheets/items/${item.id}`, {
				method: 'DELETE'
			});
			const payload = await res.json();
			if (!res.ok) {
				errorMessage = payload.error ?? 'Unable to remove item.';
				return;
			}
			successMessage = `Removed ${item.designation} from pull sheet.`;
			await refreshSheets();
		} finally {
			busyKey = null;
		}
	}

	async function closeSheet(sheet: PullSheetView) {
		errorMessage = null;
		successMessage = null;
		busyKey = `close-${sheet.id}`;
		try {
			const res = await fetch(`/api/pull-sheets/${sheet.id}/close`, {
				method: 'POST'
			});
			if (res.ok) {
				successMessage = `Closed pull sheet ${sheet.requestCode}.`;
				await refreshSheets();
			}
		} finally {
			busyKey = null;
		}
	}

	function statusBadgeClass(status: string): string {
		if (status === 'Pending') return 'border-amber-800 bg-amber-100 text-amber-950';
		if (status === 'Pulled') return 'border-blue-800 bg-blue-100 text-blue-950';
		if (status === 'Returned') return 'border-emerald-800 bg-emerald-100 text-emerald-950';
		return 'border-stone-500 bg-stone-200 text-stone-900';
	}
</script>

<svelte:head>
	<title>Pull Sheets — PSARA Tube Lab</title>
</svelte:head>

<div class="space-y-6">
	<section class="no-print rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-2xl font-extrabold text-stone-950 sm:text-3xl">
					Pull Sheets &amp; Return Ledger
				</h1>
				<p class="mt-1 text-base text-stone-800">
					Pick tubes from boxes for a radio project, deduct stock when pulled, and log returns or
					test results back into the box.
				</p>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => window.print()}
					class="min-h-12 cursor-pointer rounded-xl border-2 border-stone-900 bg-stone-100 px-5 py-2.5 text-base font-bold text-stone-950 hover:bg-stone-200"
				>
					Print Pull Sheet
				</button>
				<a
					href="/"
					class="inline-flex min-h-12 items-center rounded-xl bg-amber-800 px-5 py-2.5 text-base font-bold text-white hover:bg-amber-900"
				>
					+ Find Tubes to Add
				</a>
			</div>
		</div>

		<!-- New Pull Sheet Bar -->
		<form
			onsubmit={createSheet}
			class="mt-5 grid gap-3 rounded-xl border-2 border-stone-300 bg-stone-50 p-4 sm:grid-cols-12"
		>
			<div class="sm:col-span-4">
				<label for="ps-member" class="block text-sm font-bold text-stone-900">Member Name</label>
				<input
					id="ps-member"
					type="text"
					bind:value={newMemberName}
					required
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-600 bg-white px-3 py-2 text-base font-semibold text-stone-950"
				/>
			</div>
			<div class="sm:col-span-5">
				<label for="ps-purpose" class="block text-sm font-bold text-stone-900">
					Radio / Project Note (Optional)
				</label>
				<input
					id="ps-purpose"
					type="text"
					bind:value={newPurpose}
					placeholder="e.g., 1938 Zenith 9-S-262 restoration"
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-600 bg-white px-3 py-2 text-base text-stone-950"
				/>
			</div>
			<div class="flex items-end sm:col-span-3">
				<button
					type="submit"
					disabled={busyKey === 'create'}
					class="min-h-11 w-full cursor-pointer rounded-xl bg-stone-950 px-4 py-2 text-base font-bold text-white hover:bg-stone-800 disabled:bg-stone-400"
				>
					{busyKey === 'create' ? 'Creating...' : 'Start New Pull Sheet'}
				</button>
			</div>
		</form>

		<!-- Status Filter Tabs -->
		<div class="mt-4 flex flex-wrap gap-2">
			{#each ['All', 'Pending', 'Pulled', 'Returned', 'Closed'] as const as tab}
				<button
					type="button"
					onclick={() => (statusTab = tab)}
					class="min-h-11 cursor-pointer rounded-xl border-2 px-4 py-2 text-base font-bold {statusTab ===
					tab
						? 'border-stone-950 bg-stone-950 text-white'
						: 'border-stone-400 bg-white text-stone-900 hover:bg-stone-100'}"
				>
					{tab}
				</button>
			{/each}
		</div>
	</section>

	{#if errorMessage}
		<div
			role="alert"
			class="rounded-xl border-2 border-red-800 bg-red-50 p-4 text-base font-bold text-red-950"
		>
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div
			role="status"
			class="rounded-xl border-2 border-emerald-800 bg-emerald-50 p-4 text-base font-bold text-emerald-950"
		>
			{successMessage}
		</div>
	{/if}

	{#if filteredSheets.length === 0}
		<section class="rounded-2xl border-2 border-stone-400 bg-white p-8 text-center">
			<p class="text-xl font-extrabold text-stone-950">No pull sheets match this view</p>
			<p class="mt-2 text-base text-stone-800">
				Go to <strong>Find a Tube</strong> and tap <strong>Add to Pull Sheet</strong> on any stocked
				storage lot to start picking tubes.
			</p>
		</section>
	{:else}
		<div class="space-y-6">
			{#each filteredSheets as sheet}
				<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
					<header class="flex flex-wrap items-start justify-between gap-4 border-b-2 border-stone-200 pb-4">
						<div>
							<div class="flex flex-wrap items-center gap-2.5">
								<span class="rounded-lg bg-stone-900 px-3 py-1 text-sm font-extrabold text-white">
									{sheet.requestCode}
								</span>
								<span
									class="rounded-lg border-2 px-3 py-0.5 text-sm font-extrabold {statusBadgeClass(
										sheet.status
									)}"
								>
									{sheet.status}
								</span>
							</div>
							<h2 class="mt-2 text-2xl font-extrabold text-stone-950">{sheet.memberName}</h2>
							{#if sheet.purpose}
								<p class="text-base font-medium text-stone-800">{sheet.purpose}</p>
							{/if}
						</div>

						{#if sheet.status !== 'Closed'}
							<button
								type="button"
								onclick={() => void closeSheet(sheet)}
								disabled={busyKey === `close-${sheet.id}`}
								class="no-print min-h-11 cursor-pointer rounded-xl border-2 border-stone-700 bg-stone-100 px-4 py-2 text-base font-bold text-stone-950 hover:bg-stone-200"
							>
								Mark Sheet Closed
							</button>
						{/if}
					</header>

					{#if sheet.items.length === 0}
						<p class="mt-4 text-base text-stone-700">
							No tubes added yet. Use <strong>Find a Tube</strong> to add a storage lot to this sheet.
						</p>
					{:else}
						<div class="mt-4 overflow-x-auto rounded-xl border-2 border-stone-400">
							<table class="min-w-full border-collapse text-left text-base">
								<thead class="border-b-2 border-stone-400 bg-stone-100 text-stone-950">
									<tr>
										<th class="px-4 py-3 font-extrabold">Tube</th>
										<th class="px-4 py-3 font-extrabold">Box / Layer</th>
										<th class="px-4 py-3 font-extrabold">Requested</th>
										<th class="px-4 py-3 font-extrabold">Pulled</th>
										<th class="px-4 py-3 font-extrabold">Returned</th>
										<th class="px-4 py-3 font-extrabold">Box Stock Now</th>
										<th class="no-print px-4 py-3 font-extrabold">Actions</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-stone-300 bg-white">
									{#each sheet.items as item}
										{@const remainingToPull = item.qtyRequested - item.qtyPulled}
										{@const currentlyOut = item.qtyPulled - item.qtyReturned}
										<tr class="align-middle">
											<td class="px-4 py-3">
												{#if item.tubeRefId}
													<a
														href="/tubes/{item.tubeRefId}"
														class="text-lg font-extrabold text-amber-900 underline"
													>
														{item.designation}
													</a>
												{:else}
													<span class="text-lg font-extrabold text-stone-950">{item.designation}</span>
												{/if}
												{#if item.notes}
													<p class="text-sm text-stone-700">{item.notes}</p>
												{/if}
											</td>
											<td class="px-4 py-3 font-bold text-stone-900">
												Box {item.boxNo ?? '—'}{item.boxLayer ? ` · Layer ${item.boxLayer}` : ''}
											</td>
											<td class="px-4 py-3 font-extrabold tabular-nums">{item.qtyRequested}</td>
											<td class="px-4 py-3 font-extrabold tabular-nums text-blue-950">
												{item.qtyPulled}
											</td>
											<td class="px-4 py-3 font-extrabold tabular-nums text-emerald-950">
												{item.qtyReturned}
											</td>
											<td class="px-4 py-3 text-sm font-bold text-stone-800">
												{#if item.lotQuantityUnknown}
													? (Uncounted)
												{:else if item.lotAvailableQty !== null}
													{item.lotAvailableQty} left ({item.lotTestStatus ?? '—'})
												{:else}
													—
												{/if}
											</td>
											<td class="no-print px-4 py-3">
												<div class="flex flex-wrap gap-2">
													{#if remainingToPull > 0 && sheet.status !== 'Closed'}
														<button
															type="button"
															disabled={busyKey === `pull-${item.id}`}
															onclick={() => void handlePull(item, remainingToPull)}
															class="min-h-11 cursor-pointer rounded-xl bg-stone-950 px-3.5 py-2 text-sm font-bold text-white hover:bg-stone-800"
														>
															Mark {remainingToPull} Pulled
														</button>
													{/if}
													{#if currentlyOut > 0 && sheet.status !== 'Closed'}
														<button
															type="button"
															onclick={() => openReturnDrawer(item)}
															class="min-h-11 cursor-pointer rounded-xl border-2 border-emerald-800 bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-100"
														>
															Log Return ({currentlyOut} out)
														</button>
													{/if}
													{#if item.qtyPulled === 0 && sheet.status !== 'Closed'}
														<button
															type="button"
															disabled={busyKey === `del-${item.id}`}
															onclick={() => void removeItem(item)}
															class="min-h-11 cursor-pointer rounded-xl border-2 border-red-700 bg-white px-3 py-2 text-sm font-bold text-red-900 hover:bg-red-50"
														>
															Remove
														</button>
													{/if}
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>

<!-- Return & Test Status Modal -->
{#if returnTarget}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Log Returned Tubes"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
	>
		<form
			onsubmit={submitReturn}
			class="w-full max-w-lg space-y-4 rounded-2xl border-2 border-stone-900 bg-white p-6"
		>
			<h2 class="text-2xl font-extrabold text-stone-950">
				Return {returnTarget.designation} to Box {returnTarget.boxNo ?? '—'}
			</h2>
			<p class="text-base text-stone-800">
				Up to <strong>{returnTarget.qtyPulled - returnTarget.qtyReturned}</strong> currently checked
				out.
			</p>

			<div>
				<label for="ret-qty" class="block text-base font-bold text-stone-900">
					Quantity Returned
				</label>
				<input
					id="ret-qty"
					type="number"
					min="1"
					max={returnTarget.qtyPulled - returnTarget.qtyReturned}
					bind:value={returnQty}
					required
					class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-lg font-bold text-stone-950"
				/>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label for="ret-test" class="block text-base font-bold text-stone-900">
						Test Result Now
					</label>
					<select
						id="ret-test"
						bind:value={returnTestStatus}
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold text-stone-950"
					>
						<option value="Tested">Tested (Good)</option>
						<option value="Untested">Untested</option>
						<option value="Weak">Weak</option>
						<option value="Bad">Bad</option>
					</select>
				</div>

				<div>
					<label for="ret-cond" class="block text-base font-bold text-stone-900">
						Condition
					</label>
					<select
						id="ret-cond"
						bind:value={returnStockCondition}
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold text-stone-950"
					>
						<option value="Unknown">Unknown</option>
						<option value="NOS">NOS (New Old Stock)</option>
						<option value="Used">Used</option>
					</select>
				</div>
			</div>

			<div>
				<label for="ret-notes" class="block text-base font-bold text-stone-900">
					Return / Tester Note (Optional)
				</label>
				<input
					id="ret-notes"
					type="text"
					bind:value={returnNotes}
					placeholder="e.g., Tested strong on Hickok 539B"
					class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base text-stone-950"
				/>
			</div>

			<div class="flex flex-wrap justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (returnTarget = null)}
					class="min-h-12 cursor-pointer rounded-xl border-2 border-stone-700 bg-white px-5 py-2 text-base font-bold text-stone-900"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={busyKey === `return-${returnTarget.id}`}
					class="min-h-12 cursor-pointer rounded-xl bg-emerald-800 px-5 py-2 text-base font-bold text-white hover:bg-emerald-900"
				>
					{busyKey === `return-${returnTarget.id}` ? 'Saving...' : 'Confirm Return'}
				</button>
			</div>
		</form>
	</div>
{/if}
