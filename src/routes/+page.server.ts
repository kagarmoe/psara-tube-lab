import type { TubeDetailResponse } from '$lib/server/tubes';
import { getSearchFilterOptions, getTubeDetail, searchTubes } from '$lib/server/tubes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const inStockOnly = url.searchParams.get('inStockOnly') === 'true';
	const base = url.searchParams.get('base') ?? '';
	const pinCountRaw = url.searchParams.get('pinCount');
	const pinCount = pinCountRaw && /^\d+$/.test(pinCountRaw) ? Number(pinCountRaw) : null;
	const boxNo = url.searchParams.get('boxNo') ?? '';
	const testStatus = url.searchParams.get('testStatus') ?? '';
	const selectedId = url.searchParams.get('tube') ?? '';

	const [filterOptions, searchResult] = await Promise.all([
		getSearchFilterOptions(),
		searchTubes({
			q,
			inStockOnly,
			base,
			pinCount,
			boxNo,
			testStatus,
			limit: 60,
			offset: 0
		})
	]);

	let initialDetail: TubeDetailResponse | null = null;
	if (selectedId) {
		initialDetail = await getTubeDetail(selectedId);
	} else if (searchResult.items.length > 0) {
		initialDetail = await getTubeDetail(searchResult.items[0].tubeRefId);
	}

	return {
		filterOptions,
		searchResult,
		initialDetail,
		filters: {
			q,
			inStockOnly,
			base,
			pinCount: pinCountRaw ?? '',
			boxNo,
			testStatus,
			tube: selectedId || (initialDetail?.reference.tubeRefId ?? '')
		},
		notice: url.searchParams.get('notice')
	};
};
