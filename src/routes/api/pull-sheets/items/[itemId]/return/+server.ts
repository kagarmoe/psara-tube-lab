import { json } from '@sveltejs/kit';
import { returnLineItem } from '$lib/server/pullSheets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'member';
	const itemId = Number(params.itemId);
	const body = await request.json().catch(() => ({}));

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return json({ error: 'Invalid pull item ID' }, { status: 400 });
	}

	try {
		const result = await returnLineItem({
			itemId,
			qtyToReturn: Number(body?.qtyToReturn ?? 0),
			updatedTestStatus: body?.updatedTestStatus ? String(body.updatedTestStatus) : null,
			updatedStockCondition: body?.updatedStockCondition
				? String(body.updatedStockCondition)
				: null,
			notes: body?.notes ? String(body.notes) : null,
			actor
		});
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Return failed';
		return json({ error: message }, { status: 400 });
	}
};
