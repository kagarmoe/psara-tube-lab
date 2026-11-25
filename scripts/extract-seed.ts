import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
	cleanBasingCodes,
	cleanDesignation,
	containsEmailAddress,
	excelSerialToIso,
	formatBasingCodeDisplay,
	normalizeBasingLookupKey,
	normalizeDesignationKey,
	normalizeStockCondition,
	normalizeTestStatus,
	parseDimensionInches,
	parsePinCount,
	parseQuantity,
	splitDesignationAliases
} from '../src/lib/shared/normalize';
import type { SeedPayload } from '../src/lib/server/db/seed';

const DEFAULT_XLSM_PATH =
	process.env.PSARA_WORKBOOK_PATH ??
	'/Users/kimberlygarmoe/Dropbox/PSARA/PSARA_Tube_Inventory_Ready_For_VBA_inc_boxes_TEST.xlsm';
const DEFAULT_MANIFEST_PATH =
	process.env.PSARA_ASSET_MANIFEST_PATH ??
	'/Users/kimberlygarmoe/Dropbox/PSARA/PSARA_Tube_Assets/asset_manifest.csv';
const DEFAULT_TUNGSOL_CSV_PATH =
	process.env.PSARA_TUNGSOL_CSV_PATH ??
	'/Users/kimberlygarmoe/Dropbox/PSARA/PSARA_Tube_Assets/tungsol_image_index.csv';

const SUPPLEMENTAL_TUBE_FAMILY: Record<string, string> = {
	T0732: '5Z4 family',
	T0733: 'L49B ballast',
	T0735: '5W4 / 5Y3 family'
};

interface RawCellNode {
	'@_r'?: string;
	'@_t'?: string;
	v?: unknown;
	is?: unknown;
}

function colLettersToIndex(col: string): number {
	let idx = 0;
	for (let i = 0; i < col.length; i++) {
		idx = idx * 26 + (col.charCodeAt(i) - 64);
	}
	return idx - 1;
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
	if (val === undefined || val === null) return [];
	return Array.isArray(val) ? val : [val];
}

function collectXmlText(node: unknown): string {
	if (node === null || node === undefined) return '';
	if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(collectXmlText).join('');
	}
	if (typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		if ('#text' in obj) {
			return String(obj['#text'] ?? '');
		}
		return Object.entries(obj)
			.filter(([k]) => !k.startsWith('@_'))
			.map(([, v]) => collectXmlText(v))
			.join('');
	}
	return '';
}

function assertNoPii(contextLabel: string, value: string | null | undefined): void {
	if (containsEmailAddress(value)) {
		throw new Error(`PII guard triggered in ${contextLabel}: detected email-like string.`);
	}
}

function cleanStr(val: unknown): string | null {
	if (val === null || val === undefined) return null;
	const s = String(val).replace(/\r\n/g, '\n').trim();
	return s.length > 0 ? s : null;
}

function parseBoolYesNo(val: unknown, fallback = true): boolean {
	const s = cleanStr(val)?.toLowerCase();
	if (!s) return fallback;
	if (s === 'yes' || s === 'true' || s === '1' || s === 'active') return true;
	if (s === 'no' || s === 'false' || s === '0' || s === 'inactive') return false;
	return fallback;
}

/**
 * Simple RFC-4180 CSV parser handling quoted fields with commas/newlines.
 */
function parseCsv(content: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		const next = content[i + 1];
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
		} else if (ch === ',') {
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

	if (rows.length === 0) return [];
	const headers = rows[0].map((h) => h.trim());
	const records: Array<Record<string, string>> = [];
	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		if (row.every((c) => c.trim() === '')) continue;
		const rec: Record<string, string> = {};
		for (let c = 0; c < headers.length; c++) {
			rec[headers[c]] = (row[c] ?? '').trim();
		}
		records.push(rec);
	}
	return records;
}

