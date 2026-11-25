import { describe, expect, it } from 'vitest';
import {
	classifyDirectMatchTier,
	classifyRelationshipView,
	isNavigableSubstituteEdge,
	normalizeEnvelopeShapeKey
} from './tube-logic';
import { formatDimension } from './units';

describe('4-tier tube search classification', () => {
	const ref6SN7 = {
		tubeRefId: 'T0370',
		referenceDesignation: '6SN7GT',
		normalizedKey: '6SN7GT',
		lookupStatus: 'Active',
		tubeFamily: '6SN7 family',
		generalFunction: 'Twin triode audio/voltage amplifier',
		base: 'Octal 8-pin',
		envelope: 'T9',
		technicalNotes: 'Common dual triode'
	};

	it('assigns Tier 1 for exact match and Tier 2 for prefix match', () => {
		expect(classifyDirectMatchTier('6sn7-gt', ref6SN7)).toBe(1);
		expect(classifyDirectMatchTier('T0370', ref6SN7)).toBe(1);
		expect(classifyDirectMatchTier('6SN7', ref6SN7)).toBe(2);
	});

	it('assigns Tier 4 for family/notes/comment keywords', () => {
		expect(classifyDirectMatchTier('twin triode', ref6SN7)).toBe(4);
		expect(classifyDirectMatchTier('pentode', ref6SN7)).toBeNull();
	});
});

describe('directional relationship rules (PSARA_ReverseRelationshipAllowed)', () => {
	const oneWayRel = {
		id: 1,
		designation: '12C5',
		relatedDesignation: '12AS5',
		sourceTubeRefId: 'T0101',
		targetTubeRefId: 'T0088',
		relationship: 'Conditional substitute',
		direction: 'Related replaces Original',
		differenceType: 'None',
		qualificationNotes: 'Parallel-filament circuits only',
		source: 'SAMS',
		sourcePage: '34',
		originalNote: null,
		verificationStatus: 'Confirmed'
	};

	it('allows forward replacement Original -> Related', () => {
		const view = classifyRelationshipView(oneWayRel, 'T0101', '12C5');
		expect(view?.canUseAsSubstitute).toBe(true);
		expect(view?.peerDesignation).toBe('12AS5');
		expect(isNavigableSubstituteEdge(oneWayRel, 'T0101', '12C5')).not.toBeNull();
	});

	it('blocks reversing Related replaces Original when viewing Related', () => {
		const view = classifyRelationshipView(oneWayRel, 'T0088', '12AS5');
		expect(view?.canUseAsSubstitute).toBe(false);
		expect(view?.oneWayWarning).toBe(true);
		expect(view?.summaryText).toContain('Do NOT substitute 12C5');
		expect(isNavigableSubstituteEdge(oneWayRel, 'T0088', '12AS5')).toBeNull();
	});

	it('allows both directions for Interchangeable relationships', () => {
		const twoWay = { ...oneWayRel, direction: 'Interchangeable', relationship: 'Military designation' };
		expect(classifyRelationshipView(twoWay, 'T0101', '12C5')?.canUseAsSubstitute).toBe(true);
		expect(classifyRelationshipView(twoWay, 'T0088', '12AS5')?.canUseAsSubstitute).toBe(true);
	});
});

describe('units and envelope matching', () => {
	it('formats dimensions in inches and millimeters', () => {
		expect(formatDimension(1.5, 'in')).toBe('1.5 in');
		expect(formatDimension(1.5, 'mm')).toBe('38.1 mm');
		expect(formatDimension(null, 'mm')).toBe('—');
	});

	it('normalizes mixed envelope fractions and metal types', () => {
		expect(normalizeEnvelopeShapeKey('T5½')).toBe('T5.5');
		expect(normalizeEnvelopeShapeKey('T-5 1/2')).toBe('T5.5');
		expect(normalizeEnvelopeShapeKey('MT8B')).toBe('METAL');
		expect(normalizeEnvelopeShapeKey('Metal type')).toBe('METAL');
	});
});
