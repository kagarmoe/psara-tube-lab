import { json } from '@sveltejs/kit';
import { updateLotCurator } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const lotId = Number(params.id);
	if (!Number.isInteger(lotId) || lotId <= 0) {
		return json({ error: 'Invalid lot ID' }, { status: 400 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const lot = await updateLotCurator({
			lotId,
			quantity:
				body?.quantity !== undefined
					? body.quantity === null || body.quantity === ''
						? null
						: Number(body.quantity)
					: undefined,
			quantityUnknown: body?.quantityUnknown,
			tubeRefId: body?.tubeRefId,
			boxNo: body?.boxNo,
			boxLayer: body?.boxLayer,
			stockCondition: body?.stockCondition,
			testStatus: body?.testStatus,
			comment: body?.comment,
			actor
		});
		return json({ lot });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Lot update failed';
		return json({ error: message }, { status: 400 });
	}
};
