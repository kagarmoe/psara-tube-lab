import { json } from '@sveltejs/kit';
import { addLocationOrLayerCurator } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const created = await addLocationOrLayerCurator({
			kind: body?.kind === 'box_layer' ? 'box_layer' : 'location',
			locationCode: body?.locationCode,
			locationKind: body?.locationKind,
			description: body?.description,
			box: body?.box,
			layer: body?.layer,
			notes: body?.notes,
			actor
		});
		return json({ created }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to add location';
		return json({ error: message }, { status: 400 });
	}
};
