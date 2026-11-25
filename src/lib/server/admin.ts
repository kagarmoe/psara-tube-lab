import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '$lib/server/db';
import {
	acquisitionBatches,
	acquisitionEntries,
	auditLog,
	batchImportRows,
	boxLayers,
	controlledLists,
	diagramAssets,
	inventoryLots,
	locations,
	pullRequests,
	relationships,
	reviewQueue,
	tubeReferences
} from '$lib/server/db/schema';
import {
	computeNextTubeRefId,
	evaluateStagedRowMatch,
	normalizeSpreadsheetMatrix,
	parseDelimitedText
} from '$lib/shared/admin-logic';
import {
	cleanBasingCodes,
	cleanDesignation,
	formatBasingCodeDisplay,
	normalizeBasingLookupKey,
	normalizeDesignationKey,
	normalizeStockCondition,
	normalizeTestStatus,
	parsePinCount
} from '$lib/shared/normalize';
import { normalizeEnvelopeShapeKey } from '$lib/shared/tube-logic';

function generateAcquisitionId(prefix = 'ACQ'): string {
	const d = new Date();
	const stamp =
		`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
			d.getUTCDate()
		).padStart(2, '0')}-` +
		`${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(
			d.getUTCSeconds()
		).padStart(2, '0')}`;
	const rand = Math.floor(100 + Math.random() * 900);
	return `${prefix}-${stamp}-${rand}`;
}

export async function runDiagnostics() {
	const [refs, lots, rels, diagrams, revs, batches, pulls] = await Promise.all([
		db.select().from(tubeReferences),
		db.select().from(inventoryLots),
		db.select().from(relationships),
		db.select().from(diagramAssets),
		db.select().from(reviewQueue),
		db.select().from(batchImportRows),
		db.select().from(pullRequests)
	]);

	const activeRefs = refs.filter((r) => r.lookupStatus !== 'Unidentified');
	const unidentifiedRefs = refs.filter((r) => r.lookupStatus === 'Unidentified');
	const splitCombinedRefs = refs.filter(
		(r) =>
			r.referenceDesignation.includes('/') ||
			(r.referenceStatus ?? '').toLowerCase().includes('combined')
	);

	const unlinkedLots = lots.filter((l) => !l.tubeRefId);
	const unknownQtyLots = lots.filter((l) => l.quantityUnknown);

	const basingAssetKeys = new Set(
		diagrams.filter((d) => d.category === 'Basing').map((d) => d.lookupKey)
	);
	const envAssetKeys = new Set(
		diagrams
			.filter((d) => d.category === 'Envelope' && d.envelopeShape)
			.map((d) => normalizeEnvelopeShapeKey(d.envelopeShape))
	);

	let refsWithMissingBasingPng = 0;
	let refsMissingAnyBasing = 0;
	let refsWithMissingEnvelopePng = 0;

	for (const r of activeRefs) {
		const codes = r.basingCodes ?? [];
		if (codes.length === 0) {
			refsMissingAnyBasing++;
		} else if (!codes.some((c) => basingAssetKeys.has(normalizeBasingLookupKey(c)))) {
			refsWithMissingBasingPng++;
		}
		if (r.envelope) {
			const ek = normalizeEnvelopeShapeKey(r.envelope);
			if (ek && !envAssetKeys.has(ek)) {
				refsWithMissingEnvelopePng++;
			}
		}
	}

	const openReviewCount = revs.filter(
		(r) => r.status !== 'Resolved' && r.status !== 'Dismissed'
	).length;
	const stagedReadyCount = batches.filter((b) => b.importStatus === 'Ready').length;
	const stagedHoldCount = batches.filter((b) => b.importStatus === 'Hold').length;
	const openPullSheetsCount = pulls.filter(
		(p) => p.status === 'Pending' || p.status === 'Pulled'
	).length;

	return {
		totalReferences: refs.length,
		activeReferences: activeRefs.length,
		unidentifiedReferences: unidentifiedRefs.length,
		splitCombinedReferences: splitCombinedRefs.length,
		totalLots: lots.length,
		totalKnownUnits: lots.reduce((sum, l) => sum + (l.quantity ?? 0), 0),
		unlinkedLots: unlinkedLots.length,
		unknownQtyLots: unknownQtyLots.length,
		relationshipsCount: rels.length,
		basingDiagramsCount: diagrams.filter((d) => d.category === 'Basing').length,
		envelopeDiagramsCount: diagrams.filter((d) => d.category === 'Envelope').length,
		refsMissingAnyBasing,
		refsWithMissingBasingPng,
		refsWithMissingEnvelopePng,
		openReviewCount,
		stagedReadyCount,
		stagedHoldCount,
		openPullSheetsCount
	};
}

