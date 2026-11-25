import { UNIT_COOKIE_NAME } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const unitCookie = cookies.get(UNIT_COOKIE_NAME);
	return {
		session: locals.session,
		demoMode: locals.demoMode,
		unit: unitCookie === 'mm' ? ('mm' as const) : ('in' as const)
	};
};
