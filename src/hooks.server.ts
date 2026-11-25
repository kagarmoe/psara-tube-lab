import { redirect, type Handle } from '@sveltejs/kit';
import {
	getSessionFromCookies,
	isAdminOrCurator,
	isDemoModeEnabled
} from '$lib/server/auth';
import { DEMO_READ_ONLY_MESSAGE, isDemoAdminApiBlocked } from '$lib/shared/demo-guard';

const PUBLIC_PATHS = ['/login', '/api/health', '/api/auth/logout', '/api/auth/demo-switch'];

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
		return true;
	}
	return pathname.startsWith('/assets/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const demoMode = isDemoModeEnabled();
	const session = getSessionFromCookies(event.cookies);

	event.locals.demoMode = demoMode;
	event.locals.session = session;

	const { pathname } = event.url;

	if (!isPublicPath(pathname)) {
		if (!session) {
			if (pathname.startsWith('/api/')) {
				return new Response(JSON.stringify({ error: 'Authentication required' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
				});
			}
			const next = pathname + event.url.search;
			throw redirect(303, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
		}

		if (
			(pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) &&
			!isAdminOrCurator(session)
		) {
			if (pathname.startsWith('/api/')) {
				return new Response(JSON.stringify({ error: 'Admin access required' }), {
					status: 403,
					headers: { 'content-type': 'application/json' }
				});
			}
			throw redirect(303, '/?notice=admin-required');
		}

		if (isDemoAdminApiBlocked(session, pathname)) {
			return new Response(JSON.stringify({ error: DEMO_READ_ONLY_MESSAGE }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	return resolve(event);
};