export async function getAdminWorkbenchData() {
	const [
		listRows,
		locRows,
		boxLayerRows,
		refs,
		lots,
		acqs,
		batches,
		batchRows,
		revs,
		recentAudits,
		diagnostics
	] = await Promise.all([
		db
			.select()
			.from(controlledLists)
			.orderBy(asc(controlledLists.listName), asc(controlledLists.sortOrder)),
		db.select().from(locations).orderBy(asc(locations.locationCode)),
		db.select().from(boxLayers).orderBy(asc(boxLayers.box), asc(boxLayers.layer)),
		db.select().from(tubeReferences).orderBy(asc(tubeReferences.referenceDesignation)),
		db.select().from(inventoryLots).orderBy(asc(inventoryLots.boxNo), asc(inventoryLots.canonicalDesignation)),
		db.select().from(acquisitionEntries).orderBy(desc(acquisitionEntries.entryId)).limit(40),
		db.select().from(acquisitionBatches).orderBy(desc(acquisitionBatches.createdAt)),
		db.select().from(batchImportRows).orderBy(desc(batchImportRows.id)),
		db.select().from(reviewQueue).orderBy(asc(reviewQueue.id)),
		db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(30),
		runDiagnostics()
	]);

	const listsByName: Record<string, string[]> = {};
	for (const row of listRows) {
		const arr = listsByName[row.listName] ?? [];
		arr.push(row.value);
		listsByName[row.listName] = arr;
	}

	const unknownLots = lots.filter((l) => l.quantityUnknown || !l.tubeRefId);
	const splitCombinedRefs = refs.filter(
		(r) =>
			r.referenceDesignation.includes('/') ||
			(r.referenceStatus ?? '').toLowerCase().includes('combined')
	);
	const unidentifiedRefs = refs.filter((r) => r.lookupStatus === 'Unidentified');

	return {
		listsByName,
		locations: locRows,
		boxLayers: boxLayerRows,
		refOptions: refs.map((r) => ({
			tubeRefId: r.tubeRefId,
			referenceDesignation: r.referenceDesignation,
			lookupStatus: r.lookupStatus,
			base: r.base,
			envelope: r.envelope,
			cap: r.cap,
			basingCode: r.basingCode,
			maxDiameterIn: r.maxDiameterIn,
			maxSeatedHeightIn: r.maxSeatedHeightIn,
			maxOverallHeightIn: r.maxOverallHeightIn
		})),
		allRefs: refs,
		unidentifiedRefs,
		splitCombinedRefs,
		unknownLots,
		acquisitionEntries: acqs,
		batches: batches.map((b) => ({
			...b,
			createdAt: b.createdAt.toISOString(),
			rows: batchRows.filter((r) => r.batchId === b.id)
		})),
		reviewQueue: revs.map((r) => ({
			...r,
			updatedAt: r.updatedAt.toISOString()
		})),
		recentAudits: recentAudits.map((a) => ({
			...a,
			createdAt: a.createdAt.toISOString()
		})),
		diagnostics
	};
}

