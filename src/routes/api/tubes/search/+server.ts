import { json } from '@sveltejs/kit';
import { searchTubes } from '$lib/server/tubes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const inStockOnly = url.searchParams.get('inStockOnly') === 'true';
	const base = url.searchParams.get('base') ?? '';
	const pinCountRaw = url.searchParams.get('pinCount');
	const pinCount = pinCountRaw && /^\d+$/.test(pinCountRaw) ? Number(pinCountRaw) : null;
	const boxNo = url.searchParams.get('boxNo') ?? '';
	const testStatus = url.searchParams.get('testStatus') ?? '';
	const limitRaw = url.searchParams.get('limit');
	const offsetRaw = url.searchParams.get('offset');
	const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 60;
	const offset = offsetRaw && /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : 0;

	const data = await searchTubes({
		q,
		inStockOnly,
		base,
		pinCount,
		boxNo,
		testStatus,
		limit,
		offset
	});

	return json(data);
};