function toWebAssetPath(rawPath: string | null | undefined): string | null {
	if (!rawPath) return null;
	const normalized = rawPath.replace(/\\/g, '/').trim();
	const idx = normalized.toLowerCase().indexOf('reference/');
	if (idx === -1) return null;
	return `/assets/Reference/${normalized.slice(idx + 'reference/'.length)}`;
}

async function readWorkbookSheets(xlsmPath: string) {
	const buffer = readFileSync(xlsmPath);
	const zip = await JSZip.loadAsync(buffer);
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		trimValues: false,
		parseTagValue: false
	});

	// 1. Shared strings table
	const sharedStrings: string[] = [];
	const ssFile = zip.file('xl/sharedStrings.xml');
	if (ssFile) {
		const ssXml = parser.parse(await ssFile.async('string'));
		const sis = asArray(ssXml?.sst?.si);
		for (const si of sis) {
			sharedStrings.push(collectXmlText(si));
		}
	}

	// 2. Workbook sheet registry and relationships
	const wbXml = parser.parse(await zip.file('xl/workbook.xml')!.async('string'));
	const relsXml = parser.parse(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));

	const relMap = new Map<string, string>();
	for (const rel of asArray(relsXml?.Relationships?.Relationship)) {
		const id = rel['@_Id'];
		const target = rel['@_Target'];
		if (id && target) {
			relMap.set(id, target);
		}
	}

	const sheets = new Map<string, Array<{ rowNum: number; cells: Map<number, string> }>>();
	for (const sheet of asArray(wbXml?.workbook?.sheets?.sheet)) {
		const name = sheet['@_name'] as string;
		const rid = sheet['@_r:id'] as string;
		const relTarget = relMap.get(rid);
		if (!name || !relTarget) continue;

		let zipTarget = relTarget.replace(/^\/+/, '');
		if (!zipTarget.startsWith('xl/')) {
			zipTarget = `xl/${zipTarget}`;
		}
		const sheetFile = zip.file(zipTarget);
		if (!sheetFile) continue;

		const sheetXml = parser.parse(await sheetFile.async('string'));
		const rowNodes = asArray(sheetXml?.worksheet?.sheetData?.row);
		const parsedRows: Array<{ rowNum: number; cells: Map<number, string> }> = [];

		for (const rowNode of rowNodes) {
			const rowNum = Number(rowNode['@_r'] ?? parsedRows.length + 1);
			const cellMap = new Map<number, string>();
			for (const cell of asArray<RawCellNode>(rowNode.c)) {
				const ref = cell['@_r'] ?? '';
				const colMatch = ref.match(/^[A-Z]+/);
				if (!colMatch) continue;
				const colIdx = colLettersToIndex(colMatch[0]);
				const type = cell['@_t'] ?? '';

				let val = '';
				if (type === 's' && cell.v !== undefined && cell.v !== null) {
					const idx = Number(collectXmlText(cell.v));
					val = sharedStrings[idx] ?? '';
				} else if (type === 'inlineStr' && cell.is !== undefined) {
					val = collectXmlText(cell.is);
				} else if (cell.v !== undefined && cell.v !== null) {
					val = collectXmlText(cell.v);
				}

				if (val !== '') {
					cellMap.set(colIdx, val);
				}
			}
			parsedRows.push({ rowNum, cells: cellMap });
		}

		sheets.set(name, parsedRows);
	}

	return sheets;
}

function sheetToObjects(
	rows: Array<{ rowNum: number; cells: Map<number, string> }>,
	headerRowIndex = 0
): Array<{ rowNum: number; data: Record<string, string> }> {
	if (rows.length <= headerRowIndex) return [];
	const headerRow = rows[headerRowIndex];
	const headers = new Map<number, string>();
	for (const [colIdx, val] of headerRow.cells.entries()) {
		const trimmed = val.trim();
		if (trimmed) headers.set(colIdx, trimmed);
	}

	const output: Array<{ rowNum: number; data: Record<string, string> }> = [];
	for (let i = headerRowIndex + 1; i < rows.length; i++) {
		const row = rows[i];
		const record: Record<string, string> = {};
		let hasAny = false;
		for (const [colIdx, header] of headers.entries()) {
			const val = row.cells.get(colIdx);
			if (val !== undefined && val !== '') {
				record[header] = val;
				hasAny = true;
			}
		}
		if (hasAny) {
			output.push({ rowNum: row.rowNum, data: record });
		}
	}
	return output;
}

