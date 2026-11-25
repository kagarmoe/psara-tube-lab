import { error } from '@sveltejs/kit';
import { getTubeDetail } from '$lib/server/tubes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const detail = await getTubeDetail(params.id);
	if (!detail) {
		throw error(404, `Tube reference "${params.id}" was not found or is held in review.`);
	}
	return { detail };
};
