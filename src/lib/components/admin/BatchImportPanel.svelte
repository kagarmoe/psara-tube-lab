<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface StagedRow {
		id: number;
		readingId: string;
		sourceSignature: string;
		box: string | null;
		tube: string | null;
		qty: number | null;
		importTube: string | null;
		importQty: number | null;
		importBox: string | null;
		importLayer: string | null;
		importStock: string | null;
		importTest: string | null;
		importEnvelope: string | null;
		reviewed: boolean;
		selectedTubeRefId: string | null;
		importStatus: string;
		reasonOrCandidates: string | null;
		acquisitionId: string | null;
	}

	interface BatchGroup {
		id: number;
		batchName: string;
		sourceType: string;
		createdBy: string | null;
		createdAt: string;
		rows: StagedRow[];
	}

	interface RefOption {
		tubeRefId: string;
		referenceDesignation: string;
		lookupStatus: string;
	}

	let {
		batches,
		refOptions,
		locations
	}: {
		batches: BatchGroup[];
		refOptions: RefOption[];
		locations: Array<{ locationCode: string; description: string }>;
	} = $props();

	let batchName = $state('');
	let uploadFile = $state<File | null>(null);
	let csvText = $state('');
	let busy = $state(false);
	let message = $state<{ ok: boolean; text: string } | null>(null);
	let selectedBatchId = $state<number | null>(batches[0]?.id ?? null);

	$effect(() => {
		if (batches.length > 0 && !batches.some((b) => b.id === selectedBatchId)) {
			selectedBatchId = batches[0].id;
		}
	});

	let activeBatch = $derived(batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null);
	let readyCount = $derived(
		activeBatch
			? activeBatch.rows.filter((r) => r.importStatus === 'Ready' && r.reviewed).length
			: 0
	);

	async function handleStage(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		message = null;
		try {
			const fd = new FormData();
			if (batchName.trim()) fd.set('batchName', batchName.trim());
			if (uploadFile) fd.set('file', uploadFile);
			if (csvText.trim()) fd.set('csvText', csvText.trim());

			const res = await fetch('/api/admin/batch/stage', {
				method: 'POST',
				body: fd
			});
			const payload = await res.json();
			if (!res.ok) {
				message = { ok: false, text: payload.error ?? 'Staging failed.' };
				return;
			}
			message = { ok: true, text: payload.message };
			batchName = '';
			uploadFile = null;
			csvText = '';
			await invalidateAll();
			if (payload.batchId) selectedBatchId = payload.batchId;
		} finally {
			busy = false;
		}
	}

	async function patchRow(row: StagedRow, patch: Record<string, unknown>) {
		busy = true;
		message = null;
		try {
			const res = await fetch(`/api/admin/batch/rows/${row.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const payload = await res.json();
			if (!res.ok) {
				message = { ok: false, text: payload.error ?? 'Could not update row.' };
				return;
			}
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function commitReadyRows() {
		if (!activeBatch) return;
		busy = true;
		message = null;
		try {
			const res = await fetch('/api/admin/batch/commit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ batchId: activeBatch.id })
			});
			const payload = await res.json();
			if (!res.ok) {
				message = { ok: false, text: payload.error ?? 'Commit failed.' };
				return;
			}
			message = {
				ok: true,
				text: `Committed ${payload.committedCount} reviewed row(s) into club inventory & acquisition log.`
			};
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-6">
	<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<h2 class="text-2xl font-extrabold text-stone-950">Stage New Spreadsheet Batch</h2>
		<p class="mt-1 text-base text-stone-800">
			Upload an <code>.xlsx</code>, <code>.xlsm</code>, or <code>.csv</code> file (or paste CSV
			rows). Headers in rows 1–20 are matched automatically, and identical rows are skipped using
			<code>Source Signature</code> deduplication.
		</p>

		<form onsubmit={handleStage} class="mt-4 space-y-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="batch-name" class="block text-sm font-bold text-stone-900">
						Batch Description
					</label>
					<input
						id="batch-name"
						type="text"
						bind:value={batchName}
						placeholder="e.g., Nov Donation Box 14"
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base font-semibold"
					/>
				</div>
				<div>
					<label for="batch-file" class="block text-sm font-bold text-stone-900">
						Spreadsheet File (.xlsx / .xlsm / .csv)
					</label>
					<input
						id="batch-file"
						type="file"
						accept=".xlsx,.xlsm,.csv,.tsv,.txt"
						onchange={(e) => {
							uploadFile = e.currentTarget.files?.[0] ?? null;
						}}
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base"
					/>
				</div>
			</div>

			<div>
				<label for="batch-csv" class="block text-sm font-bold text-stone-900">
					Or Paste CSV / Tab-Separated Rows Directly
				</label>
				<textarea
					id="batch-csv"
					rows="4"
					bind:value={csvText}
					placeholder={"Tube Number,Box,Layer,Qty,Stock Condition,Test Status\n6SK7,Metal,1,3,NOS,Tested"}
					class="mt-1 w-full rounded-xl border-2 border-stone-700 p-3 font-mono text-sm"
				></textarea>
			</div>

			<button
				type="submit"
				disabled={busy}
				class="min-h-12 cursor-pointer rounded-xl bg-stone-950 px-6 py-2.5 text-base font-bold text-white hover:bg-stone-800 disabled:bg-stone-400"
			>
				{busy ? 'Staging...' : 'Stage Batch for Review'}
			</button>
		</form>

		{#if message}
			<div
				role="status"
				class="mt-4 rounded-xl border-2 p-4 text-base font-bold {message.ok
					? 'border-emerald-800 bg-emerald-50 text-emerald-950'
					: 'border-red-800 bg-red-50 text-red-950'}"
			>
				{message.text}
			</div>
		{/if}
	</section>

	{#if batches.length > 0 && activeBatch}
		<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-stone-200 pb-4">
				<div class="flex flex-wrap items-center gap-3">
					<label for="batch-select" class="text-base font-extrabold text-stone-950">
						Viewing Batch:
					</label>
					<select
						id="batch-select"
						bind:value={selectedBatchId}
						class="min-h-11 rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold"
					>
						{#each batches as b}
							<option value={b.id}>{b.batchName} ({b.rows.length} rows)</option>
						{/each}
					</select>
				</div>

				{#if readyCount > 0}
					<button
						type="button"
						disabled={busy}
						onclick={() => void commitReadyRows()}
						class="min-h-12 cursor-pointer rounded-xl bg-emerald-800 px-5 py-2.5 text-base font-bold text-white hover:bg-emerald-900"
					>
						Commit {readyCount} Ready Reviewed Row(s)
					</button>
				{/if}
			</div>

			<div class="mt-4 overflow-x-auto rounded-xl border-2 border-stone-400">
				<table class="min-w-full border-collapse text-left text-sm">
					<thead class="border-b-2 border-stone-400 bg-stone-100 text-stone-950">
						<tr>
							<th class="px-3 py-3 font-extrabold">Status</th>
							<th class="px-3 py-3 font-extrabold">Import Tube</th>
							<th class="px-3 py-3 font-extrabold">Qty</th>
							<th class="px-3 py-3 font-extrabold">Box</th>
							<th class="px-3 py-3 font-extrabold">Layer</th>
							<th class="px-3 py-3 font-extrabold">Matched Reference</th>
							<th class="px-3 py-3 font-extrabold">Reviewed</th>
							<th class="px-3 py-3 font-extrabold">Reason / Acquisition</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-stone-300 bg-white">
						{#each activeBatch.rows as row}
							{@const locked = row.importStatus === 'Imported'}
							<tr class="align-top">
								<td class="px-3 py-3">
									<span
										class="inline-block rounded-md px-2.5 py-1 text-xs font-extrabold {row.importStatus ===
										'Imported'
											? 'bg-emerald-100 text-emerald-950'
											: row.importStatus === 'Ready'
												? 'bg-blue-100 text-blue-950'
												: 'bg-amber-100 text-amber-950'}"
									>
										{row.importStatus}
									</span>
								</td>
								<td class="px-3 py-3 font-bold">
									{#if locked}
										{row.importTube ?? row.tube ?? '—'}
									{:else}
										<input
											type="text"
											value={row.importTube ?? ''}
											onchange={(e) =>
												void patchRow(row, { importTube: e.currentTarget.value })}
											class="min-h-10 w-28 rounded-lg border border-stone-600 px-2 py-1 font-bold"
										/>
									{/if}
								</td>
								<td class="px-3 py-3 tabular-nums">
									{#if locked}
										{row.importQty ?? row.qty ?? '—'}
									{:else}
										<input
											type="number"
											min="1"
											value={row.importQty ?? ''}
											onchange={(e) =>
												void patchRow(row, { importQty: e.currentTarget.value })}
											class="min-h-10 w-18 rounded-lg border border-stone-600 px-2 py-1 font-bold"
										/>
									{/if}
								</td>
								<td class="px-3 py-3">
									{#if locked}
										{row.importBox ?? row.box ?? '—'}
									{:else}
										<input
											type="text"
											list="admin-loc-list"
											value={row.importBox ?? ''}
											onchange={(e) =>
												void patchRow(row, { importBox: e.currentTarget.value })}
											class="min-h-10 w-24 rounded-lg border border-stone-600 px-2 py-1 font-bold"
										/>
									{/if}
								</td>
								<td class="px-3 py-3">
									{#if locked}
										{row.importLayer ?? '—'}
									{:else}
										<input
											type="text"
											value={row.importLayer ?? ''}
											onchange={(e) =>
												void patchRow(row, { importLayer: e.currentTarget.value })}
											class="min-h-10 w-18 rounded-lg border border-stone-600 px-2 py-1"
										/>
									{/if}
								</td>
								<td class="px-3 py-3">
									{#if locked}
										{row.selectedTubeRefId ?? '—'}
									{:else}
										<select
											value={row.selectedTubeRefId ?? ''}
											onchange={(e) =>
												void patchRow(row, {
													selectedTubeRefId: e.currentTarget.value || null
												})}
											class="min-h-10 max-w-44 rounded-lg border border-stone-600 bg-white px-2 py-1 text-xs font-bold"
										>
											<option value="">Auto / Unmatched</option>
											{#each refOptions as opt}
												<option value={opt.tubeRefId}>
													{opt.referenceDesignation} ({opt.tubeRefId}){opt.lookupStatus ===
													'Unidentified'
														? ' [UNID]'
														: ''}
												</option>
											{/each}
										</select>
									{/if}
								</td>
								<td class="px-3 py-3">
									<input
										type="checkbox"
										checked={row.reviewed}
										disabled={locked}
										aria-label="Mark row {row.readingId} reviewed"
										onchange={(e) =>
											void patchRow(row, { reviewed: e.currentTarget.checked })}
										class="h-5 w-5 accent-emerald-800"
									/>
								</td>
								<td class="max-w-xs px-3 py-3 text-xs text-stone-800">
									{#if row.acquisitionId}
										<strong>{row.acquisitionId}</strong>
									{:else}
										{row.reasonOrCandidates ?? 'Ready to commit'}
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<datalist id="admin-loc-list">
				{#each locations as loc}
					<option value={loc.locationCode}>{loc.description}</option>
				{/each}
			</datalist>
		</section>
	{/if}
</div>