export async function submitSingleIntake(params: {
	mode: 'existing' | 'new_ref';
	selectedTubeRefId?: string | null;
	promoteIfUnidentified?: boolean;
	newReference?: {
		designation: string;
		tubeFamily?: string | null;
		internalStructure?: string | null;
		generalFunction?: string | null;
		base?: string | null;
		pinCount?: number | null;
		basingCode?: string | null;
		envelope?: string | null;
		cap?: string | null;
		heaterVoltage?: string | null;
		heaterCurrent?: string | null;
		heatingMethod?: string | null;
		primarySource?: string | null;
		printedPage?: string | null;
		technicalNotes?: string | null;
	};
	observedDesignation?: string | null;
	quantity: number;
	location: string;
	layer?: string | null;
	stockCondition: string;
	testStatus: string;
	envelope?: string | null;
	base?: string | null;
	cap?: string | null;
	basingCode?: string | null;
	rcaOutline?: string | null;
	diameterIn?: number | null;
	heightIn?: number | null;
	notes?: string | null;
	source?: string | null;
	sourcePage?: string | null;
	applyReferenceUpdates?: boolean;
	actor: string;
}) {
	const qty = Math.trunc(params.quantity);
	if (!Number.isFinite(qty) || qty <= 0) {
		throw new Error('Quantity must be a positive integer.');
	}
	const boxNo = params.location.trim();
	if (!boxNo) {
		throw new Error('Storage box / location is required.');
	}

	return db.transaction(async (tx) => {
		let targetRef: typeof tubeReferences.$inferSelect | null = null;
		let snapshotText: string | null = null;
		let changesText: string | null = null;

		if (params.mode === 'new_ref') {
			const desig = cleanDesignation(params.newReference?.designation);
			if (!desig) {
				throw new Error('New reference designation is required.');
			}
			const existingRefs = await tx
				.select({ tubeRefId: tubeReferences.tubeRefId, normalizedKey: tubeReferences.normalizedKey })
				.from(tubeReferences);
			const key = normalizeDesignationKey(desig);
			const dup = existingRefs.find((r) => r.normalizedKey === key);
			if (dup) {
				throw new Error(
					`Designation "${desig}" already exists as ${dup.tubeRefId}. Select existing reference instead.`
				);
			}

			const nextId = computeNextTubeRefId(existingRefs.map((r) => r.tubeRefId));
			const rawBasing = params.newReference?.basingCode ?? params.basingCode ?? null;
			const basingCodes = cleanBasingCodes(rawBasing);
			const [createdRef] = await tx
				.insert(tubeReferences)
				.values({
					tubeRefId: nextId,
					referenceDesignation: desig,
					normalizedKey: key,
					referenceStatus: 'Started',
					lookupStatus: 'Active',
					tubeFamily: params.newReference?.tubeFamily?.trim() || null,
					internalStructure: params.newReference?.internalStructure?.trim() || null,
					generalFunction: params.newReference?.generalFunction?.trim() || null,
					base: params.newReference?.base?.trim() || params.base?.trim() || null,
					pinCount: params.newReference?.pinCount ?? null,
					basingCode: formatBasingCodeDisplay(rawBasing),
					basingCodes,
					envelope: params.newReference?.envelope?.trim() || params.envelope?.trim() || null,
					cap: params.newReference?.cap?.trim() || params.cap?.trim() || 'None',
					heaterVoltage: params.newReference?.heaterVoltage?.trim() || null,
					heaterCurrent: params.newReference?.heaterCurrent?.trim() || null,
					heatingMethod: params.newReference?.heatingMethod?.trim() || null,
					maxDiameterIn: params.diameterIn ?? null,
					maxOverallHeightIn: params.heightIn ?? null,
					technicalNotes: params.newReference?.technicalNotes?.trim() || null,
					primarySource: params.newReference?.primarySource?.trim() || params.source?.trim() || null,
					printedPage: params.newReference?.printedPage?.trim() || params.sourcePage?.trim() || null,
					verificationStatus: 'Pending verification'
				})
				.returning();
			targetRef = createdRef;
			changesText = `Created new reference ${createdRef.tubeRefId} (${desig})`;
		} else {
			const refId = (params.selectedTubeRefId ?? '').trim().toUpperCase();
			if (!refId) {
				throw new Error('Select a Tube Reference ID or choose Create New Reference.');
			}
			const [found] = await tx
				.select()
				.from(tubeReferences)
				.where(eq(tubeReferences.tubeRefId, refId))
				.limit(1);
			if (!found) {
				throw new Error(`Tube Reference ${refId} not found.`);
			}
			if (found.lookupStatus === 'Unidentified' && !params.promoteIfUnidentified) {
				throw new Error(
					`${found.tubeRefId} (${found.referenceDesignation}) is quarantined as Unidentified. Promote & verify it first or confirm promotion.`
				);
			}

			snapshotText = [
				`Reference Designation=${found.referenceDesignation}`,
				`Base=${found.base ?? ''}`,
				`Envelope=${found.envelope ?? ''}`,
				`Cap=${found.cap ?? ''}`,
				`Basing Code=${found.basingCode ?? ''}`,
				`Lookup Status=${found.lookupStatus}`
			].join('\n');

			if (params.applyReferenceUpdates || (found.lookupStatus === 'Unidentified' && params.promoteIfUnidentified)) {
				const patch: Partial<typeof tubeReferences.$inferInsert> = {
					updatedAt: new Date()
				};
				const changeNotes: string[] = [];

				if (found.lookupStatus === 'Unidentified' && params.promoteIfUnidentified) {
					patch.lookupStatus = 'Active';
					patch.verificationStatus = 'Verified on intake';
					changeNotes.push('Lookup Status: Unidentified -> Active');
				}
				if (params.envelope?.trim() && params.envelope.trim() !== found.envelope) {
					patch.envelope = params.envelope.trim();
					changeNotes.push(`Envelope: ${found.envelope ?? 'none'} -> ${patch.envelope}`);
				}
				if (params.base?.trim() && params.base.trim() !== found.base) {
					patch.base = params.base.trim();
					changeNotes.push(`Base: ${found.base ?? 'none'} -> ${patch.base}`);
				}
				if (params.cap?.trim() && params.cap.trim() !== found.cap) {
					patch.cap = params.cap.trim();
					changeNotes.push(`Cap: ${found.cap ?? 'none'} -> ${patch.cap}`);
				}
				if (params.basingCode?.trim()) {
					const formatted = formatBasingCodeDisplay(params.basingCode);
					if (formatted && formatted !== found.basingCode) {
						patch.basingCode = formatted;
						patch.basingCodes = cleanBasingCodes(params.basingCode);
						changeNotes.push(`Basing Code: ${found.basingCode ?? 'none'} -> ${formatted}`);
					}
				}
				if (changeNotes.length > 0) {
					const [updatedRef] = await tx
						.update(tubeReferences)
						.set(patch)
						.where(eq(tubeReferences.tubeRefId, found.tubeRefId))
						.returning();
					targetRef = updatedRef;
					changesText = changeNotes.join('; ');
				} else {
					targetRef = found;
				}
			} else {
				targetRef = found;
			}
		}

		const stockCond = normalizeStockCondition(params.stockCondition);
		const testStat = normalizeTestStatus(params.testStatus);
		const observed = cleanDesignation(params.observedDesignation) || targetRef.referenceDesignation;
		const layerClean = params.layer?.trim() || null;

		const [lot] = await tx
			.insert(inventoryLots)
			.values({
				tubeNumber: observed,
				canonicalDesignation: targetRef.referenceDesignation,
				normalizedKey: targetRef.normalizedKey,
				boxNo,
				boxLayer: layerClean,
				quantity: qty,
				quantityUnknown: false,
				comment: params.notes?.trim() || null,
				tubeRefId: targetRef.tubeRefId,
				stockCondition: stockCond,
				testStatus: testStat
			})
			.returning();

		const entryId = generateAcquisitionId('ACQ');
		const [entry] = await tx
			.insert(acquisitionEntries)
			.values({
				entryId,
				enteredAt: new Date().toISOString(),
				status: 'Added to inventory',
				selectedTubeRefId: targetRef.tubeRefId,
				observedDesignation: observed,
				quantity: qty,
				location: boxNo,
				layer: layerClean,
				envelope: params.envelope?.trim() || targetRef.envelope,
				base: params.base?.trim() || targetRef.base,
				cap: params.cap?.trim() || targetRef.cap,
				basingCode: formatBasingCodeDisplay(params.basingCode) || targetRef.basingCode,
				rcaOutline: params.rcaOutline?.trim() || null,
				diameterIn: params.diameterIn ?? null,
				heightIn: params.heightIn ?? null,
				notes: params.notes?.trim() || null,
				referenceChanges: changesText,
				source: params.source?.trim() || 'Web Single Intake',
				sourcePage: params.sourcePage?.trim() || null,
				originalReferenceSnapshot: snapshotText,
				stockCondition: stockCond,
				testStatus: testStat,
				lotId: lot.id
			})
			.returning();

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'single_intake_created',
			entityType: 'acquisition_entry',
			entityId: entryId,
			details: {
				tubeRefId: targetRef.tubeRefId,
				designation: targetRef.referenceDesignation,
				lotId: lot.id,
				boxNo,
				qty
			}
		});

		return { lot, entry, reference: targetRef };
	});
}

