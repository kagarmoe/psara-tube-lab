<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign In — PSARA Tube Lab</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-8">
	<div class="rounded-2xl border-2 border-stone-900 bg-white p-6 shadow-sm">
		<p class="text-sm font-bold tracking-wide text-amber-900 uppercase">
			Puget Sound Antique Radio Association
		</p>
		<h1 class="mt-1 text-3xl font-extrabold text-stone-950">Sign in to PSARA Tube Lab</h1>
		<p class="mt-2 text-lg text-stone-700">
			Use the shared club access code to look up tubes and prepare pull sheets, or sign in with an
			admin account to update inventory.
		</p>
	</div>

	{#if data.demoMode}
		<section class="rounded-2xl border-2 border-amber-800 bg-amber-50 p-6">
			<h2 class="text-xl font-bold text-stone-950">Portfolio Demo Mode Is Active</h2>
			<p class="mt-1 text-base text-stone-800">
				You can explore the club database right away as a Demo Member or Demo Admin without a
				password.
			</p>
			<div class="mt-4 flex flex-wrap gap-3">
				<form method="POST" action="?/demo">
					<input type="hidden" name="role" value="member" />
					<input type="hidden" name="next" value={data.next} />
					<button
						type="submit"
						class="min-h-12 cursor-pointer rounded-xl bg-stone-900 px-5 py-3 text-base font-bold text-white hover:bg-stone-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
					>
						Enter as Demo Member
					</button>
				</form>
				<form method="POST" action="?/demo">
					<input type="hidden" name="role" value="admin" />
					<input type="hidden" name="next" value={data.next} />
					<button
						type="submit"
						class="min-h-12 cursor-pointer rounded-xl border-2 border-stone-900 bg-white px-5 py-3 text-base font-bold text-stone-950 hover:bg-stone-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
					>
						Enter as Demo Admin
					</button>
				</form>
			</div>
		</section>
	{/if}

	<div class="grid gap-6 md:grid-cols-2">
		<section class="rounded-2xl border-2 border-stone-800 bg-white p-6">
			<h2 class="text-xl font-bold text-stone-950">Club Member Access</h2>
			<p class="mt-1 text-base text-stone-700">
				Enter your name (optional) and the PSARA club passcode.
			</p>

			{#if form?.memberError}
				<p
					role="alert"
					class="mt-3 rounded-lg border-2 border-red-800 bg-red-50 p-3 text-base font-semibold text-red-900"
				>
					{form.memberError}
				</p>
			{/if}

			<form method="POST" action="?/member" class="mt-4 space-y-4">
				<input type="hidden" name="next" value={data.next} />
				<div>
					<label for="memberName" class="block text-base font-bold text-stone-900">
						Your Name (for pull sheets)
					</label>
					<input
						id="memberName"
						name="memberName"
						type="text"
						autocomplete="name"
						placeholder="e.g., Robert W."
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-4 py-2 text-lg text-stone-950 focus:border-amber-800 focus:outline-none"
					/>
				</div>

				<div>
					<label for="passcode" class="block text-base font-bold text-stone-900">
						Club Access Code
					</label>
					<input
						id="passcode"
						name="passcode"
						type="password"
						required
						placeholder="Enter club code"
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-4 py-2 text-lg text-stone-950 focus:border-amber-800 focus:outline-none"
					/>
				</div>

				<button
					type="submit"
					disabled={!data.hasPasscode}
					class="min-h-12 w-full cursor-pointer rounded-xl bg-amber-800 px-5 py-3 text-lg font-bold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:bg-stone-400"
				>
					Enter Club Workbench
				</button>
			</form>
		</section>

		<section class="rounded-2xl border-2 border-stone-800 bg-white p-6">
			<h2 class="text-xl font-bold text-stone-950">Curator &amp; Admin Sign In</h2>
			<p class="mt-1 text-base text-stone-700">
				For inventory intake, batch spreadsheet imports, and reference edits.
			</p>

			{#if form?.adminError}
				<p
					role="alert"
					class="mt-3 rounded-lg border-2 border-red-800 bg-red-50 p-3 text-base font-semibold text-red-900"
				>
					{form.adminError}
				</p>
			{/if}

			<form method="POST" action="?/admin" class="mt-4 space-y-4">
				<input type="hidden" name="next" value={data.next} />
				<div>
					<label for="username" class="block text-base font-bold text-stone-900">
						Username
					</label>
					<input
						id="username"
						name="username"
						type="text"
						required
						autocomplete="username"
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-4 py-2 text-lg text-stone-950 focus:border-amber-800 focus:outline-none"
					/>
				</div>

				<div>
					<label for="password" class="block text-base font-bold text-stone-900">
						Password
					</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						autocomplete="current-password"
						class="mt-1 min-h-12 w-full rounded-xl border-2 border-stone-700 bg-white px-4 py-2 text-lg text-stone-950 focus:border-amber-800 focus:outline-none"
					/>
				</div>

				<button
					type="submit"
					class="min-h-12 w-full cursor-pointer rounded-xl border-2 border-stone-900 bg-stone-900 px-5 py-3 text-lg font-bold text-white hover:bg-stone-700"
				>
					Admin Sign In
				</button>
			</form>
		</section>
	</div>
</div>
