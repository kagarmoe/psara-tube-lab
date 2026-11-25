import { json, redirect } from '@sveltejs/kit';
import { isDemoModeEnabled, isHttpsRequest, setSessionCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	if (!isDemoModeEnabled()) {
		return json({ error: 'Demo mode is disabled' }, { status: 403 });
	}

	const form = await request.formData();
	const roleRaw = String(form.get('role') ?? 'member');
	const redirectTo = String(form.get('redirectTo') ?? '/');
	const role = roleRaw === 'admin' ? 'admin' : 'member';

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

	const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/';
	throw redirect(303, safeRedirect);
};
