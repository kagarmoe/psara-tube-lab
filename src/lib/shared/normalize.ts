/**
 * Pure normalization and workbook cleanup helpers shared across seed extraction,
 * server queries, and client display formatting.
 */

const VULGAR_FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125,
	'⅜': 0.375,
	'⅝': 0.625,
	'⅞': 0.875,
	'¹⁄₂': 0.5,
	'¹⁄₄': 0.25,
	'³⁄₄': 0.75
};

const BASING_TYPO_MAP: Record<string, string> = {
	'5B0': '5BO',
	'9 CA': '9CA'
};

/**
 * Clean a tube designation string for consistent display while preserving
 * slashes and punctuation used in canonical designations.
 */
export function cleanDesignation(raw: string | null | undefined): string {
	if (!raw) return '';
	return raw
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toUpperCase();
}

/**
 * Compute a punctuation-free uppercase key used for exact / prefix matching.
 */
export function normalizeDesignationKey(raw: string | null | undefined): string {
	return cleanDesignation(raw).replace(/[^A-Z0-9]/g, '');
}

/**
 * Extract individual designation tokens from slash-delimited composite names
 * (e.g. "6CG7/6FQ7" -> ["6CG7", "6FQ7"]).
 */
export function splitDesignationAliases(raw: string | null | undefined): string[] {
	const cleaned = cleanDesignation(raw);
	if (!cleaned) return [];
	const parts = cleaned
		.split(/[\/;,]/)
		.map((part) => part.replace(/\([^)]*\)/g, '').trim())
		.filter(Boolean);
	return Array.from(new Set(parts));
}

/**
 * Parse decimal or fractional inch dimensions (e.g. "1 3/16", "14/16", "1.3125").
 * Returns null for empty, "N/A", "?", or unparseable values.
 */
