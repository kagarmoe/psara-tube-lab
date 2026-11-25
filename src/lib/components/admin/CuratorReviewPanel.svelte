<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface ReviewItem {
		id: number;
		sheet: string | null;
		referenceRow: number | null;
		field: string | null;
		currentValue: string | null;
		issue: string | null;
		suggestedAction: string | null;
		status: string;
		tubeRefId: string | null;
		resolutionNotes: string | null;
	}

	interface RefRow {
		tubeRefId: string;
		referenceDesignation: string;
		referenceStatus: string;
		lookupStatus: string;
		tubeFamily: string | null;
		internalStructure: string | null;
		generalFunction: string | null;
		base: string | null;
		pinCount: number | null;
		basingCode: string | null;
		envelope: string | null;
		cap: string | null;
		heaterVoltage: string | null;
		heaterCurrent: string | null;
		heatingMethod: string | null;
		technicalNotes: string | null;
		primarySource: string | null;
		printedPage: string | null;
		verificationStatus: string | null;
	}

	let {
		reviewQueue,
		allRefs,
		unidentifiedRefs,
		listsByName
	}: {
		reviewQueue: ReviewItem[];
		allRefs: RefRow[];
		unidentifiedRefs: RefRow[];
		listsByName: Record<string, string[]>;
	} = $props();

	let showResolved = $state(false);
	let busy = $state(false);
	let feedback = $state<{ ok: boolean; text: string } | null>(null);

	// Reference editor state
	let editSearch = $state('');
	let selectedEditId = $state(unidentifiedRefs[0]?.tubeRefId ?? allRefs[0]?.tubeRefId ?? '');
	let activeRef = $derived(allRefs.find((r) => r.tubeRefId === selectedEditId) ?? null);

	let editDesignation = $state('');
	let editLookupStatus = $state('Active');
	let editFamily = $state('');
	let editStructure = $state('');
	let editFunction = $state('');
	let editBase = $state('');
	let editPinCount = $state('');
	let editBasingCode = $state('');
	let editEnvelope = $state('');
	let editCap = $state('');
	let editHeaterV = $state('');
	let editHeaterA = $state('');
	let editPrimarySource = $state('');
	let editPrintedPage = $state('');
	let editVerificationStatus = $state('');
	let editNotes = $state('');

	$effect(() => {
		if (activeRef) {
			editDesignation = activeRef.referenceDesignation;
			editLookupStatus = activeRef.lookupStatus;
			editFamily = activeRef.tubeFamily ?? '';
			editStructure = activeRef.internalStructure ?? '';
			editFunction = activeRef.generalFunction ?? '';
			editBase = activeRef.base ?? '';
			editPinCount = activeRef.pinCount ? String(activeRef.pinCount) : '';
			editBasingCode = activeRef.basingCode ?? '';
			editEnvelope = activeRef.envelope ?? '';
			editCap = activeRef.cap ?? '';
			editHeaterV = activeRef.heaterVoltage ?? '';
			editHeaterA = activeRef.heaterCurrent ?? '';
			editPrimarySource = activeRef.primarySource ?? '';
			editPrintedPage = activeRef.printedPage ?? '';
			editVerificationStatus = activeRef.verificationStatus ?? '';
			editNotes = activeRef.technicalNotes ?? '';
		}
	});

	let filteredRefs = $derived(
		editSearch.trim()
			? allRefs.filter(
					(r) =>
						r.referenceDesignation.toLowerCase().includes(editSearch.trim().toLowerCase()) ||
						r.tubeRefId.toLowerCase().includes(editSearch.trim().toLowerCase())
				)
			: allRefs
	);

	let visibleReview = $derived(
		showResolved
			? reviewQueue
			: reviewQueue.filter((r) => r.status !== 'Resolved' && r.status !== 'Dismissed')
	);

	async function setReviewStatus(item: ReviewItem, status: string) {
		busy = true;
		feedback = null;
		try {
			const res = await fetch(`/api/admin/review/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status, resolutionNotes: item.resolutionNotes })
			});
			if (res.ok) {
				feedback = { ok: true, text: `Review item #${item.id} marked ${status}.` };
				await invalidateAll();
			}
		} finally {
			busy = false;
		}
	}

	async function saveReferenceEdits(e: SubmitEvent) {
		e.preventDefault();
		if (!activeRef) return;
		busy = true;
		feedback = null;
		try {
			const res = await fetch(`/api/admin/references/${activeRef.tubeRefId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					referenceDesignation: editDesignation,
					lookupStatus: editLookupStatus,
					tubeFamily: editFamily,
					internalStructure: editStructure,
					generalFunction: editFunction,
					base: editBase,
					pinCount: editPinCount || null,
					basingCode: editBasingCode,
					envelope: editEnvelope,
					cap: editCap,
					heaterVoltage: editHeaterV,
					heaterCurrent: editHeaterA,
					primarySource: editPrimarySource,
					printedPage: editPrintedPage,
					verificationStatus: editVerificationStatus,
					technicalNotes: editNotes
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				feedback = { ok: false, text: payload.error ?? 'Save failed.' };
				return;
			}
			feedback = {
				ok: true,
				text: `Saved ${payload.reference.tubeRefId} (${payload.reference.referenceDesignation}) — Status: ${payload.reference.lookupStatus}.`
			};
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	// Add Relationship Form
	let relDesignation = $state('');
	let relRelated = $state('');
	let relType = $state('Conditional substitute');
	let relDirection = $state('Related replaces Original');
	let relDiff = $state('None');
	let relNotes = $state('');
	let relSource = $state('');
	let relPage = $state('');

	async function saveRelationship(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		feedback = null;
		try {
			const res = await fetch('/api/admin/relationships', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					designation: relDesignation,
					relatedDesignation: relRelated,
					relationship: relType,
					direction: relDirection,
					differenceType: relDiff,
					qualificationNotes: relNotes,
					source: relSource,
					sourcePage: relPage
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				feedback = { ok: false, text: payload.error ?? 'Could not add relationship.' };
				return;
			}
			feedback = {
				ok: true,
				text: `Added relationship: ${payload.relationship.designation} -> ${payload.relationship.relatedDesignation} (${payload.relationship.direction}).`
			};
			relDesignation = '';
			relRelated = '';
			relNotes = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-6">
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

	<!-- Unidentified Quarantine Chips + Reference Editor -->
	<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<h2 class="text-2xl font-extrabold text-stone-950">
			Curator Reference Editor &amp; Unidentified Quarantine ({unidentifiedRefs.length} held)
		</h2>
		<p class="mt-1 text-base text-stone-800">
			Quarantined <code>Unidentified</code> tubes are hidden from member search until verified and
			promoted to <code>Active</code>.
		</p>

		{#if unidentifiedRefs.length > 0}
			<div class="mt-3 flex flex-wrap gap-2">
				{#each unidentifiedRefs as u}
					<button
						type="button"
						onclick={() => (selectedEditId = u.tubeRefId)}
						class="min-h-10 cursor-pointer rounded-lg border-2 px-3 py-1 text-sm font-bold {selectedEditId ===
						u.tubeRefId
							? 'border-amber-900 bg-amber-900 text-white'
							: 'border-amber-700 bg-amber-50 text-amber-950 hover:bg-amber-100'}"
					>
						{u.referenceDesignation} ({u.tubeRefId})
					</button>
				{/each}
			</div>
		{/if}

		<div class="mt-4 grid gap-3 sm:grid-cols-2">
			<div>
				<label for="ref-filter-q" class="block text-sm font-bold text-stone-900">
					Filter References
				</label>
				<input
					id="ref-filter-q"
					type="search"
					bind:value={editSearch}
					placeholder="Search e.g. T0295 or 6SN7..."
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base"
				/>
			</div>
			<div>
				<label for="ref-select-id" class="block text-sm font-bold text-stone-900">
					Select Tube Reference to Edit
				</label>
				<select
					id="ref-select-id"
					bind:value={selectedEditId}
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold"
				>
					{#each filteredRefs.slice(0, 200) as r}
						<option value={r.tubeRefId}>
							{r.tubeRefId} — {r.referenceDesignation} [{r.lookupStatus}]
						</option>
					{/each}
				</select>
			</div>
		</div>

		{#if activeRef}
			<form onsubmit={saveReferenceEdits} class="mt-5 grid gap-4 sm:grid-cols-3">
				<div>
					<label for="ed-desig" class="block text-sm font-bold">Designation</label>
					<input
						id="ed-desig"
						type="text"
						bind:value={editDesignation}
						required
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2 font-bold"
					/>
				</div>
				<div>
					<label for="ed-lookup" class="block text-sm font-bold">Lookup Status</label>
					<select
						id="ed-lookup"
						bind:value={editLookupStatus}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-bold"
					>
						<option value="Active">Active (Visible to Members)</option>
						<option value="Unidentified">Unidentified (Quarantined)</option>
					</select>
				</div>
				<div>
					<label for="ed-basing" class="block text-sm font-bold">Basing Code(s)</label>
					<input
						id="ed-basing"
						type="text"
						bind:value={editBasingCode}
						placeholder="e.g., 8BD or 9AJ / 9LP"
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2 font-bold"
					/>
				</div>
				<div>
					<label for="ed-base" class="block text-sm font-bold">Base</label>
					<input
						id="ed-base"
						list="list-base"
						bind:value={editBase}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-pins" class="block text-sm font-bold">Pin Count</label>
					<input
						id="ed-pins"
						type="number"
						bind:value={editPinCount}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-env" class="block text-sm font-bold">Envelope</label>
					<input
						id="ed-env"
						list="list-env"
						bind:value={editEnvelope}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-cap" class="block text-sm font-bold">Top Cap</label>
					<input
						id="ed-cap"
						list="list-cap"
						bind:value={editCap}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-struct" class="block text-sm font-bold">Internal Structure</label>
					<input
						id="ed-struct"
						list="list-struct"
						bind:value={editStructure}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-func" class="block text-sm font-bold">General Function</label>
					<input
						id="ed-func"
						list="list-func"
						bind:value={editFunction}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-src" class="block text-sm font-bold">Primary Source</label>
					<input
						id="ed-src"
						bind:value={editPrimarySource}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-page" class="block text-sm font-bold">Printed Page</label>
					<input
						id="ed-page"
						bind:value={editPrintedPage}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div>
					<label for="ed-ver" class="block text-sm font-bold">Verification Status</label>
					<input
						id="ed-ver"
						list="list-ver"
						bind:value={editVerificationStatus}
						class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
					/>
				</div>
				<div class="sm:col-span-3">
					<label for="ed-notes" class="block text-sm font-bold">Technical Notes</label>
					<textarea
						id="ed-notes"
						rows="2"
						bind:value={editNotes}
						class="mt-1 w-full rounded-xl border-2 border-stone-700 p-3 text-base"
					></textarea>
				</div>
				<div class="sm:col-span-3">
					<button
						type="submit"
						disabled={busy}
						class="min-h-12 cursor-pointer rounded-xl bg-stone-950 px-6 py-2.5 text-base font-bold text-white hover:bg-stone-800"
					>
						Save Reference Updates
					</button>
				</div>
			</form>
		{/if}
	</section>

	<!-- Add Relationship -->
	<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<h2 class="text-xl font-extrabold text-stone-950">Add Tube Substitute / Relationship</h2>
		<form onsubmit={saveRelationship} class="mt-4 grid gap-3 sm:grid-cols-4">
			<div>
				<label for="rel-orig" class="block text-sm font-bold">Original Designation</label>
				<input
					id="rel-orig"
					type="text"
					bind:value={relDesignation}
					required
					placeholder="e.g., 6K7"
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2 font-bold"
				/>
			</div>
			<div>
				<label for="rel-peer" class="block text-sm font-bold">Related Designation</label>
				<input
					id="rel-peer"
					type="text"
					bind:value={relRelated}
					required
					placeholder="e.g., 6K7GT"
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2 font-bold"
				/>
			</div>
			<div>
				<label for="rel-type" class="block text-sm font-bold">Relationship</label>
				<select
					id="rel-type"
					bind:value={relType}
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-semibold"
				>
					{#each listsByName.Relationship_Type ?? ['Direct substitute', 'Conditional substitute', 'Same tube / alternate designation', 'Family / related type'] as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="rel-dir" class="block text-sm font-bold">Direction Rule</label>
				<select
					id="rel-dir"
					bind:value={relDirection}
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 font-semibold"
				>
					{#each listsByName.Direction ?? ['Interchangeable', 'Related replaces Original', 'Related only'] as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select>
			</div>
			<div class="sm:col-span-2">
				<label for="rel-notes" class="block text-sm font-bold">Qualification / Notes</label>
				<input
					id="rel-notes"
					type="text"
					bind:value={relNotes}
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
				/>
			</div>
			<div>
				<label for="rel-src" class="block text-sm font-bold">Manual Source &amp; Page</label>
				<input
					id="rel-src"
					type="text"
					bind:value={relSource}
					placeholder="e.g., SAMS p. 34"
					class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-700 px-3 py-2"
				/>
			</div>
			<div class="flex items-end">
				<button
					type="submit"
					disabled={busy}
					class="min-h-11 w-full cursor-pointer rounded-xl bg-amber-800 px-4 py-2 text-base font-bold text-white hover:bg-amber-900"
				>
					Add Relationship
				</button>
			</div>
		</form>
	</section>

	<!-- Review Queue Table -->
	<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-2xl font-extrabold text-stone-950">
				Curator Review Queue ({visibleReview.length})
			</h2>
			<label class="flex cursor-pointer items-center gap-2 text-base font-bold">
				<input type="checkbox" bind:checked={showResolved} class="h-5 w-5 accent-stone-900" />
				Show Resolved &amp; Dismissed
			</label>
		</div>

		<div class="mt-4 overflow-x-auto rounded-xl border-2 border-stone-400">
			<table class="min-w-full border-collapse text-left text-sm">
				<thead class="border-b-2 border-stone-400 bg-stone-100 text-stone-950">
					<tr>
						<th class="px-3 py-3 font-extrabold">RefID</th>
						<th class="px-3 py-3 font-extrabold">Field</th>
						<th class="px-3 py-3 font-extrabold">Value</th>
						<th class="px-3 py-3 font-extrabold">Issue &amp; Suggested Action</th>
						<th class="px-3 py-3 font-extrabold">Status</th>
						<th class="px-3 py-3 font-extrabold">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-stone-300 bg-white">
					{#each visibleReview as item}
						<tr class="align-top">
							<td class="px-3 py-3 font-bold">
								{#if item.tubeRefId}
									<button
										type="button"
										onclick={() => (selectedEditId = item.tubeRefId!)}
										class="cursor-pointer font-extrabold text-amber-900 underline"
									>
										{item.tubeRefId}
									</button>
								{:else}
									—
								{/if}
							</td>
							<td class="px-3 py-3 font-semibold">{item.field ?? '—'}</td>
							<td class="px-3 py-3 font-bold text-stone-950">{item.currentValue ?? '—'}</td>
							<td class="max-w-md px-3 py-3">
								<p class="font-semibold text-stone-900">{item.issue ?? '—'}</p>
								{#if item.suggestedAction}
									<p class="mt-0.5 text-xs text-stone-700">{item.suggestedAction}</p>
								{/if}
							</td>
							<td class="px-3 py-3">
								<span
									class="inline-block rounded-md px-2.5 py-0.5 text-xs font-extrabold {item.status ===
									'Resolved'
										? 'bg-emerald-100 text-emerald-950'
										: item.status === 'Dismissed'
											? 'bg-stone-200 text-stone-800'
											: 'bg-amber-100 text-amber-950'}"
								>
									{item.status}
								</span>
							</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-1.5">
									{#if item.status !== 'Resolved'}
										<button
											type="button"
											disabled={busy}
											onclick={() => void setReviewStatus(item, 'Resolved')}
											class="min-h-9 cursor-pointer rounded-lg bg-emerald-800 px-3 py-1 text-xs font-bold text-white"
										>
											Resolve
										</button>
									{/if}
									{#if item.status !== 'Dismissed'}
										<button
											type="button"
											disabled={busy}
											onclick={() => void setReviewStatus(item, 'Dismissed')}
											class="min-h-9 cursor-pointer rounded-lg border border-stone-600 px-2.5 py-1 text-xs font-bold text-stone-800"
										>
											Dismiss
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<datalist id="list-base">
		{#each listsByName.Base ?? [] as v}<option value={v}></option>{/each}
	</datalist>
	<datalist id="list-env">
		{#each listsByName.Envelope ?? [] as v}<option value={v}></option>{/each}
	</datalist>
	<datalist id="list-cap">
		{#each listsByName.Cap ?? [] as v}<option value={v}></option>{/each}
	</datalist>
	<datalist id="list-struct">
		{#each listsByName.Internal_Structure ?? [] as v}<option value={v}></option>{/each}
	</datalist>
	<datalist id="list-func">
		{#each listsByName.General_Function ?? [] as v}<option value={v}></option>{/each}
	</datalist>
	<datalist id="list-ver">
		{#each listsByName.Verification_Status ?? [] as v}<option value={v}></option>{/each}
	</datalist>
</div>
