import { redirect } from '@sveltejs/kit';
import { getAdminWorkbenchData } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		throw redirect(303, '/?notice=admin-required');
	}
	const adminData = await getAdminWorkbenchData();
	return { adminData };
};
