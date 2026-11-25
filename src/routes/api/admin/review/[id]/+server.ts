import { json } from '@sveltejs/kit';
import { resolveReviewItem } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return json({ error: 'Invalid review item ID' }, { status: 400 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const item = await resolveReviewItem({
			id,
			status: String(body?.status ?? 'Resolved'),
			resolutionNotes: body?.resolutionNotes ? String(body.resolutionNotes) : null,
			actor
		});
		return json({ item });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Update failed';
		return json({ error: message }, { status: 400 });
	}
};
