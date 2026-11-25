import { json } from '@sveltejs/kit';
import { submitSingleIntake } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const result = await submitSingleIntake({
			mode: body?.mode === 'new_ref' ? 'new_ref' : 'existing',
			selectedTubeRefId: body?.selectedTubeRefId ? String(body.selectedTubeRefId) : null,
			promoteIfUnidentified: Boolean(body?.promoteIfUnidentified),
			newReference: body?.newReference,
			observedDesignation: body?.observedDesignation ? String(body.observedDesignation) : null,
			quantity: Number(body?.quantity ?? 0),
			location: String(body?.location ?? ''),
			layer: body?.layer ? String(body.layer) : null,
			stockCondition: String(body?.stockCondition ?? 'Unknown'),
			testStatus: String(body?.testStatus ?? 'Untested'),
			envelope: body?.envelope ? String(body.envelope) : null,
			base: body?.base ? String(body.base) : null,
			cap: body?.cap ? String(body.cap) : null,
			basingCode: body?.basingCode ? String(body.basingCode) : null,
			rcaOutline: body?.rcaOutline ? String(body.rcaOutline) : null,
			diameterIn: typeof body?.diameterIn === 'number' ? body.diameterIn : null,
			heightIn: typeof body?.heightIn === 'number' ? body.heightIn : null,
			notes: body?.notes ? String(body.notes) : null,
			source: body?.source ? String(body.source) : null,
			sourcePage: body?.sourcePage ? String(body.sourcePage) : null,
			applyReferenceUpdates: Boolean(body?.applyReferenceUpdates),
			actor
		});
		return json(result, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Intake failed';
		return json({ error: message }, { status: 400 });
	}
};
