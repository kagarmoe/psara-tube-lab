import { json } from '@sveltejs/kit';
import { findMysteryCandidates } from '$lib/server/mystery';
import type { MysteryQueryInput } from '$lib/shared/mystery-ranker';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as MysteryQueryInput;

	const pinCount =
		typeof body.pinCount === 'number' && Number.isInteger(body.pinCount) ? body.pinCount : null;
	const diameterIn =
		typeof body.diameterIn === 'number' && Number.isFinite(body.diameterIn)
			? body.diameterIn
			: null;
	const heightIn =
		typeof body.heightIn === 'number' && Number.isFinite(body.heightIn) ? body.heightIn : null;

	const result = await findMysteryCandidates(
		{
			pinCount,
			baseGroup: body.baseGroup ?? null,
			exactBase: body.exactBase ?? null,
			topCap: body.topCap === 'yes' || body.topCap === 'no' ? body.topCap : 'any',
			envelope: body.envelope ?? null,
			diameterIn,
			diameterToleranceIn: body.diameterToleranceIn ?? 0.15,
			heightIn,
			heightToleranceIn: body.heightToleranceIn ?? 0.35,
			heatingMethod: body.heatingMethod ?? 'any',
			heaterVoltage: body.heaterVoltage ?? null,
			functionalElements: Array.isArray(body.functionalElements) ? body.functionalElements : [],
			inStockOnly: Boolean(body.inStockOnly),
			notesKeyword: body.notesKeyword ?? ''
		},
		40
	);

	return json(result);
};
