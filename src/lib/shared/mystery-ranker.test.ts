import { describe, expect, it } from 'vitest';
import {
	mapBaseToFilamentGroup,
	rankMysteryTubeCandidates,
	type MysteryCandidateInput
} from './mystery-ranker';

const SAMPLE_REFS: MysteryCandidateInput[] = [
	{
		tubeRefId: 'T0370',
		referenceDesignation: '6SN7GT',
		lookupStatus: 'Active',
		tubeFamily: '6SN7 family',
		internalStructure: 'Twin triode',
		generalFunction: 'Audio / voltage amplifier',
		base: 'Octal 8-pin',
		pinCount: 8,
		basingCode: '8BD',
		basingCodes: ['8BD'],
		envelope: 'T9',
		cap: 'None',
		heaterVoltage: '6.3',
		heaterCurrent: '0.6',
		heatingMethod: 'Heater-cathode — indirectly heated',
		maxDiameterIn: 1.3125,
		maxSeatedHeightIn: 2.75,
		maxOverallHeightIn: 3.3125,
		technicalNotes: 'Dual triode octal',
		totalQty: 14,
		hasUnknownQty: false
	},
	{
		tubeRefId: 'T0367',
		referenceDesignation: '6SK7',
		lookupStatus: 'Active',
		tubeFamily: '6SK7 family',
		internalStructure: 'Pentode',
		generalFunction: 'RF/IF amplifier',
		base: 'Octal 8-pin',
		pinCount: 8,
		basingCode: '8N',
		basingCodes: ['8N'],
		envelope: 'MT8',
		cap: 'None',
		heaterVoltage: '6.3',
		heaterCurrent: '0.3',
		heatingMethod: 'Heater-cathode — indirectly heated',
		maxDiameterIn: 1.34,
		maxSeatedHeightIn: 2.06,
		maxOverallHeightIn: 2.625,
		technicalNotes: 'Metal shell RF pentode',
		totalQty: 18,
		hasUnknownQty: false
	},
	{
		tubeRefId: 'T0001',
		referenceDesignation: '0A2',
		lookupStatus: 'Active',
		tubeFamily: 'Gas regulator',
		internalStructure: 'Gas regulator',
		generalFunction: 'Voltage regulator',
		base: 'Miniature 7-pin',
		pinCount: 7,
		basingCode: '5BO',
		basingCodes: ['5BO'],
		envelope: 'T5½',
		cap: 'None',
		heaterVoltage: 'N/A',
		heaterCurrent: 'N/A',
		heatingMethod: 'Cold cathode',
		maxDiameterIn: 0.75,
		maxSeatedHeightIn: 2.375,
		maxOverallHeightIn: 2.625,
		technicalNotes: 'Cold cathode regulator',
		totalQty: 2,
		hasUnknownQty: false
	},
	{
		tubeRefId: 'T0295',
		referenceDesignation: '6GH7',
		lookupStatus: 'Unidentified',
		tubeFamily: null,
		internalStructure: null,
		generalFunction: null,
		base: 'Octal 8-pin',
		pinCount: 8,
		basingCode: null,
		basingCodes: [],
		envelope: 'T9',
		cap: 'None',
		heaterVoltage: null,
		heaterCurrent: null,
		heatingMethod: null,
		maxDiameterIn: 1.3,
		maxSeatedHeightIn: null,
		maxOverallHeightIn: null,
		technicalNotes: null,
		totalQty: 1,
		hasUnknownQty: false
	}
];

describe('mystery tube deterministic ranker', () => {
	it('maps base names to Filament_heater_options base_groups', () => {
		expect(mapBaseToFilamentGroup('Octal 8-pin')).toBe('Octal');
		expect(mapBaseToFilamentGroup('Miniature 9-pin')).toBe('9-pin miniature');
		expect(mapBaseToFilamentGroup('Miniature 7-pin')).toBe('7-pin miniature');
		expect(mapBaseToFilamentGroup('UX 4-pin')).toBe('Old 4-pin');
	});

	it('excludes Unidentified records and ranks octal T9 twin triode first', () => {
		const hits = rankMysteryTubeCandidates(SAMPLE_REFS, {
			pinCount: 8,
			exactBase: 'Octal 8-pin',
			topCap: 'no',
			envelope: 'T9',
			functionalElements: ['Grid 1', 'Cathode']
		});
		expect(hits.map((h) => h.tubeRefId)).toEqual(['T0370', 'T0367']);
		expect(hits[0].referenceDesignation).toBe('6SN7GT');
		expect(hits[0].score).toBe(100);
	});

	it('filters strictly by diameter tolerance and metal shell clue', () => {
		const hits = rankMysteryTubeCandidates(SAMPLE_REFS, {
			pinCount: 8,
			diameterIn: 1.34,
			diameterToleranceIn: 0.1,
			functionalElements: ['Metal shell / external shield', 'Grid 2']
		});
		expect(hits[0].referenceDesignation).toBe('6SK7');
		expect(hits[0].score).toBeGreaterThan(hits[1].score);
	});
});
