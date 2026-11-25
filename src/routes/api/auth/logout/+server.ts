import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, isDemoModeEnabled } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSessionCookie(cookies);
	throw redirect(303, isDemoModeEnabled() ? '/?notice=signed-out' : '/login');
};
