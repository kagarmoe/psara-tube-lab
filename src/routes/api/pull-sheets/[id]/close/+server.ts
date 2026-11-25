import { json } from '@sveltejs/kit';
import { closePullRequest } from '$lib/server/pullSheets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'member';
	const pullRequestId = Number(params.id);

	if (!Number.isInteger(pullRequestId) || pullRequestId <= 0) {
		return json({ error: 'Invalid pull sheet ID' }, { status: 400 });
	}

	try {
		const updated = await closePullRequest({ pullRequestId, actor });
		return json({ sheet: updated });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unable to close pull sheet';
		return json({ error: message }, { status: 400 });
	}
};
