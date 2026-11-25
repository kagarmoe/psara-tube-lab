import { json } from '@sveltejs/kit';
import { saveMysteryObservation } from '$lib/server/mystery';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'member';
	const body = await request.json().catch(() => ({}));

	const created = await saveMysteryObservation({
		pinCount: typeof body?.pinCount === 'number' ? body.pinCount : null,
		baseType: body?.baseType ? String(body.baseType) : null,
		topCap: body?.topCap ? String(body.topCap) : null,
		envelope: body?.envelope ? String(body.envelope) : null,
		diameterIn: typeof body?.diameterIn === 'number' ? body.diameterIn : null,
		heightIn: typeof body?.heightIn === 'number' ? body.heightIn : null,
		filamentPins: body?.filamentPins ? String(body.filamentPins) : null,
		continuityNotes: body?.continuityNotes ? String(body.continuityNotes) : null,
		functionalElements: Array.isArray(body?.functionalElements) ? body.functionalElements : [],
		matchedTubeRefIds: Array.isArray(body?.matchedTubeRefIds) ? body.matchedTubeRefIds : [],
		photoExtractedJson: body?.photoExtractedJson ?? null,
		observerName: body?.observerName ? String(body.observerName) : actor,
		notes: body?.notes ? String(body.notes) : null,
		actor
	});

	return json({ observation: created }, { status: 201 });
};
