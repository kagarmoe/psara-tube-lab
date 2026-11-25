import { json } from '@sveltejs/kit';
import { getTubeDetail } from '$lib/server/tubes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const detail = await getTubeDetail(params.id);
	if (!detail) {
		return json({ error: 'Tube reference not found or held for review' }, { status: 404 });
	}
	return json(detail);
};
