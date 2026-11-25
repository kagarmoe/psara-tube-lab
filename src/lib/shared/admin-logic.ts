import {
	buildSourceSignature,
	cleanDesignation,
	normalizeDesignationKey,
	normalizeStockCondition,
	normalizeTestStatus,
	parseQuantity,
	splitDesignationAliases
} from './normalize';

export interface ParsedSpreadsheetSourceRow {
	readingId: string;
	sourceSignature: string;
	box: string | null;
	layer: string | null;
	rowNum: string | null;
	colNum: string | null;
	brand: string | null;
	tube: string | null;
	qty: number | null;
	confidence: string | null;
	labelType: string | null;
	stockCondition: string;
	testStatus: string;
	itemCategory: string | null;
	notes: string | null;
	sourceImage: string | null;
	importEnvelope: string | null;
	sourceDetails: string;
}

const HEADER_ALIASES: Record<string, string> = {
	'tube number': 'tube',
	tube: 'tube',
	designation: 'tube',
	'canonical designation': 'tube',
	box: 'box',
	'box no': 'box',
	'box no.': 'box',
	location: 'box',
	layer: 'layer',
	'box layer': 'layer',
	row: 'rowNum',
	col: 'colNum',
	column: 'colNum',
	brand: 'brand',
	qty: 'qty',
	quant: 'qty',
	quantity: 'qty',
	confidence: 'confidence',
	'label type': 'labelType',
	'stock condition': 'stockCondition',
	condition: 'stockCondition',
	'test status': 'testStatus',
	status: 'testStatus',
	'item category': 'itemCategory',
	category: 'itemCategory',
	notes: 'notes',
	comment: 'notes',
	comments: 'notes',
	'source image': 'sourceImage',
	envelope: 'importEnvelope',
	'reading id': 'readingId'
};

function mapHeader(raw: string): string | null {
	const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
	return HEADER_ALIASES[key] ?? null;
}

/**
 * Compute the next immutable `TXXXX` ID safely above all existing IDs.
 */