export async function stageBatchSpreadsheet(params: {
	batchName: string;
	fileName: string;
	buffer?: Uint8Array;
	csvText?: string;
	actor: string;
}) {
	let matrix: Array<Array<string | number | boolean | null | undefined>> = [];

	if (params.buffer && /\.(xlsx|xlsm)$/i.test(params.fileName)) {
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(Buffer.from(params.buffer) as unknown as ArrayBuffer);
		const ws = wb.worksheets[0];
		if (!ws) throw new Error('Uploaded workbook contains no worksheets.');
		ws.eachRow({ includeEmpty: false }, (row) => {
			const values = row.values as Array<unknown>;
			matrix.push(
				values.slice(1).map((cell) => {
					if (cell && typeof cell === 'object' && 'text' in cell) {
						return String((cell as { text: unknown }).text);
					}
					if (cell && typeof cell === 'object' && 'result' in cell) {
						return String((cell as { result: unknown }).result);
					}
					return cell === undefined || cell === null ? '' : String(cell);
				})
			);
		});
	} else if (params.csvText || params.buffer) {
		const text =
			params.csvText ?? Buffer.from(params.buffer ?? new Uint8Array()).toString('utf8');
		matrix = parseDelimitedText(text);
	} else {
		throw new Error('Provide an .xlsx file or CSV/TSV rows to stage.');
	}

	const parsedRows = normalizeSpreadsheetMatrix(matrix, params.fileName);
	if (parsedRows.length === 0) {
		throw new Error('No tube data rows found beneath headers.');
	}

	const refs = await db
		.select({
			tubeRefId: tubeReferences.tubeRefId,
			referenceDesignation: tubeReferences.referenceDesignation,
			normalizedKey: tubeReferences.normalizedKey,
			lookupStatus: tubeReferences.lookupStatus
		})
		.from(tubeReferences);

	const signatures = parsedRows.map((r) => r.sourceSignature);
	const existing =
		signatures.length > 0
			? await db
					.select({ sourceSignature: batchImportRows.sourceSignature })
					.from(batchImportRows)
					.where(inArray(batchImportRows.sourceSignature, signatures))
			: [];
	const existingSigSet = new Set(existing.map((e) => e.sourceSignature));

	const freshRows = parsedRows.filter((r) => !existingSigSet.has(r.sourceSignature));
	const skippedDuplicateCount = parsedRows.length - freshRows.length;

	if (freshRows.length === 0) {
		return {
			batchId: null,
			insertedCount: 0,
			skippedDuplicateCount,
			message: 'All rows match existing staged/imported signatures (duplicate import prevented).'
		};
	}

	return db.transaction(async (tx) => {
		const [batch] = await tx
			.insert(acquisitionBatches)
			.values({
				batchName: params.batchName.trim() || params.fileName,
				sourceType: /\.(xlsx|xlsm)$/i.test(params.fileName) ? 'xlsx_upload' : 'csv_upload',
				createdBy: params.actor
			})
			.returning();

		const toInsert = freshRows.map((src) => {
			const match = evaluateStagedRowMatch(
				{
					importTube: src.tube,
					importQty: src.qty,
					importBox: src.box,
					reviewed: false
				},
				refs
			);
			return {
				batchId: batch.id,
				readingId: src.readingId,
				sourceSignature: src.sourceSignature,
				box: src.box,
				layer: src.layer,
				rowNum: src.rowNum,
				colNum: src.colNum,
				brand: src.brand,
				tube: src.tube,
				qty: src.qty,
				confidence: src.confidence,
				labelType: src.labelType,
				stockCondition: src.stockCondition,
				testStatus: src.testStatus,
				itemCategory: src.itemCategory,
				notes: src.notes,
				sourceImage: src.sourceImage,
				importTube: src.tube,
				importQty: src.qty,
				importBox: src.box,
				importLayer: src.layer,
				importStock: src.stockCondition,
				importTest: src.testStatus,
				importEnvelope: src.importEnvelope,
				reviewed: false,
				selectedTubeRefId: match.suggestedTubeRefId,
				importStatus: match.importStatus,
				reasonOrCandidates: match.reasonOrCandidates,
				sourceDetails: src.sourceDetails
			};
		});

		await tx.insert(batchImportRows).values(toInsert).onConflictDoNothing();

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'batch_staged',
			entityType: 'acquisition_batch',
			entityId: String(batch.id),
			details: {
				batchName: batch.batchName,
				insertedCount: toInsert.length,
				skippedDuplicateCount
			}
		});

		return {
			batchId: batch.id,
			insertedCount: toInsert.length,
			skippedDuplicateCount,
			message: `Staged ${toInsert.length} row(s)${
				skippedDuplicateCount > 0 ? ` (${skippedDuplicateCount} duplicate signature(s) skipped)` : ''
			}.`
		};
	});
}

