import { normalizeEnvelopeShapeKey } from './tube-logic';

export interface MysteryCandidateInput {
	tubeRefId: string;
	referenceDesignation: string;
	lookupStatus: string;
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
	heatingMethod: string | null;
	maxDiameterIn: number | null;
	maxSeatedHeightIn: number | null;
	maxOverallHeightIn: number | null;
	technicalNotes: string | null;
	totalQty: number;
	hasUnknownQty: boolean;
}

export interface MysteryQueryInput {
	pinCount?: number | null;
	baseGroup?: string | null;
	exactBase?: string | null;
	topCap?: 'any' | 'yes' | 'no';
	envelope?: string | null;
	diameterIn?: number | null;
	diameterToleranceIn?: number;
	heightIn?: number | null;
	heightToleranceIn?: number;
	heatingMethod?: 'any' | 'indirect' | 'direct' | 'cold';
	heaterVoltage?: string | null;
	functionalElements?: string[];
	inStockOnly?: boolean;
	notesKeyword?: string;
}

export interface MysteryCandidateMatch {
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
	heatingMethod: string | null;
	maxDiameterIn: number | null;
	maxSeatedHeightIn: number | null;
	maxOverallHeightIn: number | null;
	totalQty: number;
	hasUnknownQty: boolean;
	score: number;
	matchedCriteria: string[];
	warnings: string[];
}

export function mapBaseToFilamentGroup(base: string | null | undefined): string | null {
	if (!base) return null;
	const b = base.toLowerCase();
	if (b.includes('7-pin') && b.includes('miniature')) return '7-pin miniature';
	if (b.includes('9-pin') && (b.includes('miniature') || b.includes('novar')))
		return '9-pin miniature';
	if (b.includes('octal') || b.includes('loctal') || b.includes('loktal')) return 'Octal';
	if (b.includes('4-pin') || b.includes('ux 4')) return 'Old 4-pin';
	if (b.includes('5-pin') || b.includes('uy')) return 'Old 5-pin';
	if (b.includes('6-pin') || b.includes('ux6')) return 'Old 6-pin';
	if (b.includes('7-pin') && (b.includes('large') || b.includes('ux7'))) return 'Old large 7-pin';
	return null;
}

function tubeHasTopCap(cap: string | null | undefined): boolean {
	if (!cap) return false;
	const c = cap.trim().toLowerCase();
	return Boolean(c && c !== 'none' && c !== 'n/a' && c !== 'no');
}

function matchesFunctionalClue(
	clue: string,
	candidate: MysteryCandidateInput,
	textBlob: string
): boolean {
	const c = clue.toLowerCase();
	if (c.includes('plate') && !c.includes('diode')) {
		return textBlob.length > 0; // Nearly all vacuum tubes have a plate
	}
	if (c.includes('cathode')) {
		return (candidate.heatingMethod ?? '').toLowerCase().includes('indirect');
	}
	if (c.includes('grid 1')) {
		return (
			textBlob.includes('triode') ||
			textBlob.includes('tetrode') ||
			textBlob.includes('pentode') ||
			textBlob.includes('heptode') ||
			textBlob.includes('pentagrid') ||
			textBlob.includes('beam power')
		);
	}
	if (c.includes('grid 2')) {
		return (
			textBlob.includes('tetrode') ||
			textBlob.includes('pentode') ||
			textBlob.includes('heptode') ||
			textBlob.includes('pentagrid') ||
			textBlob.includes('beam power')
		);
	}
	if (c.includes('grid 3')) {
		return (
			textBlob.includes('pentode') ||
			textBlob.includes('heptode') ||
			textBlob.includes('pentagrid')
		);
	}
	if (c.includes('grid 4') || c.includes('grid 5')) {
		return textBlob.includes('heptode') || textBlob.includes('pentagrid') || textBlob.includes('hexode');
	}
	if (c.includes('diode plate')) {
		return textBlob.includes('diode') || textBlob.includes('rectifier');
	}
	if (c.includes('beam-forming') || c.includes('beam-confining')) {
		return textBlob.includes('beam');
	}
	if (c.includes('target')) {
		return textBlob.includes('tuning') || textBlob.includes('indicator') || textBlob.includes('eye');
	}
	if (c.includes('starter anode')) {
		return (
			(candidate.heatingMethod ?? '').toLowerCase().includes('cold') ||
			textBlob.includes('gas') ||
			textBlob.includes('regulator') ||
			textBlob.includes('thyratron')
		);
	}
	if (c.includes('metal shell') || c.includes('external shield')) {
		return (
			(candidate.envelope ?? '').toUpperCase().startsWith('MT') ||
			textBlob.includes('metal')
		);
	}
	if (c.includes('internal shield')) {
		return textBlob.includes('shield') || textBlob.includes('pentode') || textBlob.includes('twin');
	}
	return textBlob.includes(c);
}

