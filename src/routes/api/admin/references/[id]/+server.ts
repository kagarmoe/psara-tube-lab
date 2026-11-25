import { json } from '@sveltejs/kit';
import { updateTubeReferenceCurator } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const reference = await updateTubeReferenceCurator({
			tubeRefId: params.id,
			...body,
			actor
		});
		return json({ reference });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Reference update failed';
		return json({ error: message }, { status: 400 });
	}
};