function countPngFilesRecursive(dir: string): Set<string> {
	const results = new Set<string>();
	if (!existsSync(dir)) return results;

	const walk = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
				const rel = full.slice(dir.length).replace(/\\/g, '/').replace(/^\/+/, '');
				results.add(`/assets/Reference/${rel}`);
			}
		}
	};

	walk(dir);
	return results;
}

async function main() {
	if (!existsSync(DEFAULT_XLSM_PATH)) {
		throw new Error(`Workbook not found: ${DEFAULT_XLSM_PATH}`);
	}

	console.log(`Reading workbook: ${DEFAULT_XLSM_PATH}`);
	const sheets = await readWorkbookSheets(DEFAULT_XLSM_PATH);

	// Scan static/assets/Reference PNGs on disk
	const referenceDir = resolve(process.cwd(), 'static/assets/Reference');
	const pngsOnDisk = countPngFilesRecursive(referenceDir);
	console.log(`Reference PNGs found on disk: ${pngsOnDisk.size}`);

	// 1. Tube Reference (734 rows)
	const refRows = sheetToObjects(sheets.get('Tube Reference') ?? [], 0);
	const refKeyToId = new Map<string, string>();
	const tubeReferences: SeedPayload['tubeReferences'] = [];

	for (const { data } of refRows) {
		const tubeRefId = cleanStr(data['TubeRefID']);
		const designation = cleanDesignation(data['Reference Designation']);
		if (!tubeRefId || !designation) continue;

		const rawBasing = cleanStr(data['Basing Code']);
		const basingCodes = cleanBasingCodes(rawBasing);
		const basingCode = formatBasingCodeDisplay(rawBasing);

		let envelope = cleanStr(data['Envelope']);
		if (!envelope && rawBasing && /^S\d+/i.test(rawBasing)) {
			envelope = rawBasing.toUpperCase();
		}

		const rawStatus = cleanStr(data['Reference Status']) ?? 'Started';
		const tubeFamily = cleanStr(data['Tube Family']) ?? SUPPLEMENTAL_TUBE_FAMILY[tubeRefId] ?? null;

		const rowObj: SeedPayload['tubeReferences'][number] = {
			tubeRefId,
			referenceDesignation: designation,
			normalizedKey: normalizeDesignationKey(designation),
			referenceStatus: rawStatus,
			lookupStatus: cleanStr(data['Lookup Status']) ?? 'Active',
			tubeFamily,
			internalStructure: cleanStr(data['Internal Structure']),
			generalFunction: cleanStr(data['General Function']),
			base: cleanStr(data['Base']),
			pinCount: parsePinCount(data['Pin Count']),
			basingCode,
			basingCodes,
			envelope,
			cap: cleanStr(data['Cap']),
			heaterVoltage: cleanStr(data['Heater/Filament V']),
			heaterCurrent: cleanStr(data['Heater/Filament A']),
			heatingMethod: cleanStr(data['Heating Method']),
			maxDiameterIn: parseDimensionInches(data['Max Diameter (in)']),
			maxSeatedHeightIn: parseDimensionInches(data['Max Seated Height (in)']),
			maxOverallHeightIn: parseDimensionInches(data['Max Overall Height (in)']),
			technicalNotes: cleanStr(data['Technical Notes']),
			primarySource: cleanStr(data['Primary Source']),
			printedPage: cleanStr(data['Printed Page']),
			secondarySource: cleanStr(data['Secondary Source']),
			secondaryPage: cleanStr(data['Secondary Page']),
			verificationStatus: cleanStr(data['Verification Status'])
		};

		assertNoPii(`Tube Reference ${tubeRefId}`, rowObj.technicalNotes);
		tubeReferences.push(rowObj);

		const primaryKey = normalizeDesignationKey(designation);
		if (primaryKey && !refKeyToId.has(primaryKey)) {
			refKeyToId.set(primaryKey, tubeRefId);
		}
		for (const alias of splitDesignationAliases(designation)) {
			const k = normalizeDesignationKey(alias);
			if (k && !refKeyToId.has(k)) {
				refKeyToId.set(k, tubeRefId);
			}
		}
	}

	const validTubeRefIds = new Set(tubeReferences.map((r) => r.tubeRefId));

	// 2. Locations (A:F) and BoxLayers (H:K) on Locations sheet
	const rawLocationRows = sheets.get('Locations') ?? [];
	const locations: SeedPayload['locations'] = [];
	const boxLayers: SeedPayload['boxLayers'] = [];
	const seenBoxLayer = new Set<string>();

	for (let i = 1; i < rawLocationRows.length; i++) {
		const cells = rawLocationRows[i].cells;
		const locCode = cleanStr(cells.get(0));
		const locKind = cleanStr(cells.get(1));
		const locDesc = cleanStr(cells.get(2));
		if (locCode && locKind) {
			locations.push({
				locationCode: locCode,
				locationKind: locKind,
				description: locDesc ?? locCode,
				active: parseBoolYesNo(cells.get(3), true),
				reviewStatus: cleanStr(cells.get(4)),
				notes: cleanStr(cells.get(5))
			});
		}

		const box = cleanStr(cells.get(7));
		const layer = cleanStr(cells.get(8));
		if (box && layer) {
			const key = `${box}::${layer}`;
			if (!seenBoxLayer.has(key)) {
				seenBoxLayer.add(key);
				boxLayers.push({
					box,
					layer,
					active: parseBoolYesNo(cells.get(9), true),
					notes: cleanStr(cells.get(10))
				});
			}
		}
	}

	// 3. PSARA Inventory (1,217 lots — ignore summary columns K/L Grand Total)
	const invRows = sheetToObjects(sheets.get('PSARA Inventory') ?? [], 0);
	const inventoryLots: SeedPayload['inventoryLots'] = [];
	for (const { rowNum, data } of invRows) {
		const tubeNumber = cleanStr(data['Tube Number']);
		const canonicalRaw = cleanStr(data['Canonical Designation']) ?? tubeNumber;
		if (!tubeNumber || !canonicalRaw) continue;

		const canonicalDesignation = cleanDesignation(canonicalRaw);
		const { quantity, quantityUnknown } = parseQuantity(data['Quant']);
		const rawRefId = cleanStr(data['TubeRefID']);
		const tubeRefId = rawRefId && validTubeRefIds.has(rawRefId) ? rawRefId : null;

		const comment = cleanStr(data['Comment']);
		assertNoPii(`PSARA Inventory row ${rowNum}`, comment);

		inventoryLots.push({
			sourceRow: rowNum,
			tubeNumber,
			canonicalDesignation,
			normalizedKey: normalizeDesignationKey(canonicalDesignation),
			boxNo: cleanStr(data['Box No.']),
			quantity,
			quantityUnknown,
			boxLayer: cleanStr(data['box layer']),
			comment,
			tubeRefId,
			stockCondition: normalizeStockCondition(data['Stock Condition']),
			testStatus: normalizeTestStatus(data['Test Status'])
		});
	}

	// 4. Relationships (197 rows)
	const relRows = sheetToObjects(sheets.get('Relationships') ?? [], 0);
	const relationships: SeedPayload['relationships'] = [];
	for (const { rowNum, data } of relRows) {
		const designation = cleanDesignation(data['Designation']);
		const relatedDesignation = cleanDesignation(data['Related Designation']);
		if (!designation || !relatedDesignation) continue;

		const srcRowRaw = cleanStr(data['Inventory Source Row']);
		const srcRow = srcRowRaw && /^\d+$/.test(srcRowRaw) ? Number(srcRowRaw) : null;
		const sourceTubeRefId = refKeyToId.get(normalizeDesignationKey(designation)) ?? null;
		const targetTubeRefId = refKeyToId.get(normalizeDesignationKey(relatedDesignation)) ?? null;

		const qualificationNotes = cleanStr(data['Qualification/Notes']);
		const originalNote = cleanStr(data['Original Note']);
		assertNoPii(`Relationships row ${rowNum}`, qualificationNotes);
		assertNoPii(`Relationships row ${rowNum}`, originalNote);

		relationships.push({
			inventorySourceRow: srcRow,
			designation,
			relatedDesignation,
			sourceTubeRefId,
			targetTubeRefId,
			relationship: cleanStr(data['Relationship']) ?? 'Related',
			direction: cleanStr(data['Direction']) ?? 'Related only',
			differenceType: cleanStr(data['Difference Type']),
			qualificationNotes,
			source: cleanStr(data['Source']),
			sourcePage: cleanStr(data['Source Page']),
			originalNote,
			verificationStatus: cleanStr(data['Verification Status'])
		});
	}

	// 5. Lists, Filament_heater_options, Functional_elements
	const listRows = sheetToObjects(sheets.get('Lists') ?? [], 0);
	const controlledLists: SeedPayload['controlledLists'] = [];
	const seenListVal = new Set<string>();
	listRows.forEach(({ data }, idx) => {
		const listName = cleanStr(data['List Name']);
		const value = cleanStr(data['Value']);
		if (!listName || !value) return;
		const key = `${listName}::${value}`;
		if (seenListVal.has(key)) return;
		seenListVal.add(key);
		controlledLists.push({
			listName,
			value,
			definitionUse: cleanStr(data['Definition / Use']),
			sourceBasis: cleanStr(data['Source Basis']),
			sortOrder: idx + 1
		});
	});

	const filRows = sheetToObjects(sheets.get('Filament_heater_options') ?? [], 0);
	const filamentHeaterOptions: SeedPayload['filamentHeaterOptions'] = [];
	for (const { data } of filRows) {
		const baseGroup = cleanStr(data['base_group']);
		const option = cleanStr(data['filament_heater_option']);
		if (!baseGroup || !option) continue;
		filamentHeaterOptions.push({
			listName: cleanStr(data['List Name']) ?? 'Filament_heater_options',
			baseGroup,
			optionOrder: Number(data['option_order'] ?? 0) || 0,
			filamentHeaterOption: option,
			pin1: cleanStr(data['pin_1']),
			pin2: cleanStr(data['pin_2']),
			thirdPinOrTap: cleanStr(data['third_pin_or_tap']),
			treeBehavior: cleanStr(data['tree_behavior']),
			defaultAssumption: parseBoolYesNo(data['default_assumption'], false),
			notes: cleanStr(data['notes'])
		});
	}

	const funcRows = sheetToObjects(sheets.get('Functional_elements') ?? [], 0);
	const functionalElements: SeedPayload['functionalElements'] = [];
	for (const { data } of funcRows) {
		const elem = cleanStr(data['functional_element']);
		if (!elem) continue;
		functionalElements.push({
			listName: cleanStr(data['List Name']) ?? 'Functional_elements',
			tier: cleanStr(data['tier']) ?? 'Core',
			optionOrder: Number(data['option_order'] ?? 0) || 0,
			functionalElement: elem,
			symbol: cleanStr(data['symbol']),
			recommendedForMainOptions: parseBoolYesNo(data['recommended_for_main_options'], false),
			functionDescription: cleanStr(data['function']),
			notes: cleanStr(data['notes'])
		});
	}

	// 6. Diagram Assets (Basing Diagrams + Envelope Outlines + manifest CSVs)
	const diagramMap = new Map<string, SeedPayload['diagramAssets'][number]>();

	const basingRows = sheetToObjects(sheets.get('Basing Diagrams') ?? [], 0);
	for (const { data } of basingRows) {
		const code = cleanStr(data['Basing Code']);
		const assetPath =
			toWebAssetPath(data['Reference Image Path']) ?? toWebAssetPath(data['Runtime Image Path']);
		if (!code || !assetPath) continue;
		diagramMap.set(assetPath, {
			category: 'Basing',
			code,
			lookupKey: normalizeBasingLookupKey(code),
			assetPath,
			source: cleanStr(data['Preferred Source']),
			printedPage: cleanStr(data['Printed Page']),
			alternateCode: cleanStr(data['Alternate / Equivalent Code']),
			envelopeShape: null,
			baseLabel: null,
			cap: null,
			notes: cleanStr(data['Notes'])
		});
	}

	const envRows = sheetToObjects(sheets.get('Envelope Outlines') ?? [], 0);
	for (const { data } of envRows) {
		const code = cleanStr(data['RCA Outline']);
		const assetPath =
			toWebAssetPath(data['Reference Image Path']) ?? toWebAssetPath(data['Runtime Image Path']);
		if (!code || !assetPath) continue;
		diagramMap.set(assetPath, {
			category: 'Envelope',
			code,
			lookupKey: code.toUpperCase(),
			assetPath,
			source: cleanStr(data['Source']),
			printedPage: cleanStr(data['RCA Printed Page']),
			alternateCode: null,
			envelopeShape: cleanStr(data['Envelope / Shape']),
			baseLabel: cleanStr(data['Base Label']),
			cap: cleanStr(data['Cap']),
			notes: cleanStr(data['Notes'])
		});
	}

	if (existsSync(DEFAULT_MANIFEST_PATH)) {
		const manifestRecords = parseCsv(readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'));
		for (const rec of manifestRecords) {
			const assetPath = toWebAssetPath(rec['filename']);
			const code = cleanStr(rec['identifier']);
			const category = cleanStr(rec['category']) ?? 'Basing';
			if (!assetPath || !code || diagramMap.has(assetPath)) continue;
			diagramMap.set(assetPath, {
				category,
				code,
				lookupKey:
					category === 'Basing' ? normalizeBasingLookupKey(code) : code.toUpperCase(),
				assetPath,
				source: cleanStr(rec['source']),
				printedPage: cleanStr(rec['printed_page']),
				alternateCode: null,
				envelopeShape: null,
				baseLabel: null,
				cap: null,
				notes: cleanStr(rec['status'])
			});
		}
	}

	if (existsSync(DEFAULT_TUNGSOL_CSV_PATH)) {
		const tungsolRecords = parseCsv(readFileSync(DEFAULT_TUNGSOL_CSV_PATH, 'utf8'));
		for (const rec of tungsolRecords) {
			const assetPath = toWebAssetPath(rec['PNG_Path']);
			const code = cleanStr(rec['Identifier']);
			if (!assetPath || !code || diagramMap.has(assetPath)) continue;
			diagramMap.set(assetPath, {
				category: 'Envelope',
				code: `TS-${code}`,
				lookupKey: `TS-${code}`.toUpperCase(),
				assetPath,
				source: cleanStr(rec['Source']),
				printedPage: cleanStr(rec['Printed_Page']),
				alternateCode: null,
				envelopeShape: cleanStr(rec['Envelope_Shape']),
				baseLabel: null,
				cap: null,
				notes: cleanStr(rec['Notes'])
			});
		}
	}

	const diagramAssets = Array.from(diagramMap.values());
	const missingAssets = diagramAssets.filter((d) => !pngsOnDisk.has(d.assetPath));
	if (missingAssets.length > 0) {
		throw new Error(
			`Found ${missingAssets.length} diagram asset paths missing from ${referenceDir}. First: ${missingAssets[0].assetPath}`
		);
	}

	// Verify Basing code match coverage across Active Tube References
	const availableBasingKeys = new Set(
		diagramAssets.filter((d) => d.category === 'Basing').map((d) => d.lookupKey)
	);
	let basingMatchCount = 0;
	for (const ref of tubeReferences) {
		const matched = ref.basingCodes.some((code) =>
			availableBasingKeys.has(normalizeBasingLookupKey(code))
		);
		if (matched) basingMatchCount++;
	}

	// 7. Acquisition Entries
	const acqRows = sheetToObjects(sheets.get('Acquisition Entries') ?? [], 0);
	const acquisitionEntries: SeedPayload['acquisitionEntries'] = [];
	for (const { rowNum, data } of acqRows) {
		const entryId = cleanStr(data['Entry ID']);
		if (!entryId) continue;
		const rawRef = cleanStr(data['Selected TubeRefID']);
		const qtyNum = Number(data['Quantity'] ?? '');
		const notes = cleanStr(data['Notes']);
		assertNoPii(`Acquisition Entries row ${rowNum}`, notes);

		acquisitionEntries.push({
			entryId,
			enteredAt: excelSerialToIso(data['Entered At']),
			status: cleanStr(data['Status']) ?? 'Recorded',
			selectedTubeRefId: rawRef && validTubeRefIds.has(rawRef) ? rawRef : null,
			observedDesignation: cleanStr(data['Observed Designation']),
			quantity: Number.isFinite(qtyNum) && qtyNum > 0 ? Math.trunc(qtyNum) : null,
			location: cleanStr(data['Location']),
			layer: cleanStr(data['Layer']),
			envelope: cleanStr(data['Envelope']),
			base: cleanStr(data['Base']),
			cap: cleanStr(data['Cap']),
			basingCode: formatBasingCodeDisplay(data['Basing Code']),
			baseMaterial: cleanStr(data['Base Material']),
			rcaOutline: cleanStr(data['RCA Outline']),
			diameterIn: parseDimensionInches(data['Diameter in']),
			heightIn: parseDimensionInches(data['Height in']),
			notes,
			referenceChanges: cleanStr(data['Reference Changes']),
			source: cleanStr(data['Source']),
			sourcePage: cleanStr(data['Source Page']),
			originalReferenceSnapshot: cleanStr(data['Original Reference Snapshot']),
			stockCondition: normalizeStockCondition(data['Stock Condition']),
			testStatus: normalizeTestStatus(data['Test Status'])
		});
	}

	// 8. Batch Import (header on row 5 -> headerRowIndex = 4)
	const batchSheetRows = sheets.get('Batch Import') ?? [];
	const batchHeaderIdx = batchSheetRows.findIndex(
		(r) => r.cells.get(0)?.trim() === 'Reading ID'
	);
	const batchRows =
		batchHeaderIdx >= 0 ? sheetToObjects(batchSheetRows, batchHeaderIdx) : [];
	const batchImportRows: SeedPayload['batchImportRows'] = [];
	const seenSignatures = new Set<string>();

	for (const { rowNum, data } of batchRows) {
		const readingId = cleanStr(data['Reading ID']);
		const sourceSignature = cleanStr(data['Source Signature']);
		if (!readingId || !sourceSignature || seenSignatures.has(sourceSignature)) continue;
		seenSignatures.add(sourceSignature);

		const rawRef = cleanStr(data['Selected TubeRefID']);
		const qtyNum = Number(data['Qty'] ?? '');
		const importQtyNum = Number(data['Import Qty'] ?? '');
		const notes = cleanStr(data['Notes']);
		assertNoPii(`Batch Import row ${rowNum}`, notes);

		batchImportRows.push({
			readingId,
			sourceSignature,
			box: cleanStr(data['Box']),
			layer: cleanStr(data['Layer']),
			rowNum: cleanStr(data['Row']),
			colNum: cleanStr(data['Col']),
			brand: cleanStr(data['Brand']),
			tube: cleanStr(data['Tube']),
			qty: Number.isFinite(qtyNum) && data['Qty'] ? Math.trunc(qtyNum) : null,
			confidence: cleanStr(data['Confidence']),
			labelType: cleanStr(data['Label Type']),
			stockCondition: normalizeStockCondition(data['Stock Condition']),
			testStatus: normalizeTestStatus(data['Test Status']),
			itemCategory: cleanStr(data['Item Category']),
			checkFlag: cleanStr(data['Check']),
			notes,
			sourceImage: cleanStr(data['Source Image']),
			importTube: cleanStr(data['Import Tube']),
			importQty:
				Number.isFinite(importQtyNum) && data['Import Qty']
					? Math.trunc(importQtyNum)
					: null,
			importBox: cleanStr(data['Import Box']),
			importLayer: cleanStr(data['Import Layer']),
			importStock: normalizeStockCondition(data['Import Stock']),
			importTest: normalizeTestStatus(data['Import Test']),
			importEnvelope: cleanStr(data['Import Envelope']),
			reviewed: parseBoolYesNo(data['Reviewed'], false),
			selectedTubeRefId: rawRef && validTubeRefIds.has(rawRef) ? rawRef : null,
			importStatus: cleanStr(data['Import Status']) ?? 'Pending',
			reasonOrCandidates: cleanStr(data['Reason / Candidates']),
			acquisitionId: cleanStr(data['Acquisition ID']),
			importedAt: excelSerialToIso(data['Imported At']),
			sourceDetails: cleanStr(data['Source Details'])
		});
	}

	// 9. Review Queue
	const revRows = sheetToObjects(sheets.get('Review') ?? [], 0);
	const reviewQueue: SeedPayload['reviewQueue'] = [];
	for (const { data } of revRows) {
		const issue = cleanStr(data['Issue']);
		const field = cleanStr(data['Field']);
		if (!issue && !field) continue;
		const refRowRaw = cleanStr(data['Reference Row']);
		const rawRef = cleanStr(data['TubeRefID']);
		reviewQueue.push({
			sheet: cleanStr(data['Sheet']),
			referenceRow: refRowRaw && /^\d+$/.test(refRowRaw) ? Number(refRowRaw) : null,
			field,
			currentValue: cleanStr(data['Current Value']),
			issue,
			suggestedAction: cleanStr(data['Suggested Action']),
			status: cleanStr(data['Status']) ?? 'Examine',
			tubeRefId: rawRef && validTubeRefIds.has(rawRef) ? rawRef : null
		});
	}

	const payload: SeedPayload = {
		metadata: {
			generatedAt: new Date().toISOString(),
			sourceWorkbook: 'PSARA_Tube_Inventory_Ready_For_VBA_inc_boxes_TEST.xlsm',
			totalReferencePngsFound: pngsOnDisk.size,
			basingMatchCount
		},
		tubeReferences,
		locations,
		boxLayers,
		inventoryLots,
		relationships,
		controlledLists,
		filamentHeaterOptions,
		functionalElements,
		diagramAssets,
		acquisitionEntries,
		batchImportRows,
		reviewQueue
	};

	const outPath = resolve(process.cwd(), 'seed/psara_seed.json');
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

	const unknownQtyLots = inventoryLots.filter((l) => l.quantityUnknown).length;
	const unidentifiedRefs = tubeReferences.filter((r) => r.lookupStatus === 'Unidentified').length;
	const totalKnownQty = inventoryLots.reduce((acc, l) => acc + (l.quantity ?? 0), 0);

	console.log('Seed extraction complete:', {
		outPath,
		tubeReferences: tubeReferences.length,
		unidentifiedRefs,
		inventoryLots: inventoryLots.length,
		unknownQtyLots,
		totalKnownQty,
		relationships: relationships.length,
		locations: locations.length,
		boxLayers: boxLayers.length,
		controlledLists: controlledLists.length,
		filamentHeaterOptions: filamentHeaterOptions.length,
		functionalElements: functionalElements.length,
		diagramAssets: diagramAssets.length,
		basingMatchCount,
		acquisitionEntries: acquisitionEntries.length,
		batchImportRows: batchImportRows.length,
		reviewQueue: reviewQueue.length
	});
}

main().catch((err) => {
	console.error('Seed extraction failed:', err);
	process.exit(1);
});
