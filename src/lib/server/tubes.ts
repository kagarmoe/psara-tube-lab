import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	diagramAssets,
	inventoryLots,
	relationships,
	tubeReferences
} from '$lib/server/db/schema';
import { normalizeBasingLookupKey, normalizeDesignationKey } from '$lib/shared/normalize';
import {
	classifyDirectMatchTier,
	classifyRelationshipView,
	isNavigableSubstituteEdge,
	normalizeEnvelopeShapeKey,
	type ClassifiedRelationship,
	type MatchTier
} from '$lib/shared/tube-logic';

export interface SearchFilterOptions {
	bases: string[];
	pinCounts: number[];
	boxes: string[];
	families: string[];
}

export interface SearchTubeSummary {
	tubeRefId: string;
	referenceDesignation: string;
	tubeFamily: string | null;
	internalStructure: string | null;
	generalFunction: string | null;
	base: string | null;
	pinCount: number | null;
	basingCode: string | null;
	basingCodes: string[];
	envelope: string | null;
	cap: string | null;
	heaterVoltage: string | null;
	heaterCurrent: string | null;
	totalQty: number;
	lotCount: number;
	hasUnknownQty: boolean;
	testedQty: number;
	boxes: string[];
	matchTier: MatchTier | null;
	matchReason: string | null;
}

export interface SearchTubesResponse {
	items: SearchTubeSummary[];
	totalMatched: number;
	quarantinedMatchHidden: boolean;
}

export interface TubeDetailResponse {
	reference: typeof tubeReferences.$inferSelect;
	lots: Array<typeof inventoryLots.$inferSelect>;
	stockSummary: {
		totalKnownQty: number;
		lotCount: number;
		hasUnknownQty: boolean;
		testedQty: number;
		untestedQty: number;
		nosQty: number;
		usedQty: number;
		boxes: string[];
	};
	basingDiagrams: Array<typeof diagramAssets.$inferSelect>;
	envelopeDiagrams: Array<typeof diagramAssets.$inferSelect>;
	relationships: Array<
		ClassifiedRelationship & {
			peerInStockQty: number;
			peerLotCount: number;
			peerHasUnknownQty: boolean;
		}
	>;
}

interface StockAggregate {
	totalQty: number;
	lotCount: number;
	hasUnknownQty: boolean;
	testedQty: number;
	boxes: Set<string>;
	lotComments: string[];
	lotTubeNumbers: string[];
	testStatuses: Set<string>;
}

async function loadAggregatedStock(): Promise<Map<string, StockAggregate>> {
	const allLots = await db.select().from(inventoryLots);
	const map = new Map<string, StockAggregate>();

	for (const lot of allLots) {
		if (!lot.tubeRefId) continue;
		let agg = map.get(lot.tubeRefId);
		if (!agg) {
			agg = {
				totalQty: 0,
				lotCount: 0,
				hasUnknownQty: false,
				testedQty: 0,
				boxes: new Set(),
				lotComments: [],
				lotTubeNumbers: [],
				testStatuses: new Set()
			};
			map.set(lot.tubeRefId, agg);
		}
		agg.lotCount += 1;
		if (lot.quantityUnknown) {
			agg.hasUnknownQty = true;
		}
		const qty = lot.quantity ?? 0;
		agg.totalQty += qty;
		if (lot.testStatus === 'Tested' || lot.testStatus === 'Good') {
			agg.testedQty += qty;
		}
		if (lot.boxNo) agg.boxes.add(lot.boxNo);
		if (lot.comment) agg.lotComments.push(lot.comment);
		if (lot.tubeNumber) agg.lotTubeNumbers.push(lot.tubeNumber);
		if (lot.testStatus) agg.testStatuses.add(lot.testStatus);
	}

	return map;
}

export async function getSearchFilterOptions(): Promise<SearchFilterOptions> {
	const [refs, lots] = await Promise.all([
		db
			.select({
				base: tubeReferences.base,
				pinCount: tubeReferences.pinCount,
				tubeFamily: tubeReferences.tubeFamily,
				lookupStatus: tubeReferences.lookupStatus
			})
			.from(tubeReferences),
		db.select({ boxNo: inventoryLots.boxNo }).from(inventoryLots)
	]);

	const bases = new Set<string>();
	const pinCounts = new Set<number>();
	const families = new Set<string>();
	for (const r of refs) {
		if (r.lookupStatus === 'Unidentified') continue;
		if (r.base) bases.add(r.base);
		if (r.pinCount !== null) pinCounts.add(r.pinCount);
		if (r.tubeFamily) families.add(r.tubeFamily);
	}

	const boxes = new Set<string>();
	for (const l of lots) {
		if (l.boxNo) boxes.add(l.boxNo);
	}

	return {
		bases: Array.from(bases).sort((a, b) => a.localeCompare(b)),
		pinCounts: Array.from(pinCounts).sort((a, b) => a - b),
		boxes: Array.from(boxes).sort((a, b) =>
			a.localeCompare(b, undefined, { numeric: true })
		),
		families: Array.from(families).sort((a, b) => a.localeCompare(b))
	};
}

