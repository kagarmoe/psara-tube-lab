<script lang="ts">
	import type { TubeDetailResponse } from '$lib/server/tubes';
	import { useUnitPreference } from '$lib/client/unitContext.svelte';
	import { formatDimensionWithAlt } from '$lib/shared/units';

	let {
		detail,
		onSelectTube
	}: {
		detail: TubeDetailResponse;
		onSelectTube?: (tubeRefId: string) => void;
	} = $props();

	const unitState = useUnitPreference();
	let zoomImage = $state<{ path: string; title: string; subtitle: string } | null>(null);
	let pullLotId = $state<number | null>(null);
	let pullQty = $state(1);
	let pullBusy = $state(false);
	let pullNotice = $state<{ ok: boolean; message: string; code?: string } | null>(null);

	async function addLotToPullSheet(lotId: number, maxQty: number | null, isUnknown: boolean) {
		pullBusy = true;
		pullNotice = null;
		const safeQty = isUnknown
			? Math.max(1, pullQty)
			: Math.min(Math.max(1, pullQty), maxQty ?? 1);
		try {
			const res = await fetch('/api/pull-sheets', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					lotId,
					qtyRequested: safeQty
				})
			});
			const payload = await res.json();
			if (!res.ok) {
				pullNotice = { ok: false, message: payload.error ?? 'Could not add to pull sheet.' };
				return;
			}
			pullNotice = {
				ok: true,
				message: `Added ${safeQty} tube(s) to pull sheet ${payload.requestCode}.`,
				code: payload.requestCode
			};
			pullLotId = null;
			pullQty = 1;
		} finally {
			pullBusy = false;
		}
	}

	let ref = $derived(detail.reference);
	let stock = $derived(detail.stockSummary);
	let diameter = $derived(formatDimensionWithAlt(ref.maxDiameterIn, unitState.unit));
	let seatedHeight = $derived(formatDimensionWithAlt(ref.maxSeatedHeightIn, unitState.unit));
	let overallHeight = $derived(formatDimensionWithAlt(ref.maxOverallHeightIn, unitState.unit));

	function badgeToneForRel(rel: TubeDetailResponse['relationships'][number]): string {
		if (!rel.canUseAsSubstitute && rel.oneWayWarning) {
			return 'border-red-800 bg-red-50 text-red-950';
		}
		if (rel.canUseAsSubstitute && !rel.oneWayWarning) {
			return 'border-emerald-800 bg-emerald-50 text-emerald-950';
		}
		if (rel.canUseAsSubstitute && rel.oneWayWarning) {
			return 'border-amber-800 bg-amber-50 text-amber-950';
		}
		return 'border-stone-500 bg-stone-50 text-stone-900';
	}
</script>