/**
 * Deterministic scoring engine for unmarked / mystery vacuum tubes.
 * Strictly excludes `Unidentified` quarantined records.
 */
export function rankMysteryTubeCandidates(
	candidates: MysteryCandidateInput[],
	query: MysteryQueryInput,
	limit = 40
): MysteryCandidateMatch[] {
	const diamTol = query.diameterToleranceIn ?? 0.15;
	const heightTol = query.heightToleranceIn ?? 0.35;
	const targetEnvKey = normalizeEnvelopeShapeKey(query.envelope);
	const keyword = (query.notesKeyword ?? '').trim().toLowerCase();
	const heaterV = (query.heaterVoltage ?? '').trim().toLowerCase();
	const selectedElements = query.functionalElements ?? [];

	const scored: MysteryCandidateMatch[] = [];

	for (const ref of candidates) {
		if (ref.lookupStatus === 'Unidentified') continue;
		if (query.inStockOnly && ref.totalQty <= 0 && !ref.hasUnknownQty) continue;

		// Hard physical filters when explicitly specified
		if (query.topCap === 'yes' && !tubeHasTopCap(ref.cap)) continue;
		if (query.topCap === 'no' && tubeHasTopCap(ref.cap)) continue;

		if (
			query.pinCount !== null &&
			query.pinCount !== undefined &&
			ref.pinCount !== null &&
			ref.pinCount !== query.pinCount
		) {
			continue;
		}

		if (query.exactBase && ref.base && ref.base.toLowerCase() !== query.exactBase.toLowerCase()) {
			continue;
		}

		let points = 0;
		let possible = 0;
		const matchedCriteria: string[] = [];
		const warnings: string[] = [];

		// 1. Pin Count (weight 25)
		if (query.pinCount !== null && query.pinCount !== undefined) {
			possible += 25;
			if (ref.pinCount === query.pinCount) {
				points += 25;
				matchedCriteria.push(`${query.pinCount} pins`);
			} else {
				warnings.push('Pin count missing in manual');
			}
		}

		// 2. Base / Socket Family (weight 20)
		if (query.exactBase) {
			possible += 20;
			if (ref.base?.toLowerCase() === query.exactBase.toLowerCase()) {
				points += 20;
				matchedCriteria.push(`Base: ${ref.base}`);
			} else {
				warnings.push('Base style unverified in manual');
			}
		} else if (query.baseGroup) {
			possible += 20;
			const group = mapBaseToFilamentGroup(ref.base);
			if (group === query.baseGroup) {
				points += 20;
				matchedCriteria.push(`Socket group: ${query.baseGroup}`);
			} else if (!ref.base) {
				warnings.push('Base style missing in manual');
			} else {
				continue; // Explicit base group mismatch
			}
		}

		// 3. Top Cap check (weight 10)
		if (query.topCap === 'yes' || query.topCap === 'no') {
			possible += 10;
			points += 10;
			matchedCriteria.push(query.topCap === 'yes' ? `Top cap (${ref.cap})` : 'No top cap');
		}

		// 4. Envelope shape match (weight 15)
		if (targetEnvKey) {
			possible += 15;
			const refEnvKey = normalizeEnvelopeShapeKey(ref.envelope);
			if (refEnvKey && refEnvKey === targetEnvKey) {
				points += 15;
				matchedCriteria.push(`Envelope ${ref.envelope}`);
			} else if (refEnvKey && (refEnvKey.includes(targetEnvKey) || targetEnvKey.includes(refEnvKey))) {
				points += 10;
				matchedCriteria.push(`Similar envelope (${ref.envelope})`);
			} else if (ref.envelope) {
				warnings.push(`Listed envelope is ${ref.envelope}`);
			}
		}

		// 5. Measured Diameter tolerance (weight 15)
		if (query.diameterIn !== null && query.diameterIn !== undefined) {
			possible += 15;
			if (ref.maxDiameterIn !== null) {
				const diff = Math.abs(ref.maxDiameterIn - query.diameterIn);
				if (diff <= diamTol) {
					points += 15;
					matchedCriteria.push(`Diameter within ±${diamTol} in (${ref.maxDiameterIn} in)`);
				} else if (diff <= diamTol * 2) {
					points += 6;
					warnings.push(`Diameter differs by ${diff.toFixed(2)} in (spec ${ref.maxDiameterIn} in)`);
				} else {
					continue; // Outside generous 2x physical envelope tolerance
				}
			} else {
				warnings.push('Diameter not listed in manual');
			}
		}

		// 6. Measured Height tolerance vs Seated / Overall (weight 15)
		if (query.heightIn !== null && query.heightIn !== undefined) {
			possible += 15;
			const heights = [ref.maxSeatedHeightIn, ref.maxOverallHeightIn].filter(
				(v): v is number => v !== null
			);
			if (heights.length > 0) {
				const bestDiff = Math.min(...heights.map((h) => Math.abs(h - query.heightIn!)));
				if (bestDiff <= heightTol) {
					points += 15;
					matchedCriteria.push(`Height within ±${heightTol} in`);
				} else if (bestDiff <= heightTol * 2) {
					points += 6;
					warnings.push(`Height differs by ${bestDiff.toFixed(2)} in`);
				} else {
					continue;
				}
			} else {
				warnings.push('Height not listed in manual');
			}
		}

		// 7. Heating Method & Voltage (weight 10 each)
		if (query.heatingMethod && query.heatingMethod !== 'any') {
			possible += 10;
			const hm = (ref.heatingMethod ?? '').toLowerCase();
			const ok =
				(query.heatingMethod === 'indirect' && hm.includes('indirect')) ||
				(query.heatingMethod === 'direct' && hm.includes('direct') && !hm.includes('indirect')) ||
				(query.heatingMethod === 'cold' && hm.includes('cold'));
			if (ok) {
				points += 10;
				matchedCriteria.push(`Heating: ${ref.heatingMethod}`);
			} else if (hm) {
				warnings.push(`Manual lists ${ref.heatingMethod}`);
			}
		}

		if (heaterV) {
			possible += 10;
			if ((ref.heaterVoltage ?? '').toLowerCase().includes(heaterV)) {
				points += 10;
				matchedCriteria.push(`${ref.heaterVoltage}V heater`);
			} else if (ref.heaterVoltage && ref.heaterVoltage !== 'N/A') {
				warnings.push(`Heater voltage is ${ref.heaterVoltage}V`);
			}
		}

		// 8. Functional Elements clues & Notes Keyword
		const textBlob = [
			ref.tubeFamily,
			ref.internalStructure,
			ref.generalFunction,
			ref.technicalNotes,
			ref.envelope
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();

		if (selectedElements.length > 0) {
			possible += selectedElements.length * 8;
			for (const clue of selectedElements) {
				if (matchesFunctionalClue(clue, ref, textBlob)) {
					points += 8;
					matchedCriteria.push(clue);
				} else {
					warnings.push(`No explicit note for ${clue}`);
				}
			}
		}

		if (keyword) {
			possible += 10;
			if (
				textBlob.includes(keyword) ||
				ref.referenceDesignation.toLowerCase().includes(keyword)
			) {
				points += 10;
				matchedCriteria.push(`Matches "${query.notesKeyword}"`);
			} else {
				continue;
			}
		}

		const score = possible > 0 ? Math.round((points / possible) * 100) : 50;

		scored.push({
			tubeRefId: ref.tubeRefId,
			referenceDesignation: ref.referenceDesignation,
			tubeFamily: ref.tubeFamily,
			internalStructure: ref.internalStructure,
			generalFunction: ref.generalFunction,
			base: ref.base,
			pinCount: ref.pinCount,
			basingCode: ref.basingCode,
			basingCodes: ref.basingCodes,
			envelope: ref.envelope,
			cap: ref.cap,
			heaterVoltage: ref.heaterVoltage,
			heaterCurrent: ref.heaterCurrent,
			heatingMethod: ref.heatingMethod,
			maxDiameterIn: ref.maxDiameterIn,
			maxSeatedHeightIn: ref.maxSeatedHeightIn,
			maxOverallHeightIn: ref.maxOverallHeightIn,
			totalQty: ref.totalQty,
			hasUnknownQty: ref.hasUnknownQty,
			score,
			matchedCriteria,
			warnings
		});
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
		return a.referenceDesignation.localeCompare(b.referenceDesignation, undefined, {
			numeric: true
		});
	});

	return scored.slice(0, limit);
}