export async function searchTubes(params: {
	q?: string;
	inStockOnly?: boolean;
	base?: string;
	pinCount?: number | null;
	boxNo?: string;
	testStatus?: string;
	limit?: number;
	offset?: number;
}): Promise<SearchTubesResponse> {
	const query = (params.q ?? '').trim();
	const inStockOnly = Boolean(params.inStockOnly);
	const baseFilter = (params.base ?? '').trim();
	const pinCountFilter = params.pinCount ?? null;
	const boxFilter = (params.boxNo ?? '').trim();
	const testFilter = (params.testStatus ?? '').trim();
	const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
	const offset = Math.max(params.offset ?? 0, 0);

	const [allRefs, stockMap, allRels] = await Promise.all([
		db.select().from(tubeReferences).orderBy(asc(tubeReferences.referenceDesignation)),
		loadAggregatedStock(),
		query ? db.select().from(relationships) : Promise.resolve([])
	]);

	const activeRefs = allRefs.filter((r) => r.lookupStatus !== 'Unidentified');
	const quarantinedMatchHidden =
		query.length > 0 &&
		allRefs.some(
			(r) =>
				r.lookupStatus === 'Unidentified' &&
				(r.normalizedKey === normalizeDesignationKey(query) ||
					r.tubeRefId.toUpperCase() === query.toUpperCase())
		);

	// Step 1: Score direct matches when a query string is given
	const scored = new Map<string, { tier: MatchTier | null; reason: string | null }>();
	const tier1Or2Refs: typeof activeRefs = [];

	if (query) {
		for (const ref of activeRefs) {
			const agg = stockMap.get(ref.tubeRefId);
			const tier = classifyDirectMatchTier(query, {
				tubeRefId: ref.tubeRefId,
				referenceDesignation: ref.referenceDesignation,
				normalizedKey: ref.normalizedKey,
				lookupStatus: ref.lookupStatus,
				tubeFamily: ref.tubeFamily,
				internalStructure: ref.internalStructure,
				generalFunction: ref.generalFunction,
				base: ref.base,
				envelope: ref.envelope,
				basingCode: ref.basingCode,
				technicalNotes: ref.technicalNotes,
				lotComments: agg?.lotComments,
				lotTubeNumbers: agg?.lotTubeNumbers
			});
			if (tier !== null) {
				const reason =
					tier === 1
						? 'Exact match'
						: tier === 2
							? 'Designation prefix'
							: 'Notes / family keyword';
				scored.set(ref.tubeRefId, { tier, reason });
				if (tier === 1 || tier === 2) {
					tier1Or2Refs.push(ref);
				}
			}
		}

		// Step 2: Expand Tier 3 substitute / interchangeable peers from Tier 1 & 2 hits
		for (const hit of tier1Or2Refs) {
			for (const rel of allRels) {
				const nav = isNavigableSubstituteEdge(
					rel,
					hit.tubeRefId,
					hit.referenceDesignation
				);
				if (nav?.peerTubeRefId && !scored.has(nav.peerTubeRefId)) {
					const targetExists = activeRefs.some((r) => r.tubeRefId === nav.peerTubeRefId);
					if (targetExists) {
						scored.set(nav.peerTubeRefId, { tier: 3, reason: nav.reason });
					}
				}
			}
		}
	}

	// Step 3: Apply structural/stock filters and assemble summaries
	const results: SearchTubeSummary[] = [];
	for (const ref of activeRefs) {
		const score = query ? scored.get(ref.tubeRefId) : { tier: null, reason: null };
		if (query && !score) continue;

		const agg = stockMap.get(ref.tubeRefId);
		const totalQty = agg?.totalQty ?? 0;
		const lotCount = agg?.lotCount ?? 0;
		const hasUnknownQty = agg?.hasUnknownQty ?? false;
		const boxes = agg
			? Array.from(agg.boxes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			: [];

		if (inStockOnly && totalQty <= 0 && !hasUnknownQty) continue;
		if (baseFilter && ref.base !== baseFilter) continue;
		if (pinCountFilter !== null && ref.pinCount !== pinCountFilter) continue;
		if (boxFilter && !boxes.includes(boxFilter)) continue;
		if (testFilter && !(agg?.testStatuses.has(testFilter) ?? false)) continue;

		results.push({
			tubeRefId: ref.tubeRefId,
			referenceDesignation: ref.referenceDesignation,
			tubeFamily: ref.tubeFamily,
			internalStructure: ref.internalStructure,
			generalFunction: ref.generalFunction,
			base: ref.base,
			pinCount: ref.pinCount,
			basingCode: ref.basingCode,
			basingCodes: ref.basingCodes ?? [],
			envelope: ref.envelope,
			cap: ref.cap,
			heaterVoltage: ref.heaterVoltage,
			heaterCurrent: ref.heaterCurrent,
			totalQty,
			lotCount,
			hasUnknownQty,
			testedQty: agg?.testedQty ?? 0,
			boxes,
			matchTier: score?.tier ?? null,
			matchReason: score?.reason ?? null
		});
	}

	results.sort((a, b) => {
		const tierA = a.matchTier ?? 99;
		const tierB = b.matchTier ?? 99;
		if (tierA !== tierB) return tierA - tierB;
		if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
		return a.referenceDesignation.localeCompare(b.referenceDesignation, undefined, {
			numeric: true
		});
	});

	return {
		items: results.slice(offset, offset + limit),
		totalMatched: results.length,
		quarantinedMatchHidden
	};
}

export async function getTubeDetail(
	tubeRefId: string,
	options?: { allowUnidentified?: boolean }
): Promise<TubeDetailResponse | null> {
	const cleanId = tubeRefId.trim().toUpperCase();
	const [reference] = await db
		.select()
		.from(tubeReferences)
		.where(eq(tubeReferences.tubeRefId, cleanId))
		.limit(1);

	if (!reference) return null;
	if (reference.lookupStatus === 'Unidentified' && !options?.allowUnidentified) {
		return null;
	}

	const [lots, allDiagrams, allRels, stockMap] = await Promise.all([
		db
			.select()
			.from(inventoryLots)
			.where(eq(inventoryLots.tubeRefId, cleanId))
			.orderBy(asc(inventoryLots.boxNo), asc(inventoryLots.boxLayer), asc(inventoryLots.id)),
		db.select().from(diagramAssets),
		db.select().from(relationships),
		loadAggregatedStock()
	]);

	// Live stock summary
	let totalKnownQty = 0;
	let hasUnknownQty = false;
	let testedQty = 0;
	let untestedQty = 0;
	let nosQty = 0;
	let usedQty = 0;
	const boxSet = new Set<string>();

	for (const lot of lots) {
		const qty = lot.quantity ?? 0;
		if (lot.quantityUnknown) hasUnknownQty = true;
		totalKnownQty += qty;
		if (lot.testStatus === 'Tested' || lot.testStatus === 'Good') testedQty += qty;
		else if (lot.testStatus === 'Untested') untestedQty += qty;
		if (lot.stockCondition === 'NOS') nosQty += qty;
		else if (lot.stockCondition === 'Used') usedQty += qty;
		if (lot.boxNo) boxSet.add(lot.boxNo);
	}

	// Basing diagrams (deduplicated across basingCodes)
	const basingKeys = new Set(
		(reference.basingCodes ?? []).map((code) => normalizeBasingLookupKey(code)).filter(Boolean)
	);
	const basingDiagrams = allDiagrams
		.filter((d) => d.category === 'Basing' && basingKeys.has(d.lookupKey))
		.sort((a, b) => a.code.localeCompare(b.code));

	// Envelope diagrams matching normalized envelope shape (prefer cap match & RCA outline)
	const targetEnvKey = normalizeEnvelopeShapeKey(reference.envelope);
	const tubeCap = (reference.cap ?? 'None').toLowerCase();
	const envelopeDiagrams = targetEnvKey
		? allDiagrams
				.filter(
					(d) =>
						d.category === 'Envelope' &&
						normalizeEnvelopeShapeKey(d.envelopeShape) === targetEnvKey
				)
				.sort((a, b) => {
					const aCapMatch = (a.cap ?? '').toLowerCase() === tubeCap ? 0 : 1;
					const bCapMatch = (b.cap ?? '').toLowerCase() === tubeCap ? 0 : 1;
					if (aCapMatch !== bCapMatch) return aCapMatch - bCapMatch;
					const aRca = a.code.startsWith('TS-') ? 1 : 0;
					const bRca = b.code.startsWith('TS-') ? 1 : 0;
					if (aRca !== bRca) return aRca - bRca;
					return a.code.localeCompare(b.code, undefined, { numeric: true });
				})
				.slice(0, 4)
		: [];

	// Directional relationships
	const classifiedRels: TubeDetailResponse['relationships'] = [];
	for (const rel of allRels) {
		const classified = classifyRelationshipView(
			rel,
			reference.tubeRefId,
			reference.referenceDesignation
		);
		if (!classified) continue;
		const peerAgg = classified.peerTubeRefId ? stockMap.get(classified.peerTubeRefId) : undefined;
		classifiedRels.push({
			...classified,
			peerInStockQty: peerAgg?.totalQty ?? 0,
			peerLotCount: peerAgg?.lotCount ?? 0,
			peerHasUnknownQty: peerAgg?.hasUnknownQty ?? false
		});
	}

	return {
		reference,
		lots,
		stockSummary: {
			totalKnownQty,
			lotCount: lots.length,
			hasUnknownQty,
			testedQty,
			untestedQty,
			nosQty,
			usedQty,
			boxes: Array.from(boxSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		},
		basingDiagrams,
		envelopeDiagrams,
		relationships: classifiedRels
	};
}
