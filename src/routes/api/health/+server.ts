import { json } from '@sveltejs/kit';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getTableCounts } from '$lib/server/db/seed';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(drizzleSql`SELECT 1`);
		const counts = await getTableCounts();
		return json({
			ok: true,
			db: 'connected',
			counts
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Database connection error';
		return json(
			{
				ok: false,
				db: 'error',
				error: message
			},
			{ status: 503 }
		);
	}
};
