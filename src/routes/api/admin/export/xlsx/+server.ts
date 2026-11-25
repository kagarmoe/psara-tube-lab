import { isAdminOrCurator } from '$lib/server/auth';
import { buildPsaraWorkbookExport } from '$lib/server/exportWorkbook';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!isAdminOrCurator(locals.session)) {
		return new Response('Admin access required', { status: 403 });
	}

	const buffer = await buildPsaraWorkbookExport();
	const dateSlug = new Date().toISOString().slice(0, 10);

	return new Response(new Uint8Array(buffer), {
		status: 200,
		headers: {
			'content-type':
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="PSARA_Tube_Inventory_${dateSlug}.xlsx"`
		}
	});
};