export function computeNextTubeRefId(existingIds: string[]): string {
	let maxNum = 0;
	for (const id of existingIds) {
		const m = id.match(/^T(\d+)$/i);
		if (m) {
			const n = Number(m[1]);
			if (n > maxNum) maxNum = n;
		}
	}
	return `T${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Detect header row within rows 1–20 in any column order and normalize source rows
 * with deterministic `Source Signature` deduplication keys.
 */
export function normalizeSpreadsheetMatrix(
	matrix: Array<Array<string | number | boolean | null | undefined>>,
	sourceLabel: string
): ParsedSpreadsheetSourceRow[] {
	if (matrix.length === 0) return [];

	// Locate best header row among first 20 rows (highest count of recognized aliases)
	let headerIdx = -1;
	let bestScore = 0;
	const scanLimit = Math.min(matrix.length, 20);
	for (let r = 0; r < scanLimit; r++) {
		const row = matrix[r] ?? [];
		let score = 0;
		for (const cell of row) {
			if (cell !== null && cell !== undefined && mapHeader(String(cell))) {
				score++;
			}
		}
		if (score > bestScore && score >= 2) {
			bestScore = score;
			headerIdx = r;
		}
	}

	if (headerIdx === -1) {
		throw new Error(
			'Could not find recognizable column headers (expected columns like Tube Number, Box, Qty) in rows 1–20.'
		);
	}

	const rawHeaders = (matrix[headerIdx] ?? []).map((h) => String(h ?? '').trim());
	const colMapping = rawHeaders.map((h) => mapHeader(h));
	const safeSourceSlug = sourceLabel
		.replace(/\.[^.]+$/, '')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'UPLOAD';

	const results: ParsedSpreadsheetSourceRow[] = [];

	for (let r = headerIdx + 1; r < matrix.length; r++) {
		const row = matrix[r] ?? [];
		const canonical: Record<string, string> = {};
		const sigPairs: Array<[string, string]> = [];
		const detailParts: string[] = [];

		for (let c = 0; c < rawHeaders.length; c++) {
			const rawHeader = rawHeaders[c];
			const valRaw = row[c];
			const val = valRaw === null || valRaw === undefined ? '' : String(valRaw).trim();
			if (!rawHeader || !val) continue;

			sigPairs.push([rawHeader, val]);
			detailParts.push(`${rawHeader}=${val}`);
			const mapped = colMapping[c];
			if (mapped && !canonical[mapped]) {
				canonical[mapped] = val;
			}
		}

		if (sigPairs.length === 0 || (!canonical.tube && !canonical.box && !canonical.qty)) {
			continue;
		}

		const { quantity } = parseQuantity(canonical.qty);
		const readingId =
			canonical.readingId || `WEB-${safeSourceSlug}-R${r + 1}`;
		const sourceSignature = buildSourceSignature([
			['Source', safeSourceSlug],
			...sigPairs
		]);

		results.push({
			readingId,
			sourceSignature,
			box: canonical.box || null,
			layer: canonical.layer || null,
			rowNum: canonical.rowNum || String(r + 1),
			colNum: canonical.colNum || null,
			brand: canonical.brand || null,
			tube: canonical.tube ? cleanDesignation(canonical.tube) : null,
			qty: quantity,
			confidence: canonical.confidence || 'User Upload',
			labelType: canonical.labelType || 'USER SPREADSHEET',
			stockCondition: normalizeStockCondition(canonical.stockCondition),
			testStatus: normalizeTestStatus(canonical.testStatus),
			itemCategory: canonical.itemCategory || 'Tube (assumed)',
			notes: canonical.notes || null,
			sourceImage: canonical.sourceImage || sourceLabel,
			importEnvelope: canonical.importEnvelope || null,
			sourceDetails: `Source: ${sourceLabel}; row ${r + 1}\n${detailParts.join('; ')}`
		});
	}

	return results;
}

export interface BatchCandidateTarget {
	tubeRefId: string;
	referenceDesignation: string;
	normalizedKey: string;
	lookupStatus: string;
}

/**
 * Evaluate a staged row against known Tube References and decide Ready vs Hold.
 */
export function evaluateStagedRowMatch(
	row: {
		importTube: string | null;
		importQty: number | null;
		importBox: string | null;
		reviewed: boolean;
		selectedTubeRefId?: string | null;
	},
	references: BatchCandidateTarget[]
): {
	importStatus: 'Ready' | 'Hold';
	suggestedTubeRefId: string | null;
	reasonOrCandidates: string | null;
} {
	const qtyOk = row.importQty !== null && row.importQty > 0;
	const boxOk = Boolean(row.importBox && row.importBox.trim().length > 0);

	// Direct selectedTubeRefId override
	if (row.selectedTubeRefId) {
		const chosen = references.find((r) => r.tubeRefId === row.selectedTubeRefId);
		if (!chosen) {
			return {
				importStatus: 'Hold',
				suggestedTubeRefId: null,
				reasonOrCandidates: `Selected reference ${row.selectedTubeRefId} does not exist.`
			};
		}
		if (chosen.lookupStatus === 'Unidentified') {
			return {
				importStatus: 'Hold',
				suggestedTubeRefId: chosen.tubeRefId,
				reasonOrCandidates: `${chosen.tubeRefId} is quarantined as Unidentified — promote it before import.`
			};
		}
		if (!qtyOk || !boxOk) {
			return {
				importStatus: 'Hold',
				suggestedTubeRefId: chosen.tubeRefId,
				reasonOrCandidates: !boxOk ? 'Missing Box / Location.' : 'Missing valid Qty (> 0).'
			};
		}
		return {
			importStatus: row.reviewed ? 'Ready' : 'Hold',
			suggestedTubeRefId: chosen.tubeRefId,
			reasonOrCandidates: row.reviewed ? null : 'Needs curator review checkbox before commit.'
		};
	}

	const key = normalizeDesignationKey(row.importTube);
	if (!key) {
		return {
			importStatus: 'Hold',
			suggestedTubeRefId: null,
			reasonOrCandidates: 'Missing tube designation.'
		};
	}

	const exactActive = references.filter(
		(r) =>
			r.lookupStatus !== 'Unidentified' &&
			(r.normalizedKey === key ||
				splitDesignationAliases(r.referenceDesignation).some(
					(a) => normalizeDesignationKey(a) === key
				))
	);

	if (exactActive.length === 1) {
		const ref = exactActive[0];
		if (!qtyOk || !boxOk) {
			return {
				importStatus: 'Hold',
				suggestedTubeRefId: ref.tubeRefId,
				reasonOrCandidates: !boxOk ? 'Missing Box / Location.' : 'Missing valid Qty (> 0).'
			};
		}
		return {
			importStatus: row.reviewed ? 'Ready' : 'Hold',
			suggestedTubeRefId: ref.tubeRefId,
			reasonOrCandidates: row.reviewed
				? `Matched ${ref.referenceDesignation} (${ref.tubeRefId})`
				: `Matched ${ref.referenceDesignation} (${ref.tubeRefId}) — check Reviewed to commit`
		};
	}

	if (exactActive.length > 1) {
		return {
			importStatus: 'Hold',
			suggestedTubeRefId: null,
			reasonOrCandidates: `Multiple reference candidates: ${exactActive
				.map((r) => `${r.referenceDesignation} (${r.tubeRefId})`)
				.join(', ')}`
		};
	}

	const unid = references.find(
		(r) => r.lookupStatus === 'Unidentified' && r.normalizedKey === key
	);
	if (unid) {
		return {
			importStatus: 'Hold',
			suggestedTubeRefId: null,
			reasonOrCandidates: `Matches quarantined Unidentified record ${unid.tubeRefId} — verify & promote first.`
		};
	}

	const prefixHits = references
		.filter((r) => r.lookupStatus !== 'Unidentified' && r.normalizedKey.startsWith(key))
		.slice(0, 4);

	return {
		importStatus: 'Hold',
		suggestedTubeRefId: null,
		reasonOrCandidates:
			prefixHits.length > 0
				? `No exact match. Possible: ${prefixHits
						.map((r) => `${r.referenceDesignation} (${r.tubeRefId})`)
						.join(', ')}`
				: `No reference found for "${row.importTube}" — create reference first.`
	};
}

/**
 * Simple CSV/TSV text parser for pasted or uploaded flat files.
 */
export function parseDelimitedText(text: string): string[][] {
	const delimiter = text.includes('\t') && !text.includes(',') ? '\t' : ',';
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (inQuotes) {
			if (ch === '"' && next === '"') {
				field += '"';
				i++;
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			currentRow.push(field);
			field = '';
		} else if (ch === '\r' && next === '\n') {
			currentRow.push(field);
			rows.push(currentRow);
			currentRow = [];
			field = '';
			i++;
		} else if (ch === '\n' || ch === '\r') {
			currentRow.push(field);
			rows.push(currentRow);
			currentRow = [];
			field = '';
		} else {
			field += ch;
		}
	}

	if (field.length > 0 || currentRow.length > 0) {
		currentRow.push(field);
		rows.push(currentRow);
	}
	return rows;
}
