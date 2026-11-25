import { json } from '@sveltejs/kit';
import { removePullLineItem } from '$lib/server/pullSheets';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'member';
	const itemId = Number(params.itemId);

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return json({ error: 'Invalid pull item ID' }, { status: 400 });
	}

	try {
		await removePullLineItem({ itemId, actor });
		return json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to remove item';
		return json({ error: message }, { status: 400 });
	}
};
