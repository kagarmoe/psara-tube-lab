import { json } from '@sveltejs/kit';
import { createRelationshipCurator } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const body = await request.json().catch(() => ({}));

	try {
		const relationship = await createRelationshipCurator({
			designation: String(body?.designation ?? ''),
			relatedDesignation: String(body?.relatedDesignation ?? ''),
			relationship: String(body?.relationship ?? ''),
			direction: String(body?.direction ?? ''),
			differenceType: body?.differenceType ? String(body.differenceType) : null,
			qualificationNotes: body?.qualificationNotes ? String(body.qualificationNotes) : null,
			source: body?.source ? String(body.source) : null,
			sourcePage: body?.sourcePage ? String(body.sourcePage) : null,
			verificationStatus: body?.verificationStatus ? String(body.verificationStatus) : null,
			actor
		});
		return json({ relationship }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to create relationship';
		return json({ error: message }, { status: 400 });
	}
};
