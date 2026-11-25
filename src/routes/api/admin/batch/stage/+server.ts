import { json } from '@sveltejs/kit';
import { stageBatchSpreadsheet } from '$lib/server/admin';
import { isAdminOrCurator } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}
	const actor = locals.session?.displayName ?? locals.session?.username ?? 'admin';
	const contentType = request.headers.get('content-type') ?? '';

	try {
		if (contentType.includes('multipart/form-data')) {
			const form = await request.formData();
			const file = form.get('file');
			const batchName = String(form.get('batchName') ?? '').trim();
			const pastedCsv = String(form.get('csvText') ?? '').trim();

			if (file && file instanceof File && file.size > 0) {
				const buf = new Uint8Array(await file.arrayBuffer());
				const result = await stageBatchSpreadsheet({
					batchName: batchName || file.name,
					fileName: file.name,
					buffer: buf,
					actor
				});
				return json(result, { status: 201 });
			}
			if (pastedCsv) {
				const result = await stageBatchSpreadsheet({
					batchName: batchName || 'Pasted Batch CSV',
					fileName: `${batchName || 'pasted-batch'}.csv`,
					csvText: pastedCsv,
					actor
				});
				return json(result, { status: 201 });
			}
			return json({ error: 'Select a .xlsx/.csv file or paste CSV rows.' }, { status: 400 });
		}

		const body = await request.json().catch(() => ({}));
		const result = await stageBatchSpreadsheet({
			batchName: String(body?.batchName ?? 'Pasted Batch CSV'),
			fileName: String(body?.fileName ?? 'pasted-batch.csv'),
			csvText: String(body?.csvText ?? ''),
			actor
		});
		return json(result, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Batch staging failed';
		return json({ error: message }, { status: 400 });
	}
};