export async function updateStagedBatchRow(params: {
	rowId: number;
	importTube?: string | null;
	importQty?: number | null;
	importBox?: string | null;
	importLayer?: string | null;
	importStock?: string | null;
	importTest?: string | null;
	importEnvelope?: string | null;
	reviewed?: boolean;
	selectedTubeRefId?: string | null;
}) {
	const [existing] = await db
		.select()
		.from(batchImportRows)
		.where(eq(batchImportRows.id, params.rowId))
		.limit(1);

	if (!existing) throw new Error('Staged row not found.');
	if (existing.importStatus === 'Imported') {
		throw new Error('Cannot edit a row that has already been committed to inventory.');
	}

	const refs = await db
		.select({
			tubeRefId: tubeReferences.tubeRefId,
			referenceDesignation: tubeReferences.referenceDesignation,
			normalizedKey: tubeReferences.normalizedKey,
			lookupStatus: tubeReferences.lookupStatus
		})
		.from(tubeReferences);

	const nextTube =
		params.importTube !== undefined
			? cleanDesignation(params.importTube) || null
			: existing.importTube;
	const nextQty = params.importQty !== undefined ? params.importQty : existing.importQty;
	const nextBox =
		params.importBox !== undefined ? params.importBox?.trim() || null : existing.importBox;
	const nextLayer =
		params.importLayer !== undefined ? params.importLayer?.trim() || null : existing.importLayer;
	const nextStock =
		params.importStock !== undefined
			? normalizeStockCondition(params.importStock)
			: existing.importStock;
	const nextTest =
		params.importTest !== undefined
			? normalizeTestStatus(params.importTest)
			: existing.importTest;
	const nextEnvelope =
		params.importEnvelope !== undefined
			? params.importEnvelope?.trim() || null
			: existing.importEnvelope;
	const nextReviewed = params.reviewed !== undefined ? params.reviewed : existing.reviewed;
	const nextRefId =
		params.selectedTubeRefId !== undefined
			? params.selectedTubeRefId?.trim().toUpperCase() || null
			: existing.selectedTubeRefId;

	const evalResult = evaluateStagedRowMatch(
		{
			importTube: nextTube,
			importQty: nextQty,
			importBox: nextBox,
			reviewed: nextReviewed,
			selectedTubeRefId: nextRefId
		},
		refs
	);

	const [updated] = await db
		.update(batchImportRows)
		.set({
			importTube: nextTube,
			importQty: nextQty,
			importBox: nextBox,
			importLayer: nextLayer,
			importStock: nextStock,
			importTest: nextTest,
			importEnvelope: nextEnvelope,
			reviewed: nextReviewed,
			selectedTubeRefId: evalResult.suggestedTubeRefId,
			importStatus: evalResult.importStatus,
			reasonOrCandidates: evalResult.reasonOrCandidates
		})
		.where(eq(batchImportRows.id, existing.id))
		.returning();

	return updated;
}

