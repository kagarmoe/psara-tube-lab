import { asc, desc } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '$lib/server/db';
import {
	acquisitionEntries,
	batchImportRows,
	inventoryLots,
	locations,
	pullRequests,
	relationships,
	reviewQueue,
	tubeReferences
} from '$lib/server/db/schema';

export async function buildPsaraWorkbookExport(): Promise<Buffer> {
	const [refs, lots, rels, locs, revs, acqs, batches, pulls] = await Promise.all([
		db.select().from(tubeReferences).orderBy(asc(tubeReferences.tubeRefId)),
		db
			.select()
			.from(inventoryLots)
			.orderBy(asc(inventoryLots.canonicalDesignation), asc(inventoryLots.boxNo)),
		db.select().from(relationships).orderBy(asc(relationships.id)),
		db.select().from(locations).orderBy(asc(locations.locationCode)),
		db.select().from(reviewQueue).orderBy(asc(reviewQueue.id)),
		db.select().from(acquisitionEntries).orderBy(desc(acquisitionEntries.entryId)),
		db.select().from(batchImportRows).orderBy(asc(batchImportRows.id)),
		db.select().from(pullRequests).orderBy(desc(pullRequests.createdAt))
	]);

	// Aggregate live stock per TubeRefID cleanly (never stale cached sums)
	const stockByRef = new Map<string, { qty: number; lots: number }>();
	for (const l of lots) {
		if (!l.tubeRefId) continue;
		const cur = stockByRef.get(l.tubeRefId) ?? { qty: 0, lots: 0 };
		cur.qty += l.quantity ?? 0;
		cur.lots += 1;
		stockByRef.set(l.tubeRefId, cur);
	}

	const wb = new ExcelJS.Workbook();
	wb.creator = 'PSARA Tube Lab';
	wb.created = new Date();

	// 1. PSARA Inventory
	const invSheet = wb.addWorksheet('PSARA Inventory');
	invSheet.addRow([
		'Tube Number',
		'Canonical Designation',
		'Box No.',
		'Quant',
		'box layer',
		'Comment',
		'TubeRefID',
		'Stock Condition',
		'Test Status'
	]);
	for (const l of lots) {
		invSheet.addRow([
			l.tubeNumber,
			l.canonicalDesignation,
			l.boxNo ?? '',
			l.quantityUnknown ? '?' : (l.quantity ?? ''),
			l.boxLayer ?? '',
			l.comment ?? '',
			l.tubeRefId ?? '',
			l.stockCondition,
			l.testStatus
		]);
	}

	// 2. Tube Reference
	const refSheet = wb.addWorksheet('Tube Reference');
	refSheet.addRow([
		'Reference Designation',
		'PSARA Qty',
		'Inventory Lots',
		'Reference Status',
		'Tube Family',
		'Internal Structure',
		'General Function',
		'Base',
		'Pin Count',
		'Basing Code',
		'Envelope',
		'Cap',
		'Heater/Filament V',
		'Heater/Filament A',
		'Heating Method',
		'Max Diameter (in)',
		'Max Seated Height (in)',
		'Max Overall Height (in)',
		'Technical Notes',
		'Primary Source',
		'Printed Page',
		'Secondary Source',
		'Secondary Page',
		'Verification Status',
		'TubeRefID',
		'Lookup Status'
	]);
	for (const r of refs) {
		const agg = stockByRef.get(r.tubeRefId);
		refSheet.addRow([
			r.referenceDesignation,
			agg?.qty ?? 0,
			agg?.lots ?? 0,
			r.referenceStatus,
			r.tubeFamily ?? '',
			r.internalStructure ?? '',
			r.generalFunction ?? '',
			r.base ?? '',
			r.pinCount ?? '',
			r.basingCode ?? '',
			r.envelope ?? '',
			r.cap ?? '',
			r.heaterVoltage ?? '',
			r.heaterCurrent ?? '',
			r.heatingMethod ?? '',
			r.maxDiameterIn ?? '',
			r.maxSeatedHeightIn ?? '',
			r.maxOverallHeightIn ?? '',
			r.technicalNotes ?? '',
			r.primarySource ?? '',
			r.printedPage ?? '',
			r.secondarySource ?? '',
			r.secondaryPage ?? '',
			r.verificationStatus ?? '',
			r.tubeRefId,
			r.lookupStatus
		]);
	}

	// 3. Relationships
	const relSheet = wb.addWorksheet('Relationships');
	relSheet.addRow([
		'Inventory Source Row',
		'Designation',
		'Related Designation',
		'Relationship',
		'Direction',
		'Difference Type',
		'Qualification/Notes',
		'Source',
		'Source Page',
		'Original Note',
		'Verification Status'
	]);
	for (const rel of rels) {
		relSheet.addRow([
			rel.inventorySourceRow ?? '',
			rel.designation,
			rel.relatedDesignation,
			rel.relationship,
			rel.direction,
			rel.differenceType ?? '',
			rel.qualificationNotes ?? '',
			rel.source ?? '',
			rel.sourcePage ?? '',
			rel.originalNote ?? '',
			rel.verificationStatus ?? ''
		]);
	}

	// 4. Locations
	const locSheet = wb.addWorksheet('Locations');
	locSheet.addRow([
		'Location Code',
		'Location Kind',
		'Description',
		'Active',
		'Review Status',
		'Notes'
	]);
	for (const loc of locs) {
		locSheet.addRow([
			loc.locationCode,
			loc.locationKind,
			loc.description,
			loc.active ? 'Yes' : 'No',
			loc.reviewStatus ?? '',
			loc.notes ?? ''
		]);
	}

	// 5. Review Queue
	const revSheet = wb.addWorksheet('Review');
	revSheet.addRow([
		'Sheet',
		'Reference Row',
		'Field',
		'Current Value',
		'Issue',
		'Suggested Action',
		'Status',
		'TubeRefID',
		'Resolution Notes'
	]);
	for (const rv of revs) {
		revSheet.addRow([
			rv.sheet ?? '',
			rv.referenceRow ?? '',
			rv.field ?? '',
			rv.currentValue ?? '',
			rv.issue ?? '',
			rv.suggestedAction ?? '',
			rv.status,
			rv.tubeRefId ?? '',
			rv.resolutionNotes ?? ''
		]);
	}

	// 6. Acquisition Entries
	const acqSheet = wb.addWorksheet('Acquisition Entries');
	acqSheet.addRow([
		'Entry ID',
		'Entered At',
		'Status',
		'Selected TubeRefID',
		'Observed Designation',
		'Quantity',
		'Location',
		'Layer',
		'Stock Condition',
		'Test Status',
		'Source',
		'Reference Changes',
		'Notes'
	]);
	for (const a of acqs) {
		acqSheet.addRow([
			a.entryId,
			a.enteredAt ?? '',
			a.status,
			a.selectedTubeRefId ?? '',
			a.observedDesignation ?? '',
			a.quantity ?? '',
			a.location ?? '',
			a.layer ?? '',
			a.stockCondition ?? '',
			a.testStatus ?? '',
			a.source ?? '',
			a.referenceChanges ?? '',
			a.notes ?? ''
		]);
	}

	// 7. Batch Import
	const batchSheet = wb.addWorksheet('Batch Import');
	batchSheet.addRow([
		'Reading ID',
		'Import Tube',
		'Import Qty',
		'Import Box',
		'Import Layer',
		'Reviewed',
		'Selected TubeRefID',
		'Import Status',
		'Acquisition ID',
		'Imported At',
		'Source Signature'
	]);
	for (const b of batches) {
		batchSheet.addRow([
			b.readingId,
			b.importTube ?? '',
			b.importQty ?? '',
			b.importBox ?? '',
			b.importLayer ?? '',
			b.reviewed ? 'Yes' : 'No',
			b.selectedTubeRefId ?? '',
			b.importStatus,
			b.acquisitionId ?? '',
			b.importedAt ?? '',
			b.sourceSignature
		]);
	}

	// 8. Pull Requests
	const pullSheet = wb.addWorksheet('Pull Sheets');
	pullSheet.addRow(['Request Code', 'Member Name', 'Purpose', 'Status', 'Created At']);
	for (const p of pulls) {
		pullSheet.addRow([
			p.requestCode,
			p.memberName,
			p.purpose ?? '',
			p.status,
			p.createdAt.toISOString()
		]);
	}

	const arrayBuf = await wb.xlsx.writeBuffer();
	return Buffer.from(arrayBuf);
}
