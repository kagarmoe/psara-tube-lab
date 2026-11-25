import { asc, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	auditLog,
	diagramAssets,
	filamentHeaterOptions,
	functionalElements,
	inventoryLots,
	tubeReferences,
	unmarkedObservations
} from '$lib/server/db/schema';
import { normalizeBasingLookupKey } from '$lib/shared/normalize';
import {
	rankMysteryTubeCandidates,
	type MysteryCandidateMatch,
	type MysteryQueryInput
} from '$lib/shared/mystery-ranker';

export interface MysteryMatchWithDiagrams extends MysteryCandidateMatch {
	basingDiagrams: Array<{
		code: string;
		assetPath: string;
		source: string | null;
		printedPage: string | null;
	}>;
}

export async function getMysteryHelperBootstrapData() {
	const [filOptions, funcElems, envDiagrams, refs, recentObs] = await Promise.all([
		db
			.select()
			.from(filamentHeaterOptions)
			.orderBy(asc(filamentHeaterOptions.baseGroup), asc(filamentHeaterOptions.optionOrder)),
		db.select().from(functionalElements).orderBy(asc(functionalElements.optionOrder)),
		db
			.select()
			.from(diagramAssets)
			.where(eq(diagramAssets.category, 'Envelope'))
			.orderBy(asc(diagramAssets.code)),
		db
			.select({
				base: tubeReferences.base,
				pinCount: tubeReferences.pinCount,
				envelope: tubeReferences.envelope,
				lookupStatus: tubeReferences.lookupStatus
			})
			.from(tubeReferences),
		db
			.select()
			.from(unmarkedObservations)
			.orderBy(desc(unmarkedObservations.createdAt))
			.limit(10)
	]);

	const bases = new Set<string>();
	const pinCounts = new Set<number>();
	const envelopes = new Set<string>();
	for (const r of refs) {
		if (r.lookupStatus === 'Unidentified') continue;
		if (r.base) bases.add(r.base);
		if (r.pinCount !== null) pinCounts.add(r.pinCount);
		if (r.envelope) envelopes.add(r.envelope);
	}

	return {
		filamentHeaterOptions: filOptions,
		functionalElements: funcElems,
		envelopeDiagrams: envDiagrams,
		bases: Array.from(bases).sort((a, b) => a.localeCompare(b)),
		pinCounts: Array.from(pinCounts).sort((a, b) => a - b),
		envelopes: Array.from(envelopes).sort((a, b) => a.localeCompare(b)),
		recentObservations: recentObs.map((o) => ({
			...o,
			createdAt: o.createdAt.toISOString()
		}))
	};
}

export async function findMysteryCandidates(
	query: MysteryQueryInput,
	limit = 30
): Promise<{
	matches: MysteryMatchWithDiagrams[];
	totalEvaluated: number;
}> {
	const [refs, lots, basingAssets] = await Promise.all([
		db.select().from(tubeReferences),
		db
			.select({
				tubeRefId: inventoryLots.tubeRefId,
				quantity: inventoryLots.quantity,
				quantityUnknown: inventoryLots.quantityUnknown
			})
			.from(inventoryLots),
		db.select().from(diagramAssets).where(eq(diagramAssets.category, 'Basing'))
	]);

	const stockMap = new Map<string, { qty: number; hasUnknown: boolean }>();
	for (const lot of lots) {
		if (!lot.tubeRefId) continue;
		const cur = stockMap.get(lot.tubeRefId) ?? { qty: 0, hasUnknown: false };
		cur.qty += lot.quantity ?? 0;
		if (lot.quantityUnknown) cur.hasUnknown = true;
		stockMap.set(lot.tubeRefId, cur);
	}

	const inputs = refs.map((r) => {
		const st = stockMap.get(r.tubeRefId);
		return {
			tubeRefId: r.tubeRefId,
			referenceDesignation: r.referenceDesignation,
			lookupStatus: r.lookupStatus,
			tubeFamily: r.tubeFamily,
			internalStructure: r.internalStructure,
			generalFunction: r.generalFunction,
			base: r.base,
			pinCount: r.pinCount,
			basingCode: r.basingCode,
			basingCodes: r.basingCodes ?? [],
			envelope: r.envelope,
			cap: r.cap,
			heaterVoltage: r.heaterVoltage,
			heaterCurrent: r.heaterCurrent,
			heatingMethod: r.heatingMethod,
			maxDiameterIn: r.maxDiameterIn,
			maxSeatedHeightIn: r.maxSeatedHeightIn,
			maxOverallHeightIn: r.maxOverallHeightIn,
			technicalNotes: r.technicalNotes,
			totalQty: st?.qty ?? 0,
			hasUnknownQty: st?.hasUnknown ?? false
		};
	});

	const ranked = rankMysteryTubeCandidates(inputs, query, limit);

	const assetByKey = new Map<string, typeof basingAssets>();
	for (const asset of basingAssets) {
		const arr = assetByKey.get(asset.lookupKey) ?? [];
		arr.push(asset);
		assetByKey.set(asset.lookupKey, arr);
	}

	const matches: MysteryMatchWithDiagrams[] = ranked.map((m) => {
		const diagrams: MysteryMatchWithDiagrams['basingDiagrams'] = [];
		const seen = new Set<string>();
		for (const code of m.basingCodes) {
			const key = normalizeBasingLookupKey(code);
			for (const asset of assetByKey.get(key) ?? []) {
				if (seen.has(asset.assetPath)) continue;
				seen.add(asset.assetPath);
				diagrams.push({
					code: asset.code,
					assetPath: asset.assetPath,
					source: asset.source,
					printedPage: asset.printedPage
				});
			}
		}
		return {
			...m,
			basingDiagrams: diagrams
		};
	});

	return {
		matches,
		totalEvaluated: inputs.filter((i) => i.lookupStatus !== 'Unidentified').length
	};
}

export async function saveMysteryObservation(params: {
	pinCount?: number | null;
	baseType?: string | null;
	topCap?: string | null;
	envelope?: string | null;
	diameterIn?: number | null;
	heightIn?: number | null;
	filamentPins?: string | null;
	continuityNotes?: string | null;
	functionalElements: string[];
	matchedTubeRefIds: string[];
	photoExtractedJson?: Record<string, unknown> | null;
	observerName?: string | null;
	notes?: string | null;
	actor: string;
}) {
	const [created] = await db
		.insert(unmarkedObservations)
		.values({
			pinCount: params.pinCount ?? null,
			baseType: params.baseType ?? null,
			topCap: params.topCap ?? null,
			envelope: params.envelope ?? null,
			diameterIn: params.diameterIn ?? null,
			heightIn: params.heightIn ?? null,
			filamentPins: params.filamentPins ?? null,
			continuityNotes: params.continuityNotes ?? null,
			functionalElementsJson: params.functionalElements,
			matchedTubeRefIds: params.matchedTubeRefIds,
			photoExtractedJson: params.photoExtractedJson ?? null,
			observerName: params.observerName?.trim() || params.actor,
			notes: params.notes?.trim() || null
		})
		.returning();

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'mystery_observation_saved',
		entityType: 'unmarked_observation',
		entityId: String(created.id),
		details: {
			pinCount: created.pinCount,
			baseType: created.baseType,
			matchedCount: params.matchedTubeRefIds.length
		}
	});

	return {
		...created,
		createdAt: created.createdAt.toISOString()
	};
}