export async function commitBatchReadyRows(params: { batchId?: number; actor: string }) {
	return db.transaction(async (tx) => {
		const candidates = params.batchId
			? await tx
					.select()
					.from(batchImportRows)
					.where(eq(batchImportRows.batchId, params.batchId))
			: await tx.select().from(batchImportRows);

		const readyRows = candidates.filter(
			(r) =>
				r.importStatus === 'Ready' &&
				r.reviewed &&
				Boolean(r.selectedTubeRefId) &&
				(r.importQty ?? 0) > 0 &&
				Boolean(r.importBox)
		);

		if (readyRows.length === 0) {
			return { committedCount: 0 };
		}

		const refs = await tx.select().from(tubeReferences);
		const refMap = new Map(refs.map((r) => [r.tubeRefId, r]));

		let committedCount = 0;
		for (const row of readyRows) {
			const ref = row.selectedTubeRefId ? refMap.get(row.selectedTubeRefId) : null;
			if (!ref || ref.lookupStatus === 'Unidentified') continue;

			const qty = row.importQty!;
			const boxNo = row.importBox!;
			const stockCondition = normalizeStockCondition(row.importStock);
			const testStatus = normalizeTestStatus(row.importTest);

			const [lot] = await tx
				.insert(inventoryLots)
				.values({
					tubeNumber: row.tube || ref.referenceDesignation,
					canonicalDesignation: ref.referenceDesignation,
					normalizedKey: ref.normalizedKey,
					boxNo,
					boxLayer: row.importLayer || null,
					quantity: qty,
					quantityUnknown: false,
					comment: row.notes || null,
					tubeRefId: ref.tubeRefId,
					stockCondition,
					testStatus
				})
				.returning();

			const acqId = generateAcquisitionId('ACQ');
			const nowIso = new Date().toISOString();

			await tx.insert(acquisitionEntries).values({
				entryId: acqId,
				enteredAt: nowIso,
				status: 'Added to inventory',
				selectedTubeRefId: ref.tubeRefId,
				observedDesignation: row.importTube || row.tube || ref.referenceDesignation,
				quantity: qty,
				location: boxNo,
				layer: row.importLayer || null,
				envelope: row.importEnvelope || ref.envelope,
				base: ref.base,
				cap: ref.cap,
				basingCode: ref.basingCode,
				notes: `[Batch:${row.readingId}] ${row.sourceDetails ?? ''}`.trim(),
				source: `Batch Import: ${row.sourceImage ?? row.readingId}`,
				stockCondition,
				testStatus,
				lotId: lot.id
			});

			await tx
				.update(batchImportRows)
				.set({
					importStatus: 'Imported',
					acquisitionId: acqId,
					importedAt: nowIso
				})
				.where(eq(batchImportRows.id, row.id));

			committedCount++;
		}

		if (committedCount > 0) {
			await tx.insert(auditLog).values({
				actor: params.actor,
				action: 'batch_committed',
				entityType: 'acquisition_batch',
				entityId: String(params.batchId ?? 'all'),
				details: { committedCount }
			});
		}

		return { committedCount };
	});
}

export async function resolveReviewItem(params: {
	id: number;
	status: string;
	resolutionNotes?: string | null;
	actor: string;
}) {
	const [updated] = await db
		.update(reviewQueue)
		.set({
			status: params.status.trim() || 'Resolved',
			resolutionNotes: params.resolutionNotes?.trim() || null,
			updatedAt: new Date()
		})
		.where(eq(reviewQueue.id, params.id))
		.returning();

	if (!updated) throw new Error('Review queue item not found.');

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'review_item_updated',
		entityType: 'review_queue',
		entityId: String(updated.id),
		details: { status: updated.status, tubeRefId: updated.tubeRefId }
	});

	return updated;
}

