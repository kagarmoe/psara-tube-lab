import { listPullSheets } from '$lib/server/pullSheets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const sheets = await listPullSheets();
	return {
		sheets,
		defaultMemberName: locals.session?.displayName ?? 'PSARA Member'
	};
};
