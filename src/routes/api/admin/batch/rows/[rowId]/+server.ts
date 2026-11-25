import { json } from '@sveltejs/kit';
import { updateStagedBatchRow } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const rowId = Number(params.rowId);
	if (!Number.isInteger(rowId) || rowId <= 0) {
		return json({ error: 'Invalid row ID' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	try {
		const updated = await updateStagedBatchRow({
			rowId,
			importTube: body?.importTube,
			importQty:
				body?.importQty !== undefined
					? body.importQty === null || body.importQty === ''
						? null
						: Number(body.importQty)
					: undefined,
			importBox: body?.importBox,
			importLayer: body?.importLayer,
			importStock: body?.importStock,
			importTest: body?.importTest,
			importEnvelope: body?.importEnvelope,
			reviewed: body?.reviewed,
			selectedTubeRefId: body?.selectedTubeRefId
		});
		return json({ row: updated });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to update staged row';
		return json({ error: message }, { status: 400 });
	}
};
