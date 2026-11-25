<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import { provideUnitPreference } from '$lib/client/unitContext.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const unitState = provideUnitPreference(data.unit);
	$effect(() => {
		unitState.unit = data.unit;
	});

	let currentPath = $derived(page.url.pathname);
	let isAdmin = $derived(data.session?.role === 'admin' || data.session?.role === 'curator');

	function navActive(href: string): boolean {
		if (href === '/') {
			return currentPath === '/' || currentPath.startsWith('/tubes');
		}
		return currentPath.startsWith(href);
	}
</script>

<svelte:head>
	<title>PSARA Tube Lab</title>
</svelte:head>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-stone-950 focus:px-4 focus:py-3 focus:text-lg focus:font-bold focus:text-white"
>
	Skip to main content
</a>

<div class="min-h-screen bg-[#f8f5ef] text-stone-950">
	{#if currentPath !== '/login'}
		<header class="no-print border-b-2 border-stone-900 bg-white">
			<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p class="text-xs font-bold tracking-widest text-amber-900 uppercase sm:text-sm">
							Puget Sound Antique Radio Association
						</p>
						<a
							href="/"
							class="inline-block text-2xl font-extrabold tracking-tight text-stone-950 hover:text-amber-900 sm:text-3xl"
						>
							PSARA Tube Lab
						</a>
					</div>

					<div class="flex flex-wrap items-center gap-3">
						<!-- Global Inches / Millimeters Toggle -->
						<div
							role="group"
							aria-label="Measurement units"
							class="inline-flex rounded-xl border-2 border-stone-900 bg-stone-100 p-1"
						>
							<button
								type="button"
								onclick={() => unitState.setUnit('in')}
								aria-pressed={unitState.unit === 'in'}
								class="min-h-11 cursor-pointer rounded-lg px-3.5 py-2 text-base font-bold transition-colors {unitState.unit === 'in'
									? 'bg-stone-900 text-white'
									: 'text-stone-900 hover:bg-stone-200'}"
							>
								Inches (in)
							</button>
							<button
								type="button"
								onclick={() => unitState.setUnit('mm')}
								aria-pressed={unitState.unit === 'mm'}
								class="min-h-11 cursor-pointer rounded-lg px-3.5 py-2 text-base font-bold transition-colors {unitState.unit === 'mm'
									? 'bg-stone-900 text-white'
									: 'text-stone-900 hover:bg-stone-200'}"
							>
								Millimeters (mm)
							</button>
						</div>

						{#if data.session}
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="inline-flex min-h-11 items-center rounded-xl border-2 border-stone-700 bg-stone-50 px-3.5 py-2 text-base font-bold text-stone-950"
								>
									{data.session.displayName}
									<span class="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-sm text-amber-950">
										{data.session.role === 'admin' ? 'Admin' : 'Member'}
									</span>
								</span>

								{#if data.demoMode}
									<form method="POST" action="/api/auth/demo-switch">
										<input
											type="hidden"
											name="role"
											value={data.session.role === 'admin' ? 'member' : 'admin'}
										/>
										<input type="hidden" name="redirectTo" value={currentPath} />
										<button
											type="submit"
											class="min-h-11 cursor-pointer rounded-xl border-2 border-amber-800 bg-amber-50 px-3.5 py-2 text-base font-bold text-amber-950 hover:bg-amber-100"
										>
											{data.session.role === 'admin'
												? 'Switch to Member View'
												: 'Switch to Admin View'}
										</button>
									</form>
								{:else}
									<form method="POST" action="/api/auth/logout">
										<button
											type="submit"
											class="min-h-11 cursor-pointer rounded-xl border-2 border-stone-700 bg-white px-3.5 py-2 text-base font-bold text-stone-900 hover:bg-stone-100"
										>
											Sign Out
										</button>
									</form>
								{/if}
							</div>
						{:else}
							<a
								href="/login"
								class="inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-4 py-2 text-base font-bold text-white hover:bg-stone-700"
							>
								Sign In
							</a>
						{/if}
					</div>
				</div>

				<!-- 4 Plain-English Tabs -->
				<nav aria-label="Main sections" class="mt-4 flex flex-wrap gap-2.5">
					<a
						href="/"
						aria-current={navActive('/') ? 'page' : undefined}
						class="inline-flex min-h-12 items-center rounded-xl border-2 px-5 py-2.5 text-lg font-bold transition-colors {navActive('/')
							? 'border-stone-950 bg-stone-950 text-white'
							: 'border-stone-400 bg-stone-50 text-stone-950 hover:border-stone-800 hover:bg-stone-100'}"
					>
						Find a Tube
					</a>
					<a
						href="/pull-sheets"
						aria-current={navActive('/pull-sheets') ? 'page' : undefined}
						class="inline-flex min-h-12 items-center rounded-xl border-2 px-5 py-2.5 text-lg font-bold transition-colors {navActive('/pull-sheets')
							? 'border-stone-950 bg-stone-950 text-white'
							: 'border-stone-400 bg-stone-50 text-stone-950 hover:border-stone-800 hover:bg-stone-100'}"
					>
						Pull Sheets
					</a>
					<a
						href="/mystery-tube"
						aria-current={navActive('/mystery-tube') ? 'page' : undefined}
						class="inline-flex min-h-12 items-center rounded-xl border-2 px-5 py-2.5 text-lg font-bold transition-colors {navActive('/mystery-tube')
							? 'border-stone-950 bg-stone-950 text-white'
							: 'border-stone-400 bg-stone-50 text-stone-950 hover:border-stone-800 hover:bg-stone-100'}"
					>
						Mystery Tube Helper
					</a>
					{#if isAdmin}
						<a
							href="/admin"
							aria-current={navActive('/admin') ? 'page' : undefined}
							class="inline-flex min-h-12 items-center rounded-xl border-2 px-5 py-2.5 text-lg font-bold transition-colors {navActive('/admin')
								? 'border-amber-900 bg-amber-900 text-white'
								: 'border-amber-800 bg-amber-50 text-amber-950 hover:bg-amber-100'}"
						>
							Manage Inventory
						</a>
					{/if}
				</nav>
			</div>
		</header>
	{/if}

	<main id="main-content" class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
		{@render children()}
	</main>
</div>
