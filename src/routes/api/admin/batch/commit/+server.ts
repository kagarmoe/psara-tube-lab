import { json } from '@sveltejs/kit';
import { commitBatchReadyRows } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const result = await commitBatchReadyRows({
			batchId: body?.batchId ? Number(body.batchId) : undefined,
			actor
		});
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Commit failed';
		return json({ error: message }, { status: 400 });
	}
};
