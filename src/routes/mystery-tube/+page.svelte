<script lang="ts">
	import { useUnitPreference } from '$lib/client/unitContext.svelte';
	import type { MysteryMatchWithDiagrams } from '$lib/server/mystery';
	import type { VisionPrefillSuggestion, VisionProvider } from '$lib/server/vision';
	import { mapBaseToFilamentGroup } from '$lib/shared/mystery-ranker';
	import { formatDimension } from '$lib/shared/units';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const unitState = useUnitPreference();

	// 5-Step Observation State
	let pinCount = $state<string>('');
	let exactBase = $state<string>('');
	let topCap = $state<'any' | 'yes' | 'no'>('any');
	let envelope = $state<string>('');
	let diameterInput = $state<string>('');
	let heightInput = $state<string>('');
	let heatingMethod = $state<'any' | 'indirect' | 'direct' | 'cold'>('any');
	let heaterVoltage = $state<string>('');
	let filamentPins = $state<string>('');
	let selectedElements = $state<string[]>([]);
	let notesKeyword = $state<string>('');
	let inStockOnly = $state<boolean>(true);
	let continuityNotes = $state<string>('');
	let observerName = $state<string>(data.defaultObserverName);

	// Candidate Matches
	let matches = $state<MysteryMatchWithDiagrams[]>(data.initialMatches);
	let matching = $state(false);
	let zoomImage = $state<{ path: string; title: string; subtitle: string } | null>(null);
	let showEnvelopeGallery = $state(false);

	// Observation Save State
	let recentObservations = $state(data.recentObservations);
	let savingObs = $state(false);
	let obsFeedback = $state<string | null>(null);

	// Progressive-Enhancement Optional Photo Assist (never saved to DB)
	let showPhotoDrawer = $state(false);
	let photoFile = $state<File | null>(null);
	let photoBusy = $state(false);
	let photoError = $state<string | null>(null);
	let photoSuggestion = $state<VisionPrefillSuggestion | null>(null);
	let byokProvider = $state<VisionProvider>('gemini');
	let byokApiKey = $state('');
	let byokBaseUrl = $state('http://localhost:11434/v1');
	let byokModel = $state('');

	let activeFilamentGroup = $derived(mapBaseToFilamentGroup(exactBase));
	let relevantFilamentOptions = $derived(
		activeFilamentGroup
			? data.filamentHeaterOptions.filter((f) => f.baseGroup === activeFilamentGroup)
			: data.filamentHeaterOptions
	);

	function toInches(raw: string): number | null {
		const n = Number(raw.trim());
		if (!raw.trim() || !Number.isFinite(n) || n <= 0) return null;
		return unitState.unit === 'mm' ? n / 25.4 : n;
	}

	async function runMatch() {
		matching = true;
		try {
			const res = await fetch('/api/mystery/match', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					pinCount: pinCount ? Number(pinCount) : null,
					exactBase: exactBase || null,
					topCap,
					envelope: envelope.trim() || null,
					diameterIn: toInches(diameterInput),
					heightIn: toInches(heightInput),
					heatingMethod,
					heaterVoltage: heaterVoltage.trim() || null,
					functionalElements: selectedElements,
					inStockOnly,
					notesKeyword: notesKeyword.trim()
				})
			});
			if (res.ok) {
				const payload = await res.json();
				matches = payload.matches;
			}
		} finally {
			matching = false;
		}
	}

	function toggleElement(name: string) {
		if (selectedElements.includes(name)) {
			selectedElements = selectedElements.filter((x) => x !== name);
		} else {
			selectedElements = [...selectedElements, name];
		}
		void runMatch();
	}

	function resetWizard() {
		pinCount = '';
		exactBase = '';
		topCap = 'any';
		envelope = '';
		diameterInput = '';
		heightInput = '';
		heatingMethod = 'any';
		heaterVoltage = '';
		filamentPins = '';
		selectedElements = [];
		notesKeyword = '';
		inStockOnly = false;
		continuityNotes = '';
		photoSuggestion = null;
		void runMatch();
	}

	async function saveObservation() {
		savingObs = true;
		obsFeedback = null;
		try {
			const res = await fetch('/api/mystery/observations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					pinCount: pinCount ? Number(pinCount) : null,
					baseType: exactBase || null,
					topCap,
					envelope: envelope.trim() || null,
					diameterIn: toInches(diameterInput),
					heightIn: toInches(heightInput),
					filamentPins: filamentPins || null,
					continuityNotes: continuityNotes || null,
					functionalElements: selectedElements,
					matchedTubeRefIds: matches.slice(0, 5).map((m) => m.tubeRefId),
					photoExtractedJson: photoSuggestion,
					observerName,
					notes: notesKeyword || null
				})
			});
			if (res.ok) {
				const payload = await res.json();
				recentObservations = [payload.observation, ...recentObservations].slice(0, 10);
				obsFeedback = 'Saved observation run to club log.';
			}
		} finally {
			savingObs = false;
		}
	}

	async function analyzePhoto(e: SubmitEvent) {
		e.preventDefault();
		if (!photoFile) return;
		photoBusy = true;
		photoError = null;
		try {
			const buf = await photoFile.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = '';
			for (let i = 0; i < bytes.byteLength; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			const imageBase64 = btoa(binary);

			const body: Record<string, unknown> = {
				imageBase64,
				mimeType: photoFile.type || 'image/jpeg'
			};

			if (!data.vision.serverConfigured) {
				body.provider = byokProvider;
				if (byokApiKey.trim()) body.apiKey = byokApiKey.trim();
				if (byokProvider === 'local' && byokBaseUrl.trim()) body.baseUrl = byokBaseUrl.trim();
				if (byokModel.trim()) body.model = byokModel.trim();
			}

			const res = await fetch('/api/mystery/photo-prefill', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json();
			if (!res.ok) {
				photoError = payload.error ?? 'Unable to extract features from photo.';
				return;
			}
			photoSuggestion = payload.suggestion;
		} finally {
			photoBusy = false;
		}
	}

	function applyPhotoSuggestion() {
		if (!photoSuggestion) return;
		if (photoSuggestion.pinCount !== null) {
			pinCount = String(photoSuggestion.pinCount);
		}
		if (
			photoSuggestion.baseGuess &&
			data.bases.some((b) => b.toLowerCase() === photoSuggestion!.baseGuess!.toLowerCase())
		) {
			exactBase =
				data.bases.find((b) => b.toLowerCase() === photoSuggestion!.baseGuess!.toLowerCase()) ?? '';
		}
		topCap = photoSuggestion.hasTopCap;
		if (photoSuggestion.envelopeGuess) envelope = photoSuggestion.envelopeGuess;
		if (photoSuggestion.visualClues?.length) {
			selectedElements = Array.from(new Set([...selectedElements, ...photoSuggestion.visualClues]));
		}
		if (photoSuggestion.visibleMarkings) {
			notesKeyword = photoSuggestion.visibleMarkings;
		}
		void runMatch();
	}
</script>

<svelte:head>
	<title>Mystery Tube Helper — PSARA Tube Lab</title>
</svelte:head>

<div class="space-y-6">
	<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-extrabold text-stone-950 sm:text-3xl">
					Mystery Tube Identification Helper
				</h1>
				<p class="mt-1 max-w-3xl text-base text-stone-800">
					Identify unmarked or rubbed-off tubes step by step using physical clues—pin count,
					socket style, top cap, envelope shape, filament continuity, and internal structure.
				</p>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					onclick={() => (showPhotoDrawer = !showPhotoDrawer)}
					class="min-h-11 cursor-pointer rounded-xl border-2 border-amber-800 bg-amber-50 px-4 py-2 text-base font-bold text-amber-950 hover:bg-amber-100"
				>
					{showPhotoDrawer ? 'Hide Photo Assist' : 'Optional: Pre-fill from Photo'}
				</button>
				<button
					type="button"
					onclick={resetWizard}
					class="min-h-11 cursor-pointer rounded-xl border-2 border-stone-700 bg-stone-100 px-4 py-2 text-base font-bold text-stone-950 hover:bg-stone-200"
				>
					Start Over
				</button>
			</div>
		</div>

		{#if showPhotoDrawer}
			<div class="mt-5 rounded-xl border-2 border-amber-800 bg-amber-50 p-5">
				<h2 class="text-xl font-extrabold text-stone-950">
					Optional Photo Pre-Fill (Verify Physically)
				</h2>
				<p class="mt-1 text-base text-stone-800">
					Upload a photo of your tube to suggest Stage 1–2 guesses. Keys entered below stay in this
					tab only and are never saved.
				</p>

				<form onsubmit={analyzePhoto} class="mt-4 space-y-4">
					{#if !data.vision.serverConfigured}
						<div class="grid gap-3 rounded-xl border border-amber-700 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<label for="vis-provider" class="block text-sm font-bold text-stone-900">
									AI Provider
								</label>
								<select
									id="vis-provider"
									bind:value={byokProvider}
									class="mt-1 min-h-11 w-full rounded-lg border-2 border-stone-600 bg-white px-3 py-2 text-base font-bold"
								>
									<option value="gemini">Google Gemini</option>
									<option value="anthropic">Anthropic Claude</option>
									<option value="openai">OpenAI</option>
									<option value="local">Local Ollama / Compatible</option>
								</select>
							</div>

							{#if byokProvider === 'local'}
								<div>
									<label for="vis-url" class="block text-sm font-bold text-stone-900">
										Local Endpoint URL
									</label>
									<input
										id="vis-url"
										type="text"
										bind:value={byokBaseUrl}
										class="mt-1 min-h-11 w-full rounded-lg border-2 border-stone-600 px-3 py-2 text-base"
									/>
								</div>
							{:else}
								<div>
									<label for="vis-key" class="block text-sm font-bold text-stone-900">
										Your Session API Key
									</label>
									<input
										id="vis-key"
										type="password"
										bind:value={byokApiKey}
										placeholder="Stays in memory only"
										class="mt-1 min-h-11 w-full rounded-lg border-2 border-stone-600 px-3 py-2 text-base"
									/>
								</div>
							{/if}

							<div>
								<label for="vis-model" class="block text-sm font-bold text-stone-900">
									Model (Optional)
								</label>
								<input
									id="vis-model"
									type="text"
									bind:value={byokModel}
									placeholder={byokProvider === 'local' ? 'qwen2.5vl' : 'default'}
									class="mt-1 min-h-11 w-full rounded-lg border-2 border-stone-600 px-3 py-2 text-base"
								/>
							</div>
						</div>
					{:else}
						<p class="text-sm font-bold text-emerald-950">
							Server runtime vision configured ({data.vision.provider}).
						</p>
					{/if}

					<div class="flex flex-wrap items-center gap-3">
						<input
							type="file"
							accept="image/*"
							onchange={(e) => {
								const input = e.currentTarget;
								photoFile = input.files?.[0] ?? null;
							}}
							class="min-h-11 rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base"
						/>
						<button
							type="submit"
							disabled={!photoFile || photoBusy}
							class="min-h-12 cursor-pointer rounded-xl bg-stone-950 px-5 py-2 text-base font-bold text-white hover:bg-stone-800 disabled:bg-stone-400"
						>
							{photoBusy ? 'Inspecting Photo...' : 'Analyze Tube Photo'}
						</button>
					</div>
				</form>

				{#if photoError}
					<p role="alert" class="mt-3 font-bold text-red-900">{photoError}</p>
				{/if}

				{#if photoSuggestion}
					<div class="mt-4 rounded-xl border-2 border-stone-900 bg-white p-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="text-base font-extrabold text-amber-950">
								AI Suggestion ({photoSuggestion.providerUsed}) — Please verify physically
							</p>
							<button
								type="button"
								onclick={applyPhotoSuggestion}
								class="min-h-11 cursor-pointer rounded-xl bg-amber-800 px-4 py-2 text-base font-bold text-white hover:bg-amber-900"
							>
								Apply Suggestions to Checklist
							</button>
						</div>
						<p class="mt-2 text-sm text-stone-800">
							Pins: <strong>{photoSuggestion.pinCount ?? '—'}</strong> · Base:
							<strong>{photoSuggestion.baseGuess ?? '—'}</strong> · Top Cap:
							<strong>{photoSuggestion.hasTopCap}</strong> · Envelope:
							<strong>{photoSuggestion.envelopeGuess ?? '—'}</strong>
						</p>
						<p class="mt-1 text-sm text-stone-700">{photoSuggestion.notes}</p>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Two-Column Deterministic Workbench -->
	<div class="grid gap-6 lg:grid-cols-12">
		<!-- Left: 5-Stage Observation Checklist -->
		<div class="space-y-5 lg:col-span-5">
			<!-- Stage 1 -->
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5">
				<h2 class="text-xl font-extrabold text-stone-950">1. Pins, Socket &amp; Top Cap</h2>

				<div class="mt-3 space-y-4">
					<div>
						<span class="block text-sm font-bold text-stone-900">Quick Pin Count</span>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each [4, 5, 6, 7, 8, 9, 12] as pins}
								<button
									type="button"
									onclick={() => {
										pinCount = pinCount === String(pins) ? '' : String(pins);
										void runMatch();
									}}
									class="min-h-11 min-w-12 cursor-pointer rounded-xl border-2 px-3 py-2 text-base font-extrabold {pinCount ===
									String(pins)
										? 'border-stone-950 bg-stone-950 text-white'
										: 'border-stone-500 bg-stone-50 text-stone-950 hover:bg-stone-100'}"
								>
									{pins}
								</button>
							{/each}
						</div>
					</div>

					<div>
						<label for="mys-base" class="block text-sm font-bold text-stone-900">Base / Socket</label>
						<select
							id="mys-base"
							bind:value={exactBase}
							onchange={() => void runMatch()}
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold text-stone-950"
						>
							<option value="">Any Base Type</option>
							{#each data.bases as b}
								<option value={b}>{b}</option>
							{/each}
						</select>
					</div>

					<div>
						<span class="block text-sm font-bold text-stone-900">Top Grid / Plate Cap?</span>
						<div class="mt-2 grid grid-cols-3 gap-2">
							{#each [
								{ val: 'any', label: 'Any' },
								{ val: 'no', label: 'No Cap' },
								{ val: 'yes', label: 'Has Top Cap' }
							] as opt}
								<button
									type="button"
									onclick={() => {
										topCap = opt.val as 'any' | 'yes' | 'no';
										void runMatch();
									}}
									class="min-h-11 cursor-pointer rounded-xl border-2 px-2 py-2 text-sm font-extrabold {topCap ===
									opt.val
										? 'border-stone-950 bg-stone-950 text-white'
										: 'border-stone-500 bg-stone-50 text-stone-950'}"
								>
									{opt.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</section>

			<!-- Stage 2 -->
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="text-xl font-extrabold text-stone-950">2. Envelope &amp; Size</h2>
					<button
						type="button"
						onclick={() => (showEnvelopeGallery = true)}
						class="min-h-10 cursor-pointer rounded-lg border-2 border-stone-800 bg-stone-100 px-3 py-1 text-sm font-bold text-stone-950 hover:bg-stone-200"
					>
						Compare Outline Shapes
					</button>
				</div>

				<div class="mt-3 space-y-3">
					<div>
						<label for="mys-env" class="block text-sm font-bold text-stone-900">
							Envelope / Bulb Shape
						</label>
						<input
							id="mys-env"
							type="text"
							bind:value={envelope}
							onchange={() => void runMatch()}
							placeholder="e.g., T5½, T6½, T9, ST12, MT8"
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base font-bold text-stone-950"
						/>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each ['T5½', 'T6½', 'T9', 'T12', 'MT8', 'ST12', 'ST14'] as quickEnv}
								<button
									type="button"
									onclick={() => {
										envelope = envelope === quickEnv ? '' : quickEnv;
										void runMatch();
									}}
									class="min-h-9 cursor-pointer rounded-lg border border-stone-500 px-2.5 py-1 text-sm font-bold {envelope ===
									quickEnv
										? 'bg-stone-950 text-white'
										: 'bg-stone-50 text-stone-900'}"
								>
									{quickEnv}
								</button>
							{/each}
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label for="mys-diam" class="block text-sm font-bold text-stone-900">
								Measured Diameter ({unitState.unit})
							</label>
							<input
								id="mys-diam"
								type="number"
								step="0.01"
								min="0"
								bind:value={diameterInput}
								onchange={() => void runMatch()}
								placeholder={unitState.unit === 'mm' ? 'e.g., 33' : 'e.g., 1.31'}
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base font-bold"
							/>
						</div>

						<div>
							<label for="mys-height" class="block text-sm font-bold text-stone-900">
								Measured Height ({unitState.unit})
							</label>
							<input
								id="mys-height"
								type="number"
								step="0.01"
								min="0"
								bind:value={heightInput}
								onchange={() => void runMatch()}
								placeholder={unitState.unit === 'mm' ? 'e.g., 70' : 'e.g., 2.75'}
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base font-bold"
							/>
						</div>
					</div>
				</div>
			</section>

			<!-- Stage 3 -->
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5">
				<h2 class="text-xl font-extrabold text-stone-950">3. Filament / Heater Continuity</h2>
				<p class="mt-1 text-sm text-stone-800">
					Check continuity with an ohmmeter. Common pin pairs are shown below.
				</p>

				<div class="mt-3 space-y-3">
					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label for="mys-heat" class="block text-sm font-bold text-stone-900">
								Heating Type
							</label>
							<select
								id="mys-heat"
								bind:value={heatingMethod}
								onchange={() => void runMatch()}
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-bold"
							>
								<option value="any">Any / Unknown</option>
								<option value="indirect">Indirectly Heated (Separate Cathode)</option>
								<option value="direct">Directly Heated (Filament Only)</option>
								<option value="cold">Cold Cathode (No Heater)</option>
							</select>
						</div>

						<div>
							<label for="mys-hv" class="block text-sm font-bold text-stone-900">
								Known Filament V (Optional)
							</label>
							<input
								id="mys-hv"
								type="text"
								bind:value={heaterVoltage}
								onchange={() => void runMatch()}
								placeholder="e.g., 6.3 or 12.6"
								class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base font-bold"
							/>
						</div>
					</div>

					<div>
						<label for="mys-filpins" class="block text-sm font-bold text-stone-900">
							Filament Pins Measured ({activeFilamentGroup ?? 'All Bases'})
						</label>
						<select
							id="mys-filpins"
							bind:value={filamentPins}
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-3 py-2 text-base font-semibold"
						>
							<option value="">Not tested yet / Skip</option>
							{#each relevantFilamentOptions as opt}
								<option value={`${opt.baseGroup}: ${opt.filamentHeaterOption}`}>
									{opt.baseGroup} — {opt.filamentHeaterOption}{opt.defaultAssumption ? ' (Most common)' : ''}
								</option>
							{/each}
						</select>
					</div>
				</div>
			</section>

			<!-- Stage 4 -->
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5">
				<h2 class="text-xl font-extrabold text-stone-950">4. Visible Elements &amp; Filters</h2>
				<p class="mt-1 text-sm text-stone-800">
					Select electrodes or shields visible through the glass (or shell type).
				</p>

				<div class="mt-3 flex flex-wrap gap-2">
					{#each data.functionalElements as elem}
						{@const active = selectedElements.includes(elem.functionalElement)}
						<button
							type="button"
							onclick={() => toggleElement(elem.functionalElement)}
							class="min-h-10 cursor-pointer rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition-colors {active
								? 'border-stone-950 bg-stone-950 text-white'
								: 'border-stone-400 bg-stone-50 text-stone-900 hover:bg-stone-100'}"
						>
							{elem.functionalElement}{elem.symbol ? ` (${elem.symbol})` : ''}
						</button>
					{/each}
				</div>

				<div class="mt-4 space-y-3 border-t border-stone-200 pt-4">
					<label
						class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 text-base font-bold {inStockOnly
							? 'border-emerald-800 bg-emerald-50 text-emerald-950'
							: 'border-stone-500 bg-stone-50 text-stone-950'}"
					>
						<input
							type="checkbox"
							bind:checked={inStockOnly}
							onchange={() => void runMatch()}
							class="h-5 w-5 accent-emerald-800"
						/>
						Prioritize / Filter to Tubes in Club Stock
					</label>

					<div>
						<label for="mys-kw" class="block text-sm font-bold text-stone-900">
							Faint Markings or Notes Keyword
						</label>
						<input
							id="mys-kw"
							type="text"
							bind:value={notesKeyword}
							onchange={() => void runMatch()}
							placeholder="e.g., rectifier, magic eye, GT, dual"
							class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 px-3 py-2 text-base"
						/>
					</div>

					<button
						type="button"
						onclick={() => void runMatch()}
						class="min-h-12 w-full cursor-pointer rounded-xl bg-amber-800 px-5 py-3 text-lg font-bold text-white hover:bg-amber-900"
					>
						{matching ? 'Updating Matches...' : 'Update Candidate Matches'}
					</button>
				</div>
			</section>
		</div>

		<!-- Right: Stage 5 Ranked Candidates & Trial Pinout Viewer -->
		<div class="space-y-6 lg:col-span-7">
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<div class="flex flex-wrap items-center justify-between gap-2 border-b-2 border-stone-200 pb-4">
					<div>
						<h2 class="text-2xl font-extrabold text-stone-950">
							5. Ranked Candidates &amp; Trial Pinouts
						</h2>
						<p class="text-base text-stone-800">
							Showing top <strong>{matches.length}</strong> matches out of
							<strong>{data.totalEvaluated}</strong> verified tube references.
						</p>
					</div>
				</div>

				{#if matches.length === 0}
					<div class="mt-6 rounded-xl border-2 border-stone-300 bg-stone-50 p-6 text-center">
						<p class="text-xl font-extrabold text-stone-950">No tubes matched every constraint</p>
						<p class="mt-2 text-base text-stone-800">
							Try unchecking <strong>In Club Stock</strong> or clearing one of the stricter size or
							envelope filters.
						</p>
					</div>
				{:else}
					<div class="mt-4 space-y-4">
						{#each matches as m}
							<article class="rounded-2xl border-2 border-stone-400 bg-stone-50 p-4 sm:p-5">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div class="flex flex-wrap items-center gap-2">
											<span class="rounded-lg bg-stone-950 px-3 py-1 text-base font-extrabold text-white">
												{m.score}% match
											</span>
											<a
												href="/tubes/{m.tubeRefId}"
												class="text-2xl font-extrabold text-amber-900 underline hover:text-amber-700"
											>
												{m.referenceDesignation}
											</a>
											<span class="rounded-md bg-white px-2.5 py-0.5 text-sm font-bold text-stone-800">
												{m.tubeRefId}
											</span>
										</div>
										<p class="mt-1 text-base font-semibold text-stone-900">
											{[m.internalStructure, m.generalFunction].filter(Boolean).join(' · ') || '—'}
										</p>
										<p class="mt-1 text-sm font-bold text-stone-800">
											{m.base ?? '—'} · Basing: {m.basingCode ?? '—'} · Envelope: {m.envelope ?? '—'} ·
											Heater: {m.heaterVoltage ?? '—'}V / {m.heaterCurrent ?? '—'}A
										</p>
										<p class="text-sm text-stone-700">
											Diameter: {formatDimension(m.maxDiameterIn, unitState.unit)} · Overall Ht:
											{formatDimension(m.maxOverallHeightIn, unitState.unit)}
										</p>
									</div>

									<div class="text-right">
										<span
											class="inline-block rounded-lg px-3 py-1 text-sm font-extrabold {m.totalQty > 0 ||
											m.hasUnknownQty
												? 'bg-emerald-100 text-emerald-950'
												: 'bg-stone-200 text-stone-800'}"
										>
											{m.totalQty}{m.hasUnknownQty ? '+' : ''} in stock
										</span>
									</div>
								</div>

								{#if m.matchedCriteria.length > 0}
									<div class="mt-3 flex flex-wrap gap-1.5">
										{#each m.matchedCriteria as crit}
											<span class="rounded-md border border-emerald-700 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-950">
												✓ {crit}
											</span>
										{/each}
									</div>
								{/if}

								{#if m.warnings.length > 0}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each m.warnings as warn}
											<span class="rounded-md border border-amber-700 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-950">
												! {warn}
											</span>
										{/each}
									</div>
								{/if}

								{#if m.basingDiagrams.length > 0}
									<div class="mt-3 flex flex-wrap gap-3">
										{#each m.basingDiagrams as diag}
											<button
												type="button"
												onclick={() =>
													(zoomImage = {
														path: diag.assetPath,
														title: `${m.referenceDesignation} — Basing ${diag.code}`,
														subtitle: `${diag.source ?? 'Manual'}${diag.printedPage ? `, p. ${diag.printedPage}` : ''}`
													})}
												class="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-stone-400 bg-white p-2.5 hover:border-stone-900"
											>
												<img
													src={diag.assetPath}
													alt="Trial basing diagram {diag.code}"
													class="h-20 w-20 object-contain"
												/>
												<div class="text-left">
													<p class="text-sm font-extrabold text-stone-950">
														Trial Pinout {diag.code}
													</p>
													<p class="text-xs text-stone-700">Tap to enlarge</p>
												</div>
											</button>
										{/each}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Save Observation Log -->
			<section class="rounded-2xl border-2 border-stone-900 bg-white p-5 sm:p-6">
				<h2 class="text-xl font-extrabold text-stone-950">Save This Mystery Tube Check</h2>
				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<div>
						<label for="obs-name" class="block text-sm font-bold text-stone-900">Your Name</label>
						<input
							id="obs-name"
							type="text"
							bind:value={observerName}
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-600 px-3 py-2 text-base font-semibold"
						/>
					</div>
					<div>
						<label for="obs-cont" class="block text-sm font-bold text-stone-900">
							Continuity / Bench Notes
						</label>
						<input
							id="obs-cont"
							type="text"
							bind:value={continuityNotes}
							placeholder="e.g., Continuity on pins 2-7 (~4 ohms), open elsewhere"
							class="mt-1 min-h-11 w-full rounded-xl border-2 border-stone-600 px-3 py-2 text-base"
						/>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button
						type="button"
						disabled={savingObs}
						onclick={() => void saveObservation()}
						class="min-h-12 cursor-pointer rounded-xl bg-stone-950 px-5 py-2.5 text-base font-bold text-white hover:bg-stone-800"
					>
						{savingObs ? 'Saving...' : 'Save Observation to Club Log'}
					</button>
					{#if obsFeedback}
						<span class="text-base font-bold text-emerald-900">{obsFeedback}</span>
					{/if}
				</div>

				{#if recentObservations.length > 0}
					<div class="mt-5 border-t border-stone-200 pt-4">
						<h3 class="text-base font-extrabold text-stone-950">Recent Saved Observations</h3>
						<ul class="mt-2 space-y-2 text-sm text-stone-800">
							{#each recentObservations as obs}
								<li class="rounded-lg border border-stone-300 bg-stone-50 p-3">
									<strong>{obs.observerName ?? 'Member'}</strong> —
									{obs.pinCount ? `${obs.pinCount} pins` : 'pins ?'} ·
									{obs.baseType ?? 'base ?'} · {obs.envelope ?? 'envelope ?'}
									{#if obs.matchedTubeRefIds.length > 0}
										· Top matches: <strong>{obs.matchedTubeRefIds.join(', ')}</strong>
									{/if}
									{#if obs.continuityNotes}
										<p class="mt-1 text-xs text-stone-700">{obs.continuityNotes}</p>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>

<!-- Envelope Outline Comparison Modal -->
{#if showEnvelopeGallery}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Compare Envelope Outlines"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
	>
		<div class="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border-2 border-stone-900 bg-white p-6">
			<div class="flex items-center justify-between gap-4 border-b border-stone-300 pb-4">
				<div>
					<h2 class="text-2xl font-extrabold text-stone-950">Reference Envelope Outlines</h2>
					<p class="text-base text-stone-800">
						Tap an outline matching your tube's glass/metal silhouette to filter candidates.
					</p>
				</div>
				<button
					type="button"
					onclick={() => (showEnvelopeGallery = false)}
					class="min-h-12 cursor-pointer rounded-xl bg-stone-950 px-5 py-2 text-base font-bold text-white"
				>
					Close
				</button>
			</div>

			<div class="mt-4 grid gap-4 sm:grid-cols-3 md:grid-cols-4">
				{#each data.envelopeDiagrams as diag}
					<button
						type="button"
						onclick={() => {
							if (diag.envelopeShape && diag.envelopeShape !== 'Unspecified') {
								envelope =
									diag.envelopeShape === 'Metal type' ? 'MT8' : diag.envelopeShape;
							}
							showEnvelopeGallery = false;
							void runMatch();
						}}
						class="cursor-pointer rounded-xl border-2 border-stone-400 bg-stone-50 p-3 text-left hover:border-stone-950"
					>
						<p class="text-sm font-extrabold text-stone-950">
							{diag.code} · {diag.envelopeShape ?? 'Shape'}
						</p>
						<p class="text-xs text-stone-700">{diag.baseLabel ?? diag.source ?? ''}</p>
						<img
							src={diag.assetPath}
							alt="Envelope outline {diag.code}"
							class="mt-2 h-32 w-full rounded bg-white object-contain p-1"
						/>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Pinout Zoom Modal -->
{#if zoomImage}
	<div
		role="dialog"
		aria-modal="true"
		aria-label={zoomImage.title}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
	>
		<div class="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl border-2 border-stone-900 bg-white p-6">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="text-2xl font-extrabold text-stone-950">{zoomImage.title}</h3>
					<p class="text-base text-stone-800">{zoomImage.subtitle}</p>
				</div>
				<button
					type="button"
					onclick={() => (zoomImage = null)}
					class="min-h-12 cursor-pointer rounded-xl bg-stone-900 px-5 py-2 text-base font-bold text-white"
				>
					Close
				</button>
			</div>
			<img
				src={zoomImage.path}
				alt={zoomImage.title}
				class="mt-4 max-h-[68vh] w-full rounded-xl border border-stone-300 bg-white object-contain p-2"
			/>
		</div>
	</div>
{/if}