export function parseDimensionInches(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw === 'number') {
		return Number.isFinite(raw) ? raw : null;
	}

	let text = raw
		.replace(/["'”″]/g, '')
		.replace(/\bin(?:ches)?\.?\b/gi, '')
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.trim();

	if (!text || /^(n\/a|na|none|unknown|\?|-+)$/i.test(text)) {
		return null;
	}

	for (const [glyph, value] of Object.entries(VULGAR_FRACTIONS)) {
		if (text.includes(glyph)) {
			const replaced = text.replace(glyph, '').trim();
			if (!replaced) return roundDimension(value);
			const baseNum = Number(replaced);
			if (Number.isFinite(baseNum)) {
				return roundDimension(baseNum + value);
			}
		}
	}

	// Mixed number: e.g. "1 3/16" or "1-3/16"
	const mixedMatch = text.match(/^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/);
	if (mixedMatch) {
		const whole = Number(mixedMatch[1]);
		const num = Number(mixedMatch[2]);
		const den = Number(mixedMatch[3]);
		if (den !== 0) {
			return roundDimension(whole + num / den);
		}
	}

	// Simple fraction: e.g. "14/16"
	const fracMatch = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
	if (fracMatch) {
		const num = Number(fracMatch[1]);
		const den = Number(fracMatch[2]);
		if (den !== 0) {
			return roundDimension(num / den);
		}
	}

	const numeric = Number(text);
	return Number.isFinite(numeric) ? roundDimension(numeric) : null;
}

function roundDimension(val: number): number {
	return Math.round(val * 100000) / 100000;
}

/**
 * Convert inches to millimeters for the accessible metric toggle.
 */
export function inchesToMm(inches: number | null | undefined, decimals = 1): number | null {
	if (inches === null || inches === undefined || !Number.isFinite(inches)) {
		return null;
	}
	const factor = 10 ** decimals;
	return Math.round(inches * 25.4 * factor) / factor;
}

/**
 * Clean a Basing Code cell from Tube Reference into an array of canonical codes.
 * Fixes known typos ("5B0" -> "5BO", "9 CA" -> "9CA"), splits multi-code cells
 * ("9AJ / 9LP" -> ["9AJ", "9LP"]), and filters stray envelope codes (e.g. "S14").
 */
export function cleanBasingCodes(raw: string | null | undefined): string[] {
	if (!raw) return [];
	const trimmed = raw.trim();
	if (!trimmed || /^(n\/a|none|unknown|\?|-+)$/i.test(trimmed)) {
		return [];
	}

	const parts = trimmed
		.split(/[\/,;]+/)
		.map((part) => part.trim().replace(/\s+/g, ' ').toUpperCase())
		.filter(Boolean);

	const cleaned: string[] = [];
	for (const part of parts) {
		const mapped = BASING_TYPO_MAP[part] ?? part.replace(/\s+/g, '');
		// Stray envelope descriptors (like S14/s14) belong in envelope, not basing codes
		if (/^S\d+[A-Z]?$/i.test(mapped) || /^T-?\d+/i.test(mapped) || /^ST-?\d+/i.test(mapped)) {
			continue;
		}
		if (mapped && !cleaned.includes(mapped)) {
			cleaned.push(mapped);
		}
	}

	return cleaned;
}

/**
 * Format cleaned basing codes back into a clean canonical display string.
 */
export function formatBasingCodeDisplay(raw: string | null | undefined): string | null {
	const codes = cleanBasingCodes(raw);
	return codes.length > 0 ? codes.join(' / ') : null;
}

/**
 * Normalize a basing code into an image lookup key matching diagram assets:
 * uppercase, trim, strip leading "G-", and strip hyphens/whitespace.
 */
export function normalizeBasingLookupKey(raw: string | null | undefined): string {
	if (!raw) return '';
	let key = raw.trim().toUpperCase().replace(/\s+/g, '');
	if (key.startsWith('G-')) {
		key = key.slice(2);
	}
	return key.replace(/-/g, '');
}

/**
 * Normalize lot Test Status values ("tested" -> "Tested", "untested" -> "Untested").
 */
export function normalizeTestStatus(raw: string | null | undefined): string {
	const cleaned = (raw ?? '').trim();
	if (!cleaned) return 'Unknown';
	const lower = cleaned.toLowerCase();
	if (lower === 'tested' || lower === 'good' || lower === 'pass' || lower === 'ok') {
		return lower === 'tested' ? 'Tested' : 'Good';
	}
	if (lower === 'untested' || lower === 'not tested') return 'Untested';
	if (lower === 'bad' || lower === 'dead' || lower === 'fail' || lower === 'failed') return 'Bad';
	if (lower === 'weak' || lower === 'marginal') return 'Weak';
	if (lower === 'unknown' || lower === '?') return 'Unknown';
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Normalize lot Stock Condition values ("nos" -> "NOS", "used" -> "Used").
 */
export function normalizeStockCondition(raw: string | null | undefined): string {
	const cleaned = (raw ?? '').trim();
	if (!cleaned) return 'Unknown';
	const lower = cleaned.toLowerCase();
	if (lower === 'nos' || lower === 'new' || lower === 'new old stock') return 'NOS';
	if (lower === 'used') return 'Used';
	if (lower === 'unknown' || lower === '?') return 'Unknown';
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Parse inventory lot quantity, flagging "?" or unknown text separately from valid counts.
 */
export function parseQuantity(raw: unknown): {
	quantity: number | null;
	quantityUnknown: boolean;
} {
	if (raw === null || raw === undefined) {
		return { quantity: null, quantityUnknown: false };
	}
	if (typeof raw === 'number') {
		if (!Number.isFinite(raw)) return { quantity: null, quantityUnknown: false };
		return { quantity: Math.trunc(raw), quantityUnknown: false };
	}
	const text = String(raw).trim();
	if (!text) return { quantity: null, quantityUnknown: false };
	if (text === '?' || /^unknown$/i.test(text)) {
		return { quantity: null, quantityUnknown: true };
	}
	const parsed = Number(text);
	if (Number.isFinite(parsed)) {
		return { quantity: Math.trunc(parsed), quantityUnknown: false };
	}
	return { quantity: null, quantityUnknown: true };
}

/**
 * Parse integer pin count from workbook text/numbers.
 */
export function parsePinCount(raw: unknown): number | null {
	if (raw === null || raw === undefined) return null;
	const text = String(raw).trim();
	if (!text || /^(n\/a|unknown|\?)$/i.test(text)) return null;
	const match = text.match(/\d+/);
	if (!match) return null;
	const num = Number(match[0]);
	return Number.isInteger(num) ? num : null;
}

/**
 * Convert an Excel serial timestamp (e.g. 46349.723067129627) into an ISO string,
 * or return cleaned string if already text.
 */
export function excelSerialToIso(raw: string | number | null | undefined): string | null {
	if (raw === null || raw === undefined) return null;
	const text = String(raw).trim();
	if (!text) return null;
	const num = Number(text);
	if (Number.isFinite(num) && num > 20000 && num < 80000) {
		const utcMs = Math.round((num - 25569) * 86400 * 1000);
		return new Date(utcMs).toISOString();
	}
	return text;
}

/**
 * Build a deterministic length-prefixed signature matching Marc's VBA Batch Import
 * `Source Signature` encoding (`<klen>:<key><vlen>:<value>`).
 */
export function buildSourceSignature(
	fields: Array<[string, string | number | null | undefined]>
): string {
	return fields
		.map(([k, v]) => {
			const key = String(k).trim();
			const val = v === null || v === undefined ? '' : String(v).trim();
			if (!key || !val) return '';
			return `${key.length}:${key}${val.length}:${val}`;
		})
		.filter(Boolean)
		.join('');
}

/**
 * Return true if any string looks like an email address (used as a PII safety guard
 * during seed extraction).
 */
export function containsEmailAddress(text: string | null | undefined): boolean {
	if (!text) return false;
	return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}