export async function updateTubeReferenceCurator(params: {
	tubeRefId: string;
	referenceDesignation?: string;
	referenceStatus?: string;
	lookupStatus?: string;
	tubeFamily?: string | null;
	internalStructure?: string | null;
	generalFunction?: string | null;
	base?: string | null;
	pinCount?: string | number | null;
	basingCode?: string | null;
	envelope?: string | null;
	cap?: string | null;
	heaterVoltage?: string | null;
	heaterCurrent?: string | null;
	heatingMethod?: string | null;
	technicalNotes?: string | null;
	primarySource?: string | null;
	printedPage?: string | null;
	verificationStatus?: string | null;
	actor: string;
}) {
	const cleanId = params.tubeRefId.trim().toUpperCase();
	const [existing] = await db
		.select()
		.from(tubeReferences)
		.where(eq(tubeReferences.tubeRefId, cleanId))
		.limit(1);
	if (!existing) throw new Error(`Tube Reference ${cleanId} not found.`);

	const nextDesig = params.referenceDesignation
		? cleanDesignation(params.referenceDesignation)
		: existing.referenceDesignation;

	const rawBasing =
		params.basingCode !== undefined ? params.basingCode : existing.basingCode;

	const [updated] = await db
		.update(tubeReferences)
		.set({
			referenceDesignation: nextDesig,
			normalizedKey: normalizeDesignationKey(nextDesig),
			referenceStatus: params.referenceStatus ?? existing.referenceStatus,
			lookupStatus: params.lookupStatus ?? existing.lookupStatus,
			tubeFamily: params.tubeFamily !== undefined ? params.tubeFamily?.trim() || null : existing.tubeFamily,
			internalStructure:
				params.internalStructure !== undefined
					? params.internalStructure?.trim() || null
					: existing.internalStructure,
			generalFunction:
				params.generalFunction !== undefined
					? params.generalFunction?.trim() || null
					: existing.generalFunction,
			base: params.base !== undefined ? params.base?.trim() || null : existing.base,
			pinCount:
				params.pinCount !== undefined ? parsePinCount(params.pinCount) : existing.pinCount,
			basingCode: formatBasingCodeDisplay(rawBasing),
			basingCodes: cleanBasingCodes(rawBasing),
			envelope:
				params.envelope !== undefined ? params.envelope?.trim() || null : existing.envelope,
			cap: params.cap !== undefined ? params.cap?.trim() || null : existing.cap,
			heaterVoltage:
				params.heaterVoltage !== undefined
					? params.heaterVoltage?.trim() || null
					: existing.heaterVoltage,
			heaterCurrent:
				params.heaterCurrent !== undefined
					? params.heaterCurrent?.trim() || null
					: existing.heaterCurrent,
			heatingMethod:
				params.heatingMethod !== undefined
					? params.heatingMethod?.trim() || null
					: existing.heatingMethod,
			technicalNotes:
				params.technicalNotes !== undefined
					? params.technicalNotes?.trim() || null
					: existing.technicalNotes,
			primarySource:
				params.primarySource !== undefined
					? params.primarySource?.trim() || null
					: existing.primarySource,
			printedPage:
				params.printedPage !== undefined
					? params.printedPage?.trim() || null
					: existing.printedPage,
			verificationStatus:
				params.verificationStatus !== undefined
					? params.verificationStatus?.trim() || null
					: existing.verificationStatus,
			updatedAt: new Date()
		})
		.where(eq(tubeReferences.tubeRefId, cleanId))
		.returning();

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'reference_updated',
		entityType: 'tube_reference',
		entityId: cleanId,
		details: {
			lookupStatus: updated.lookupStatus,
			referenceDesignation: updated.referenceDesignation
		}
	});

	return updated;
}

