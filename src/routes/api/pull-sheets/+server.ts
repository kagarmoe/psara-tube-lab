import { json } from '@sveltejs/kit';
import {
	addLotToPullSheet,
	createEmptyPullSheet,
	listPullSheets
} from '$lib/server/pullSheets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const status = url.searchParams.get('status') ?? undefined;
	const sheets = await listPullSheets(status || undefined);
	return json({ sheets });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'member';
	const body = await request.json().catch(() => ({}));

	try {
		if (body?.lotId) {
			const result = await addLotToPullSheet({
				pullRequestId: body.pullRequestId ? Number(body.pullRequestId) : null,
				memberName: String(body.memberName ?? locals.session?.displayName ?? 'PSARA Member'),
				purpose: body.purpose ? String(body.purpose) : null,
				lotId: Number(body.lotId),
				qtyRequested: Number(body.qtyRequested ?? 1),
				notes: body.notes ? String(body.notes) : null,
				actor
			});
			return json(result, { status: 201 });
		}

		const created = await createEmptyPullSheet({
			memberName: String(body?.memberName ?? locals.session?.displayName ?? 'PSARA Member'),
			purpose: body?.purpose ? String(body.purpose) : null,
			actor
		});
		return json({ sheet: created }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to update pull sheet';
		return json({ error: message }, { status: 400 });
	}
};
