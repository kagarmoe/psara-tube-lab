import { fail, redirect } from '@sveltejs/kit';
import {
	authenticateAccount,
	getMemberAccessCode,
	isDemoModeEnabled,
	isHttpsRequest,
	setSessionCookie,
	verifySharedPasscode
} from '$lib/server/auth';
import { demoSwitchRedirect, safeRedirectPath } from '$lib/shared/demo-guard';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	return {
		demoMode: locals.demoMode,
		hasPasscode: Boolean(getMemberAccessCode()),
		session: locals.session,
		next: url.searchParams.get('next') ?? '/'
	};
};

export const actions: Actions = {
	member: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const code = String(data.get('passcode') ?? '');
		const memberName = String(data.get('memberName') ?? '').trim();
		const next = String(data.get('next') ?? '/');

		if (!verifySharedPasscode(code)) {
			return fail(400, {
				memberError: 'That club access code did not match. Please double-check with a club officer.'
			});
		}

		setSessionCookie(
			cookies,
			{
				username: memberName ? `member:${memberName.toLowerCase().replace(/\s+/g, '-')}` : 'club-member',
				displayName: memberName || 'PSARA Member',
				role: 'member',
				authMethod: 'passcode'
			},
			isHttpsRequest(request, url)
		);

		throw redirect(303, safeRedirectPath(next));
	},

	admin: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');
		const next = String(data.get('next') ?? '/');

		const user = await authenticateAccount(username, password);
		if (!user) {
			return fail(400, {
				adminError: 'Username or password was not recognized.'
			});
		}

		setSessionCookie(cookies, user, isHttpsRequest(request, url));
		throw redirect(303, safeRedirectPath(next));
	},

	demo: async ({ request, cookies, url }) => {
		if (!isDemoModeEnabled()) {
			return fail(403, { demoError: 'Demo mode is disabled on this deployment.' });
		}
		const data = await request.formData();
		const role = String(data.get('role') ?? 'member') === 'admin' ? 'admin' : 'member';
		const next = String(data.get('next') ?? '/');

		setSessionCookie(
			cookies,
			{
				username: role === 'admin' ? 'demo-admin' : 'demo-member',
				displayName: role === 'admin' ? 'Demo Admin' : 'Demo Club Member',
				role,
				authMethod: 'demo'
			},
			isHttpsRequest(request, url)
		);

		throw redirect(303, demoSwitchRedirect(role, next));
	}
};
