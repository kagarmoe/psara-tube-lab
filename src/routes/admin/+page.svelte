<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import BatchImportPanel from '$lib/components/admin/BatchImportPanel.svelte';
	import CuratorReviewPanel from '$lib/components/admin/CuratorReviewPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let admin = $derived(data.adminData);
	let readOnly = $derived(data.session?.authMethod === 'demo');

	type AdminTab = 'intake' | 'batch' | 'review' | 'splits' | 'diagnostics';
	let activeTab = $state<AdminTab>('intake');
	let busy = $state(false);
	let feedback = $state<{ ok: boolean; text: string } | null>(null);

	// Single Intake Form State
	let intakeMode = $state<'existing' | 'new_ref'>('existing');
	let selectedTubeRefId = $state('');
	let observedDesignation = $state('');
	let quantity = $state(1);
	let location = $state(data.adminData.locations[0]?.locationCode ?? 'Metal');
	let layer = $state('');
	let stockCondition = $state('Unknown');
	let testStatus = $state('Untested');
	let intakeEnvelope = $state('');
	let intakeBase = $state('');
	let intakeCap = $state('');
	let intakeBasing = $state('');
	let intakeSource = $state('');
	let intakeSourcePage = $state('');
	let intakeNotes = $state('');
	let applyReferenceUpdates = $state(false);
	let promoteIfUnidentified = $state(false);

	// New reference creation fields
	let newDesig = $state('');
	let newFamily = $state('');
	let newStructure = $state('');
	let newFunction = $state('');
	let newPinCount = $state('');
	let newHeaterV = $state('');
	let newHeaterA = $state('');

	// Quick location form
	let newLocCode = $state('');
	let newLocKind = $state('Box');
	let newLocDesc = $state('');

	async function submitIntake(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		feedback = null;
		try {
			const res = await fetch('/api/admin/intake', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					mode: intakeMode,
					selectedTubeRefId,
					promoteIfUnidentified,
					applyReferenceUpdates,
					observedDesignation,
					quantity: Number(quantity),
					location,
					layer,
					stockCondition,
					testStatus,
					envelope: intakeEnvelope,
					base: intakeBase,
					cap: intakeCap,
					basingCode: intakeBasing,
					source: intakeSource,
					sourcePage: intakeSourcePage,
					notes: intakeNotes,
					newReference:
						intakeMode === 'new_ref'
							? {
									designation: newDesig,
									tubeFamily: newFamily,
									internalStructure: newStructure,
									generalFunction: newFunction,
									pinCount: newPinCount ? Number(newPinCount) : null,
									heaterVoltage: newHeaterV,
									heaterCurrent: newHeaterA,
									envelope: intakeEnvelope,
									base: intakeBase,
									cap: intakeCap,
									basingCode: intakeBasing,
									primarySource: intakeSource,
									printedPage: intakeSourcePage
								}
							: undefined
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				feedback = { ok: false, text: payload.error ?? 'Intake failed.' };
				return;
			}
			feedback = {
				ok: true,
				text: `Recorded ${payload.entry.entryId}: Added ${payload.lot.quantity} × ${payload.reference.referenceDesignation} (${payload.reference.tubeRefId}) into Box ${payload.lot.boxNo}.`
			};
			observedDesignation = '';
			quantity = 1;
			intakeNotes = '';
			newDesig = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function resolveUnknownLot(lotId: number, qtyRaw: string) {
		const qty = Number(qtyRaw);
		if (!Number.isInteger(qty) || qty < 0) {
			feedback = { ok: false, text: 'Enter a valid non-negative integer count.' };
			return;
		}
		busy = true;
		feedback = null;
		try {
			const res = await fetch(`/api/admin/lots/${lotId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ quantity: qty, quantityUnknown: false })
			});
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				feedback = { ok: false, text: payload.error ?? 'Could not update lot.' };
				return;
			}
			feedback = { ok: true, text: `Updated lot #${lotId} count to ${qty}.` };
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function addLocation(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		feedback = null;
		try {
			const res = await fetch('/api/admin/locations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'location',
					locationCode: newLocCode,
					locationKind: newLocKind,
					description: newLocDesc
				})
			});
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				feedback = { ok: false, text: payload.error ?? 'Could not add location.' };
				return;
			}
			feedback = { ok: true, text: `Added location "${newLocCode}".` };
			newLocCode = '';
			newLocDesc = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Manage Inventory — PSARA Tube Lab</title>
</svelte:head>

<div class="space-y-6">
	<header class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<p class="text-sm font-bold tracking-wide text-amber-900 uppercase">Curator &amp; Admin</p>
				<h1 class="mt-0.5 text-2xl font-extrabold text-stone-950 sm:text-3xl">
					Manage Inventory &amp; Reference Library
				</h1>
			</div>

			{#if readOnly}
				<button
					type="button"
					disabled
					class="inline-flex min-h-12 cursor-not-allowed items-center rounded-xl bg-stone-300 px-5 py-2.5 text-base font-bold text-stone-600"
				>
					Export Full .XLSX Workbook
				</button>
			{:else}
				<a
					href="/api/admin/export/xlsx"
					class="inline-flex min-h-12 items-center rounded-xl bg-emerald-800 px-5 py-2.5 text-base font-bold text-white hover:bg-emerald-900"
				>
					Export Full .XLSX Workbook
				</a>
			{/if}
		</div>

		{#if readOnly}
			<div
				role="note"
				class="mt-5 rounded-xl border-2 border-amber-800 bg-amber-50 p-4 text-base text-amber-950"
			>
				<p class="font-bold">You're viewing the Demo Admin workbench (read-only).</p>
				<p class="mt-1">
					Exporting the workbook and changing inventory are turned off in demo mode. To make
					changes, <a href="/login?next=/admin" class="font-bold underline">sign in</a> with a
					curator or admin account.
				</p>
			</div>
		{/if}

		<!-- Admin Sub-Tabs -->
		<nav aria-label="Admin tools" class="mt-5 flex flex-wrap gap-2">
			{#each [
				{ id: 'intake', label: '1. Single Intake' },
				{ id: 'batch', label: '2. Batch Spreadsheet Import' },
				{
					id: 'review',
					label: `3. Review & Quarantine (${admin.diagnostics.openReviewCount})`
				},
				{
					id: 'splits',
					label: `4. Split & ? Qty Audit (${admin.unknownLots.length})`
				},
				{ id: 'diagnostics', label: '5. Diagnostics & Boxes' }
			] as tab}
				<button
					type="button"
					onclick={() => (activeTab = tab.id as AdminTab)}
					class="min-h-12 cursor-pointer rounded-xl border-2 px-4 py-2 text-base font-bold {activeTab ===
					tab.id
						? 'border-amber-900 bg-amber-900 text-white'
						: 'border-stone-400 bg-stone-50 text-stone-950 hover:bg-stone-100'}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</header>

	{#if feedback}
		<div
			role="status"
			class="rounded-xl border-2 p-4 text-base font-bold {feedback.ok
				? 'border-emerald-800 bg-emerald-50 text-emerald-950'
				: 'border-red-800 bg-red-50 text-red-950'}"
		>
			{feedback.text}
		</div>
	{/if}

	<!-- TAB 1: SINGLE INTAKE -->
	{#if activeTab === 'intake'}
		<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
			<h2 class="text-2xl font-extrabold text-stone-950">Single Tube Acquisition Intake</h2>
			<p class="mt-1 text-base text-stone-800">
				Log newly donated or tested tubes directly into a storage box and the Acquisition Log.
			</p>

			<form onsubmit={submitIntake} class="mt-5 space-y-5">
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						onclick={() => (intakeMode = 'existing')}
						class="min-h-11 cursor-pointer rounded-xl border-2 px-4 py-2 text-base font-bold {intakeMode ===
						'existing'
							? 'border-stone-950 bg-stone-950 text-white'
							: 'border-stone-500 bg-stone-50 text-stone-900'}"
					>
						Use Existing Reference
					</button>
					<button
						type="button"
						onclick={() => (intakeMode = 'new_ref')}
						class="min-h-11 cursor-pointer rounded-xl border-2 px-4 py-2 text-base font-bold {intakeMode ===
						'new_ref'
							? 'border-stone-950 bg-stone-950 text-white'
							: 'border-stone-500 bg-stone-50 text-stone-900'}"
					>
						Create New Tube Reference
					</button>
				</div>

				{#if intakeMode === 'existing'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="in-ref" class="block text-sm font-bold text-stone-900">
								Select Canonical Tube Reference
							</label>
							<select
								id="in-ref"
								bind:value={selectedTubeRefId}
								required
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold"
							>
								<option value="">Choose a tube reference...</option>
								{#each admin.refOptions as opt}
									<option value={opt.tubeRefId}>
										{opt.referenceDesignation} ({opt.tubeRefId}){opt.lookupStatus === 'Unidentified'
											? ' [QUARANTINED]'
											: ''}
									</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="in-obs" class="block text-sm font-bold text-stone-900">
								Marking Printed on Glass/Box (If Different)
							</label>
							<input
								id="in-obs"
								type="text"
								bind:value={observedDesignation}
								placeholder="Optional e.g. JAN-6SN7WGT"
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base"
							/>
						</div>
					</div>
				{:else}
					<div class="grid gap-4 rounded-xl border-2 border-amber-800 bg-amber-50 p-4 sm:grid-cols-3">
						<div>
							<label for="nr-desig" class="block text-sm font-bold">New Designation *</label>
							<input
								id="nr-desig"
								type="text"
								bind:value={newDesig}
								required
								placeholder="e.g., 6AQ5A"
								class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
							/>
						</div>
						<div>
							<label for="nr-fam" class="block text-sm font-bold">Tube Family</label>
							<input
								id="nr-fam"
								type="text"
								bind:value={newFamily}
								class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
							/>
						</div>
						<div>
							<label for="nr-pins" class="block text-sm font-bold">Pin Count</label>
							<input
								id="nr-pins"
								type="number"
								bind:value={newPinCount}
								class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
							/>
						</div>
						<div>
							<label for="nr-struct" class="block text-sm font-bold">Internal Structure</label>
							<input
								id="nr-struct"
								type="text"
								bind:value={newStructure}
								class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
							/>
						</div>
						<div>
							<label for="nr-hv" class="block text-sm font-bold">Heater V / A</label>
							<div class="mt-1 flex gap-2">
								<input
									id="nr-hv"
									type="text"
									bind:value={newHeaterV}
									placeholder="6.3V"
									class="min-h-11 w-1/2 rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
								/>
								<input
									type="text"
									bind:value={newHeaterA}
									placeholder="0.45A"
									aria-label="Heater current in amps"
									class="min-h-11 w-1/2 rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
								/>
							</div>
						</div>
						<div>
							<label for="nr-fn" class="block text-sm font-bold">General Function</label>
							<input
								id="nr-fn"
								type="text"
								bind:value={newFunction}
								class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2"
							/>
						</div>
					</div>
				{/if}

				<div class="grid gap-4 sm:grid-cols-5">
					<div>
						<label for="in-qty" class="block text-sm font-bold">Quantity *</label>
						<input
							id="in-qty"
							type="number"
							min="1"
							bind:value={quantity}
							required
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-lg font-extrabold"
						/>
					</div>
					<div>
						<label for="in-box" class="block text-sm font-bold">Box / Location *</label>
						<select
							id="in-box"
							bind:value={location}
							required
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
						>
							{#each admin.locations as loc}
								<option value={loc.locationCode}>{loc.description}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="in-layer" class="block text-sm font-bold">Layer (Optional)</label>
						<input
							id="in-layer"
							type="text"
							bind:value={layer}
							placeholder="e.g., 1"
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
						/>
					</div>
					<div>
						<label for="in-cond" class="block text-sm font-bold">Condition</label>
						<select
							id="in-cond"
							bind:value={stockCondition}
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
						>
							<option value="Unknown">Unknown</option>
							<option value="NOS">NOS</option>
							<option value="Used">Used</option>
						</select>
					</div>
					<div>
						<label for="in-test" class="block text-sm font-bold">Test Status</label>
						<select
							id="in-test"
							bind:value={testStatus}
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
						>
							<option value="Untested">Untested</option>
							<option value="Tested">Tested</option>
							<option value="Weak">Weak</option>
							<option value="Bad">Bad</option>
						</select>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-4">
					<div>
						<label for="in-env" class="block text-sm font-bold">Envelope (Optional)</label>
						<input
							id="in-env"
							type="text"
							bind:value={intakeEnvelope}
							placeholder="e.g., MT8"
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
						/>
					</div>
					<div>
						<label for="in-basing" class="block text-sm font-bold">Basing Code (Optional)</label>
						<input
							id="in-basing"
							type="text"
							bind:value={intakeBasing}
							placeholder="e.g., 8N"
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
						/>
					</div>
					<div>
						<label for="in-src" class="block text-sm font-bold">Manual Source</label>
						<input
							id="in-src"
							type="text"
							bind:value={intakeSource}
							placeholder="e.g., RCA RC-30"
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
						/>
					</div>
					<div>
						<label for="in-notes" class="block text-sm font-bold">Box / Intake Notes</label>
						<input
							id="in-notes"
							type="text"
							bind:value={intakeNotes}
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
						/>
					</div>
				</div>

				{#if intakeMode === 'existing'}
					<div class="flex flex-wrap gap-6 text-sm font-bold text-stone-900">
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={applyReferenceUpdates}
								class="h-5 w-5 accent-stone-900"
							/>
							Save filled Envelope / Basing updates to Reference Table
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								bind:checked={promoteIfUnidentified}
								class="h-5 w-5 accent-amber-800"
							/>
							Promote Unidentified record to Active on intake
						</label>
					</div>
				{/if}

				<button
					type="submit"
					disabled={busy}
					class="min-h-12 cursor-pointer rounded-xl bg-amber-800 px-6 py-3 text-lg font-bold text-white hover:bg-amber-900"
				>
					{busy ? 'Saving Intake...' : 'Add Tubes to Inventory'}
				</button>
			</form>

			{#if admin.acquisitionEntries.length > 0}
				<div class="mt-8 border-t-2 border-stone-200 pt-5">
					<h3 class="text-xl font-extrabold text-stone-950">Recent Acquisition Entries</h3>
					<div class="mt-3 overflow-x-auto rounded-xl border border-stone-300">
						<table class="min-w-full border-collapse text-left text-sm">
							<thead class="border-b border-stone-300 bg-stone-100">
								<tr>
									<th class="px-3 py-2 font-extrabold">Entry ID</th>
									<th class="px-3 py-2 font-extrabold">Tube</th>
									<th class="px-3 py-2 font-extrabold">Qty</th>
									<th class="px-3 py-2 font-extrabold">Box / Layer</th>
									<th class="px-3 py-2 font-extrabold">Status</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-stone-200">
								{#each admin.acquisitionEntries.slice(0, 12) as acq}
									<tr>
										<td class="px-3 py-2 font-mono text-xs">{acq.entryId}</td>
										<td class="px-3 py-2 font-bold">
											{acq.observedDesignation ?? '—'} ({acq.selectedTubeRefId ?? '—'})
										</td>
										<td class="px-3 py-2 font-bold tabular-nums">{acq.quantity ?? '—'}</td>
										<td class="px-3 py-2">
											{acq.location ?? '—'}{acq.layer ? ` / Layer ${acq.layer}` : ''}
										</td>
										<td class="px-3 py-2">{acq.testStatus ?? '—'} · {acq.stockCondition ?? '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- TAB 2: BATCH IMPORT -->
	{#if activeTab === 'batch'}
		<BatchImportPanel
			batches={admin.batches}
			refOptions={admin.refOptions}
			locations={admin.locations}
		/>
	{/if}

	<!-- TAB 3: REVIEW & QUARANTINE -->
	{#if activeTab === 'review'}
		<CuratorReviewPanel
			reviewQueue={admin.reviewQueue}
			allRefs={admin.allRefs}
			unidentifiedRefs={admin.unidentifiedRefs}
			listsByName={admin.listsByName}
		/>
	{/if}

	<!-- TAB 4: SPLIT & ? QTY AUDIT -->
	{#if activeTab === 'splits'}
		<div class="space-y-6">
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<h2 class="text-2xl font-extrabold text-stone-950">
					Uncounted (?) &amp; Unlinked Inventory Lots ({admin.unknownLots.length})
				</h2>
				<p class="mt-1 text-base text-stone-800">
					Enter an observed box count below to resolve <code>?</code> quantities cleanly.
				</p>

				<div class="mt-4 overflow-x-auto rounded-xl border-2 border-stone-400">
					<table class="min-w-full border-collapse text-left text-sm">
						<thead class="border-b-2 border-stone-400 bg-stone-100">
							<tr>
								<th class="px-3 py-3 font-extrabold">Lot ID</th>
								<th class="px-3 py-3 font-extrabold">Tube / Label</th>
								<th class="px-3 py-3 font-extrabold">Box / Layer</th>
								<th class="px-3 py-3 font-extrabold">RefID</th>
								<th class="px-3 py-3 font-extrabold">Comment</th>
								<th class="px-3 py-3 font-extrabold">Set Known Qty</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-stone-300">
							{#each admin.unknownLots as lot}
								<tr>
									<td class="px-3 py-3 font-mono">{lot.id}</td>
									<td class="px-3 py-3 font-extrabold">{lot.canonicalDesignation}</td>
									<td class="px-3 py-3">
										Box {lot.boxNo ?? '—'}{lot.boxLayer ? ` · L${lot.boxLayer}` : ''}
									</td>
									<td class="px-3 py-3 font-bold">{lot.tubeRefId ?? 'Unlinked'}</td>
									<td class="max-w-xs px-3 py-3 text-xs whitespace-pre-line">
										{lot.comment ?? '—'}
									</td>
									<td class="px-3 py-3">
										<form
											onsubmit={(e) => {
												e.preventDefault();
												const input = e.currentTarget.querySelector('input') as HTMLInputElement;
												void resolveUnknownLot(lot.id, input.value);
											}}
											class="flex items-center gap-2"
										>
											<input
												type="number"
												min="0"
												value={lot.quantity ?? ''}
												placeholder="?"
												required
												class="min-h-10 w-20 rounded-lg border-2 border-stone-700 px-2 py-1 font-bold"
											/>
											<button
												type="submit"
												disabled={busy}
												class="min-h-10 cursor-pointer rounded-lg bg-stone-950 px-3 py-1 text-xs font-bold text-white"
											>
												Save Count
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<h2 class="text-2xl font-extrabold text-stone-950">
					Combined / Split Designation Audit ({admin.splitCombinedRefs.length})
				</h2>
				<p class="mt-1 text-base text-stone-800">
					Slash-combined designations kept flagged until curator splits or confirms equivalence.
				</p>
				<div class="mt-4 overflow-x-auto rounded-xl border border-stone-300">
					<table class="min-w-full border-collapse text-left text-sm">
						<thead class="border-b border-stone-300 bg-stone-100">
							<tr>
								<th class="px-3 py-2 font-extrabold">RefID</th>
								<th class="px-3 py-2 font-extrabold">Designation</th>
								<th class="px-3 py-2 font-extrabold">Basing</th>
								<th class="px-3 py-2 font-extrabold">Reference Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-stone-200">
							{#each admin.splitCombinedRefs as s}
								<tr>
									<td class="px-3 py-2 font-bold">
										<a href="/tubes/{s.tubeRefId}" class="text-amber-900 underline">
											{s.tubeRefId}
										</a>
									</td>
									<td class="px-3 py-2 font-extrabold">{s.referenceDesignation}</td>
									<td class="px-3 py-2">{s.basingCode ?? '—'}</td>
									<td class="px-3 py-2">{s.referenceStatus}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	{/if}

	<!-- TAB 5: DIAGNOSTICS & BOXES -->
	{#if activeTab === 'diagnostics'}
		<div class="space-y-6">
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<h2 class="text-2xl font-extrabold text-stone-950">
					Workbook Readiness &amp; System Diagnostics
				</h2>
				<dl class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Active Tube Refs</dt>
						<dd class="text-3xl font-extrabold tabular-nums">
							{admin.diagnostics.activeReferences}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Total Counted Stock</dt>
						<dd class="text-3xl font-extrabold tabular-nums">
							{admin.diagnostics.totalKnownUnits}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Quarantined Refs</dt>
						<dd class="text-3xl font-extrabold tabular-nums text-amber-900">
							{admin.diagnostics.unidentifiedReferences}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Missing Basing PNGs</dt>
						<dd class="text-3xl font-extrabold tabular-nums">
							{admin.diagnostics.refsWithMissingBasingPng}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Open Review Items</dt>
						<dd class="text-3xl font-extrabold tabular-nums">
							{admin.diagnostics.openReviewCount}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Batch Ready / Hold</dt>
						<dd class="text-2xl font-extrabold tabular-nums">
							{admin.diagnostics.stagedReadyCount} / {admin.diagnostics.stagedHoldCount}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Open Pull Sheets</dt>
						<dd class="text-3xl font-extrabold tabular-nums">
							{admin.diagnostics.openPullSheetsCount}
						</dd>
					</div>
					<div class="rounded-xl border border-stone-300 bg-stone-50 p-4">
						<dt class="text-sm font-bold text-stone-700">Reference PNG Assets</dt>
						<dd class="text-2xl font-extrabold tabular-nums">
							{admin.diagnostics.basingDiagramsCount + admin.diagnostics.envelopeDiagramsCount}
						</dd>
					</div>
				</dl>
			</section>

			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<h2 class="text-xl font-extrabold text-stone-950">Add Storage Box / Location</h2>
				<form onsubmit={addLocation} class="mt-3 grid gap-3 sm:grid-cols-4">
					<input
						type="text"
						bind:value={newLocCode}
						required
						placeholder="Code (e.g. Box 35)"
						class="min-h-11 rounded-xl border-2 border-stone-700 px-3 py-2 font-bold"
					/>
					<select
						bind:value={newLocKind}
						class="min-h-11 rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
					>
						<option value="Box">Box</option>
						<option value="Tray">Tray</option>
						<option value="Shelf">Shelf</option>
						<option value="Other">Other</option>
					</select>
					<input
						type="text"
						bind:value={newLocDesc}
						placeholder="Description"
						class="min-h-11 rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
					<button
						type="submit"
						disabled={busy}
						class="min-h-11 cursor-pointer rounded-xl bg-stone-950 px-4 py-2 font-bold text-white"
					>
						Add Location
					</button>
				</form>
			</section>
		</div>
	{/if}
</div>