<article class="space-y-6 rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-7">
	<!-- Header & Stock Banner -->
	<header class="border-b-2 border-stone-200 pb-5">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<div class="flex flex-wrap items-center gap-2.5">
					<span class="rounded-lg bg-stone-200 px-3 py-1 text-sm font-bold text-stone-900">
						{ref.tubeRefId}
					</span>
					{#if ref.tubeFamily}
						<span class="rounded-lg bg-amber-100 px-3 py-1 text-sm font-bold text-amber-950">
							{ref.tubeFamily}
						</span>
					{/if}
					<span class="rounded-lg border border-stone-400 px-3 py-1 text-sm font-semibold text-stone-800">
						{ref.verificationStatus ?? ref.referenceStatus}
					</span>
				</div>
				<h2 class="mt-2 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
					{ref.referenceDesignation}
				</h2>
				{#if ref.internalStructure || ref.generalFunction}
					<p class="mt-1 text-lg font-medium text-stone-800">
						{[ref.internalStructure, ref.generalFunction].filter(Boolean).join(' — ')}
					</p>
				{/if}
			</div>

			<div class="flex flex-col items-start gap-2 sm:items-end">
				{#if stock.totalKnownQty > 0 || stock.hasUnknownQty}
					<div
						class="rounded-xl border-2 border-emerald-800 bg-emerald-50 px-4 py-2.5 text-emerald-950"
					>
						<p class="text-xl font-extrabold tabular-nums">
							{stock.totalKnownQty}{stock.hasUnknownQty ? '+' : ''} in club stock
						</p>
						<p class="text-sm font-semibold">
							{stock.lotCount} {stock.lotCount === 1 ? 'lot' : 'lots'}
							{#if stock.boxes.length > 0}
								· {stock.boxes.length === 1 ? 'Box' : 'Boxes'}: {stock.boxes.join(', ')}
							{/if}
						</p>
					</div>
				{:else}
					<div class="rounded-xl border-2 border-stone-500 bg-stone-100 px-4 py-2.5 text-stone-900">
						<p class="text-lg font-extrabold">0 in club stock</p>
						<p class="text-sm font-semibold">Reference data &amp; substitutes available below</p>
					</div>
				{/if}
				<a
					href="/tubes/{ref.tubeRefId}"
					class="text-sm font-bold text-amber-900 underline hover:text-amber-700"
				>
					Open full page link →
				</a>
			</div>
		</div>

		{#if stock.lotCount > 0}
			<div class="mt-4 flex flex-wrap gap-2 text-sm font-bold">
				{#if stock.testedQty > 0}
					<span class="rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1 text-emerald-950">
						{stock.testedQty} Tested
					</span>
				{/if}
				{#if stock.untestedQty > 0}
					<span class="rounded-lg border border-stone-400 bg-stone-100 px-3 py-1 text-stone-900">
						{stock.untestedQty} Untested
					</span>
				{/if}
				{#if stock.nosQty > 0}
					<span class="rounded-lg border border-blue-800 bg-blue-50 px-3 py-1 text-blue-950">
						{stock.nosQty} NOS
					</span>
				{/if}
				{#if stock.usedQty > 0}
					<span class="rounded-lg border border-stone-500 bg-stone-50 px-3 py-1 text-stone-900">
						{stock.usedQty} Used
					</span>
				{/if}
				{#if stock.hasUnknownQty}
					<span class="rounded-lg border border-amber-700 bg-amber-50 px-3 py-1 text-amber-950">
						Includes lot(s) with uncounted (?) qty
					</span>
				{/if}
			</div>
		{/if}
	</header>

	<!-- Where to Find It: Inventory Lots -->
	<section aria-labelledby="lots-heading">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 id="lots-heading" class="text-xl font-extrabold text-stone-950">
				Where to Find It (Storage Lots)
			</h3>
			<a
				href="/pull-sheets"
				class="inline-flex min-h-11 items-center rounded-xl border-2 border-stone-800 bg-stone-100 px-4 py-2 text-base font-bold text-stone-950 hover:bg-stone-200"
			>
				View Pull Sheets →
			</a>
		</div>

		{#if pullNotice}
			<div
				role="status"
				class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 p-3 text-base font-bold {pullNotice.ok
					? 'border-emerald-800 bg-emerald-50 text-emerald-950'
					: 'border-red-800 bg-red-50 text-red-950'}"
			>
				<span>{pullNotice.message}</span>
				{#if pullNotice.ok}
					<a href="/pull-sheets" class="underline">Go to Pull Sheets →</a>
				{/if}
			</div>
		{/if}

		{#if detail.lots.length === 0}
			<p class="mt-3 rounded-xl border border-stone-300 bg-stone-50 p-4 text-base text-stone-800">
				No physical inventory lots are currently assigned to {ref.referenceDesignation}. Check the
				substitutes section below for interchangeable stocked tubes.
			</p>
		{:else}
			<div class="mt-3 overflow-x-auto rounded-xl border-2 border-stone-400">
				<table class="min-w-full border-collapse text-left text-base">
					<thead class="border-b-2 border-stone-400 bg-stone-100 text-stone-950">
						<tr>
							<th class="px-4 py-3 font-extrabold">Box</th>
							<th class="px-4 py-3 font-extrabold">Layer</th>
							<th class="px-4 py-3 font-extrabold">Qty</th>
							<th class="px-4 py-3 font-extrabold">Box Label</th>
							<th class="px-4 py-3 font-extrabold">Condition</th>
							<th class="px-4 py-3 font-extrabold">Test Status</th>
							<th class="px-4 py-3 font-extrabold">Comments</th>
							<th class="px-4 py-3 font-extrabold">Pull Sheet</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-stone-300 bg-white">
						{#each detail.lots as lot}
							<tr class="align-top hover:bg-amber-50/40">
								<td class="px-4 py-3 font-extrabold text-stone-950">{lot.boxNo ?? '—'}</td>
								<td class="px-4 py-3 font-semibold text-stone-900">{lot.boxLayer ?? '—'}</td>
								<td class="px-4 py-3 font-extrabold tabular-nums text-stone-950">
									{#if lot.quantityUnknown}
										<span class="rounded bg-amber-100 px-2 py-0.5 text-amber-950">
											? (Uncounted)
										</span>
									{:else}
										{lot.quantity ?? 0}
									{/if}
								</td>
								<td class="px-4 py-3 font-semibold text-stone-900">{lot.tubeNumber}</td>
								<td class="px-4 py-3 text-stone-900">{lot.stockCondition}</td>
								<td class="px-4 py-3">
									<span
										class="inline-block rounded-md px-2.5 py-0.5 text-sm font-bold {lot.testStatus === 'Tested' || lot.testStatus === 'Good'
											? 'bg-emerald-100 text-emerald-950'
											: lot.testStatus === 'Bad'
												? 'bg-red-100 text-red-950'
												: 'bg-stone-200 text-stone-900'}"
									>
										{lot.testStatus}
									</span>
								</td>
								<td class="max-w-xs px-4 py-3 text-sm whitespace-pre-line text-stone-800">
									{lot.comment ?? '—'}
								</td>
								<td class="px-4 py-3">
									{#if !lot.quantityUnknown && (lot.quantity ?? 0) <= 0}
										<span class="text-sm font-semibold text-stone-500">Empty</span>
									{:else if pullLotId === lot.id}
										<div class="flex flex-wrap items-center gap-2">
											<label for="pull-qty-{lot.id}" class="sr-only">Quantity to pull</label>
											<input
												id="pull-qty-{lot.id}"
												type="number"
												min="1"
												max={lot.quantityUnknown ? 99 : (lot.quantity ?? 1)}
												bind:value={pullQty}
												class="min-h-10 w-18 rounded-lg border-2 border-stone-800 px-2 py-1 text-base font-bold"
											/>
											<button
												type="button"
												disabled={pullBusy}
												onclick={() =>
													void addLotToPullSheet(lot.id, lot.quantity, lot.quantityUnknown)}
												class="min-h-10 cursor-pointer rounded-lg bg-emerald-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-900"
											>
												Add
											</button>
											<button
												type="button"
												onclick={() => (pullLotId = null)}
												class="min-h-10 cursor-pointer rounded-lg border border-stone-500 px-2.5 py-1.5 text-sm font-bold text-stone-800"
											>
												Cancel
											</button>
										</div>
									{:else}
										<button
											type="button"
											onclick={() => {
												pullLotId = lot.id;
												pullQty = 1;
												pullNotice = null;
											}}
											class="min-h-10 cursor-pointer rounded-xl border-2 border-stone-900 bg-amber-50 px-3 py-1.5 text-sm font-bold text-stone-950 hover:bg-amber-100"
										>
											+ Add to Pull
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- Technical Specs & Physical Dimensions + Reference Diagrams -->
	<div class="grid gap-6 xl:grid-cols-2">
		<section
			aria-labelledby="specs-heading"
			class="rounded-xl border-2 border-stone-300 bg-stone-50 p-5"
		>
			<h3 id="specs-heading" class="text-xl font-extrabold text-stone-950">
				Electrical &amp; Physical Specifications
			</h3>
			<dl class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Base &amp; Pin Count</dt>
					<dd class="mt-0.5 text-lg font-extrabold text-stone-950">
						{ref.base ?? '—'}{ref.pinCount ? ` (${ref.pinCount} pins)` : ''}
					</dd>
				</div>
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Basing Code(s)</dt>
					<dd class="mt-0.5 text-lg font-extrabold text-stone-950">
						{ref.basingCode ?? '—'}
					</dd>
				</div>
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Envelope &amp; Top Cap</dt>
					<dd class="mt-0.5 text-lg font-extrabold text-stone-950">
						{ref.envelope ?? '—'} · Cap: {ref.cap ?? 'None'}
					</dd>
				</div>
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Heater / Filament</dt>
					<dd class="mt-0.5 text-lg font-extrabold text-stone-950">
						{ref.heaterVoltage ?? '—'} V · {ref.heaterCurrent ?? '—'} A
					</dd>
					{#if ref.heatingMethod}
						<p class="mt-0.5 text-sm text-stone-700">{ref.heatingMethod}</p>
					{/if}
				</div>
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Max Diameter</dt>
					<dd class="mt-0.5 text-lg font-extrabold tabular-nums text-stone-950">
						{diameter.primary}
					</dd>
					{#if diameter.secondary}
						<p class="text-sm text-stone-700 tabular-nums">({diameter.secondary})</p>
					{/if}
				</div>
				<div class="rounded-lg bg-white p-3 shadow-2xs">
					<dt class="text-sm font-bold text-stone-700">Seated / Overall Height</dt>
					<dd class="mt-0.5 text-lg font-extrabold tabular-nums text-stone-950">
						{seatedHeight.primary} / {overallHeight.primary}
					</dd>
					{#if seatedHeight.secondary || overallHeight.secondary}
						<p class="text-sm text-stone-700 tabular-nums">
							({seatedHeight.secondary ?? '—'} / {overallHeight.secondary ?? '—'})
						</p>
					{/if}
				</div>
			</dl>

			{#if ref.technicalNotes}
				<div class="mt-4 rounded-lg border border-stone-300 bg-white p-3.5">
					<p class="text-sm font-bold text-stone-700">Technical Notes</p>
					<p class="mt-1 text-base whitespace-pre-line text-stone-900">{ref.technicalNotes}</p>
				</div>
			{/if}

			{#if ref.primarySource || ref.secondarySource}
				<p class="mt-3 text-sm font-medium text-stone-800">
					<strong>Manual Sources:</strong>
					{[
						ref.primarySource
							? `${ref.primarySource}${ref.printedPage ? ` (p. ${ref.printedPage})` : ''}`
							: null,
						ref.secondarySource
							? `${ref.secondarySource}${ref.secondaryPage ? ` (p. ${ref.secondaryPage})` : ''}`
							: null
					]
						.filter(Boolean)
						.join(' · ')}
				</p>
			{/if}
		</section>

		<!-- Basing Diagrams & Envelope Outlines -->
		<section
			aria-labelledby="diagrams-heading"
			class="rounded-xl border-2 border-stone-300 bg-stone-50 p-5"
		>
			<h3 id="diagrams-heading" class="text-xl font-extrabold text-stone-950">
				Pinout &amp; Envelope Diagrams
			</h3>
			<p class="mt-1 text-sm text-stone-800">Tap any diagram to view it larger.</p>

			{#if detail.basingDiagrams.length === 0 && detail.envelopeDiagrams.length === 0}
				<p class="mt-4 rounded-lg border border-stone-300 bg-white p-4 text-base text-stone-800">
					No basing or envelope diagram images matched for {ref.basingCode || ref.envelope || 'this record'}.
				</p>
			{:else}
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					{#each detail.basingDiagrams as diagram}
						<button
							type="button"
							onclick={() =>
								(zoomImage = {
									path: diagram.assetPath,
									title: `Basing Diagram: ${diagram.code}`,
									subtitle: `${diagram.source ?? 'Manual'}${diagram.printedPage ? `, p. ${diagram.printedPage}` : ''}`
								})}
							class="cursor-pointer rounded-xl border-2 border-stone-400 bg-white p-3 text-left hover:border-stone-900 focus-visible:outline-3 focus-visible:outline-amber-800"
						>
							<p class="text-base font-extrabold text-stone-950">Basing {diagram.code}</p>
							<p class="text-xs font-semibold text-stone-700">
								{diagram.source ?? 'Reference Manual'}{diagram.printedPage ? ` · p. ${diagram.printedPage}` : ''}
							</p>
							<img
								src={diagram.assetPath}
								alt="Basing pinout diagram {diagram.code}"
								class="mt-2 max-h-56 w-full rounded bg-white object-contain p-1"
							/>
						</button>
					{/each}

					{#each detail.envelopeDiagrams as envDiagram}
						<button
							type="button"
							onclick={() =>
								(zoomImage = {
									path: envDiagram.assetPath,
									title: `Envelope Outline ${envDiagram.code} (${envDiagram.envelopeShape ?? ref.envelope ?? ''})`,
									subtitle: `${envDiagram.source ?? 'Manual'}${envDiagram.printedPage ? `, p. ${envDiagram.printedPage}` : ''}`
								})}
							class="cursor-pointer rounded-xl border-2 border-stone-400 bg-white p-3 text-left hover:border-stone-900 focus-visible:outline-3 focus-visible:outline-amber-800"
						>
							<p class="text-base font-extrabold text-stone-950">
								Outline {envDiagram.code} ({envDiagram.envelopeShape ?? 'Shape'})
							</p>
							<p class="text-xs font-semibold text-stone-700">
								{envDiagram.baseLabel ? `${envDiagram.baseLabel} · ` : ''}{envDiagram.source ?? 'Reference'}
							</p>
							<img
								src={envDiagram.assetPath}
								alt="Envelope outline diagram {envDiagram.code}"
								class="mt-2 max-h-56 w-full rounded bg-white object-contain p-1"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<!-- Direction-Safe Substitutes & Relationships -->
	<section aria-labelledby="rels-heading">
		<h3 id="rels-heading" class="text-xl font-extrabold text-stone-950">
			Substitutes &amp; Related Tubes
		</h3>

		{#if detail.relationships.length === 0}
			<p class="mt-2 text-base text-stone-800">
				No documented substitute or family relationships are recorded for {ref.referenceDesignation}.
			</p>
		{:else}
			<div class="mt-3 space-y-3">
				{#each detail.relationships as rel}
					<div class="rounded-xl border-2 p-4 {badgeToneForRel(rel)}">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="space-y-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="rounded-md bg-white/80 px-2.5 py-0.5 text-sm font-extrabold">
										{rel.roleBadge}
									</span>
									<span class="text-sm font-bold">
										{rel.relationship} · {rel.direction}
									</span>
									{#if rel.differenceType && rel.differenceType !== 'None'}
										<span class="rounded-md bg-white/70 px-2 py-0.5 text-sm font-semibold">
											Difference: {rel.differenceType}
										</span>
									{/if}
								</div>

								<p class="text-lg font-extrabold">{rel.summaryText}</p>

								{#if rel.qualificationNotes || rel.originalNote}
									<p class="text-base font-medium">
										{rel.qualificationNotes ?? rel.originalNote}
									</p>
								{/if}

								{#if rel.source}
									<p class="text-sm">
										Source: {rel.source}{rel.sourcePage ? `, p. ${rel.sourcePage}` : ''}
										{rel.verificationStatus ? ` (${rel.verificationStatus})` : ''}
									</p>
								{/if}
							</div>

							<div class="flex flex-col items-start gap-2 sm:items-end">
								{#if rel.peerTubeRefId}
									<span class="rounded-lg bg-white px-3 py-1 text-sm font-bold text-stone-950">
										{rel.peerInStockQty > 0
											? `${rel.peerInStockQty} in stock`
											: '0 in stock'}
									</span>
									{#if onSelectTube}
										<button
											type="button"
											onclick={() => onSelectTube(rel.peerTubeRefId!)}
											class="min-h-11 cursor-pointer rounded-xl bg-stone-950 px-4 py-2 text-base font-bold text-white hover:bg-stone-800"
										>
											View {rel.peerDesignation} →
										</button>
									{:else}
										<a
											href="/tubes/{rel.peerTubeRefId}"
											class="inline-flex min-h-11 items-center rounded-xl bg-stone-950 px-4 py-2 text-base font-bold text-white hover:bg-stone-800"
										>
											View {rel.peerDesignation} →
										</a>
									{/if}
								{:else}
									<span class="text-sm font-semibold italic">
										Not in local reference table
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</article>

{#if zoomImage}
	<div
		role="dialog"
		aria-modal="true"
		aria-label={zoomImage.title}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
	>
		<div class="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl border-2 border-stone-900 bg-white p-6">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="text-2xl font-extrabold text-stone-950">{zoomImage.title}</h3>
					<p class="text-base text-stone-800">{zoomImage.subtitle}</p>
				</div>
				<button
					type="button"
					onclick={() => (zoomImage = null)}
					class="min-h-12 cursor-pointer rounded-xl bg-stone-900 px-5 py-2 text-base font-bold text-white hover:bg-stone-700"
				>
					Close
				</button>
			</div>
			<img
				src={zoomImage.path}
				alt={zoomImage.title}
				class="mt-4 max-h-[70vh] w-full rounded-xl border border-stone-300 bg-white object-contain p-2"
			/>
		</div>
	</div>
{/if}
