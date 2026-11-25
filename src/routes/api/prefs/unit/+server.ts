import { json } from '@sveltejs/kit';
import { UNIT_COOKIE_NAME } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const unit = body?.unit === 'mm' ? 'mm' : 'in';

	cookies.set(UNIT_COOKIE_NAME, unit, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});

	return json({ unit });
};
