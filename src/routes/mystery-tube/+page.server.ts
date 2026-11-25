import {
	findMysteryCandidates,
	getMysteryHelperBootstrapData
} from '$lib/server/mystery';
import { getServerVisionCapabilities } from '$lib/server/vision';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [bootstrap, initialCandidates] = await Promise.all([
		getMysteryHelperBootstrapData(),
		findMysteryCandidates({ inStockOnly: true }, 24)
	]);

	return {
		...bootstrap,
		initialMatches: initialCandidates.matches,
		totalEvaluated: initialCandidates.totalEvaluated,
		vision: getServerVisionCapabilities(),
		defaultObserverName: locals.session?.displayName ?? 'PSARA Member'
	};
};