export async function updateLotCurator(params: {
	lotId: number;
	quantity?: number | null;
	quantityUnknown?: boolean;
	tubeRefId?: string | null;
	boxNo?: string | null;
	boxLayer?: string | null;
	stockCondition?: string | null;
	testStatus?: string | null;
	comment?: string | null;
	actor: string;
}) {
	const [existing] = await db
		.select()
		.from(inventoryLots)
		.where(eq(inventoryLots.id, params.lotId))
		.limit(1);
	if (!existing) throw new Error('Inventory lot not found.');

	let canonicalDesignation = existing.canonicalDesignation;
	let normalizedKey = existing.normalizedKey;
	let nextRefId = existing.tubeRefId;

	if (params.tubeRefId !== undefined) {
		const refId = params.tubeRefId?.trim().toUpperCase() || null;
		if (refId) {
			const [ref] = await txSelectRef(refId);
			if (!ref) throw new Error(`Reference ${refId} not found.`);
			nextRefId = ref.tubeRefId;
			canonicalDesignation = ref.referenceDesignation;
			normalizedKey = ref.normalizedKey;
		} else {
			nextRefId = null;
		}
	}

	const [updated] = await db
		.update(inventoryLots)
		.set({
			quantity: params.quantity !== undefined ? params.quantity : existing.quantity,
			quantityUnknown:
				params.quantityUnknown !== undefined
					? params.quantityUnknown
					: existing.quantityUnknown,
			tubeRefId: nextRefId,
			canonicalDesignation,
			normalizedKey,
			boxNo: params.boxNo !== undefined ? params.boxNo?.trim() || null : existing.boxNo,
			boxLayer:
				params.boxLayer !== undefined ? params.boxLayer?.trim() || null : existing.boxLayer,
			stockCondition:
				params.stockCondition !== undefined
					? normalizeStockCondition(params.stockCondition)
					: existing.stockCondition,
			testStatus:
				params.testStatus !== undefined
					? normalizeTestStatus(params.testStatus)
					: existing.testStatus,
			comment: params.comment !== undefined ? params.comment?.trim() || null : existing.comment,
			updatedAt: new Date()
		})
		.where(eq(inventoryLots.id, existing.id))
		.returning();

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'lot_updated',
		entityType: 'inventory_lot',
		entityId: String(updated.id),
		details: {
			quantity: updated.quantity,
			quantityUnknown: updated.quantityUnknown,
			tubeRefId: updated.tubeRefId,
			boxNo: updated.boxNo
		}
	});

	return updated;
}

async function txSelectRef(tubeRefId: string) {
	return db
		.select()
		.from(tubeReferences)
		.where(eq(tubeReferences.tubeRefId, tubeRefId))
		.limit(1);
}

export async function createRelationshipCurator(params: {
	designation: string;
	relatedDesignation: string;
	relationship: string;
	direction: string;
	differenceType?: string | null;
	qualificationNotes?: string | null;
	source?: string | null;
	sourcePage?: string | null;
	verificationStatus?: string | null;
	actor: string;
}) {
	const desig = cleanDesignation(params.designation);
	const relDesig = cleanDesignation(params.relatedDesignation);
	if (!desig || !relDesig) {
		throw new Error('Both Designation and Related Designation are required.');
	}

	const refs = await db
		.select({
			tubeRefId: tubeReferences.tubeRefId,
			normalizedKey: tubeReferences.normalizedKey
		})
		.from(tubeReferences);
	const byKey = new Map(refs.map((r) => [r.normalizedKey, r.tubeRefId]));

	const [created] = await db
		.insert(relationships)
		.values({
			designation: desig,
			relatedDesignation: relDesig,
			sourceTubeRefId: byKey.get(normalizeDesignationKey(desig)) ?? null,
			targetTubeRefId: byKey.get(normalizeDesignationKey(relDesig)) ?? null,
			relationship: params.relationship.trim() || 'Related',
			direction: params.direction.trim() || 'Related only',
			differenceType: params.differenceType?.trim() || null,
			qualificationNotes: params.qualificationNotes?.trim() || null,
			source: params.source?.trim() || null,
			sourcePage: params.sourcePage?.trim() || null,
			verificationStatus: params.verificationStatus?.trim() || 'Verified by curator'
		})
		.returning();

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'relationship_created',
		entityType: 'relationship',
		entityId: String(created.id),
		details: { designation: desig, relatedDesignation: relDesig, direction: created.direction }
	});

	return created;
}

export async function addLocationOrLayerCurator(params: {
	kind: 'location' | 'box_layer';
	locationCode?: string;
	locationKind?: string;
	description?: string;
	box?: string;
	layer?: string;
	notes?: string | null;
	actor: string;
}) {
	if (params.kind === 'box_layer') {
		const box = params.box?.trim();
		const layer = params.layer?.trim();
		if (!box || !layer) throw new Error('Box and Layer are required.');
		const [created] = await db
			.insert(boxLayers)
			.values({ box, layer, active: true, notes: params.notes?.trim() || null })
			.onConflictDoNothing()
			.returning();
		return created;
	}

	const code = params.locationCode?.trim();
	if (!code) throw new Error('Location code is required.');
	const [created] = await db
		.insert(locations)
		.values({
			locationCode: code,
			locationKind: params.locationKind?.trim() || 'Box',
			description: params.description?.trim() || `Box ${code}`,
			active: true,
			reviewStatus: 'Active',
			notes: params.notes?.trim() || null
		})
		.onConflictDoNothing()
		.returning();

	await db.insert(auditLog).values({
		actor: params.actor,
		action: 'location_added',
		entityType: 'location',
		entityId: code,
		details: { description: params.description ?? code }
	});

	return created;
}
