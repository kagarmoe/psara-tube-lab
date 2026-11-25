import { describe, expect, it } from 'vitest';
import {
	computeNextTubeRefId,
	evaluateStagedRowMatch,
	normalizeSpreadsheetMatrix,
	parseDelimitedText
} from './admin-logic';

describe('admin batch parsing and matching helpers', () => {
	it('computes the next TXXXX identifier safely past existing max', () => {
		expect(computeNextTubeRefId(['T0001', 'T0735', 'T0321'])).toBe('T0736');
		expect(computeNextTubeRefId([])).toBe('T0001');
	});

	it('locates headers anywhere in rows 1–20 and computes deterministic Source Signatures', () => {
		const matrix = [
			['PSARA Donation Box Export'],
			['Notes: untested'],
			['Box', 'Qty', 'Tube Number', 'Test Status'],
			['Metal', '4', '6sk7', 'untested'],
			['6', '2', '6sn7gt', 'tested']
		];
		const rows = normalizeSpreadsheetMatrix(matrix, 'donation.xlsx');
		expect(rows).toHaveLength(2);
		expect(rows[0].tube).toBe('6SK7');
		expect(rows[0].qty).toBe(4);
		expect(rows[0].box).toBe('Metal');
		expect(rows[0].testStatus).toBe('Untested');
		expect(rows[1].testStatus).toBe('Tested');
		expect(rows[0].sourceSignature).toContain('4:6sk7');
	});

	it('holds Unidentified matches and marks reviewed exact matches Ready', () => {
		const refs = [
			{
				tubeRefId: 'T0367',
				referenceDesignation: '6SK7',
				normalizedKey: '6SK7',
				lookupStatus: 'Active'
			},
			{
				tubeRefId: 'T0295',
				referenceDesignation: '6GH7',
				normalizedKey: '6GH7',
				lookupStatus: 'Unidentified'
			}
		];

		expect(
			evaluateStagedRowMatch(
				{ importTube: '6SK7', importQty: 4, importBox: 'Metal', reviewed: true },
				refs
			).importStatus
		).toBe('Ready');

		const unid = evaluateStagedRowMatch(
			{ importTube: '6GH7', importQty: 1, importBox: '5', reviewed: true },
			refs
		);
		expect(unid.importStatus).toBe('Hold');
		expect(unid.reasonOrCandidates).toContain('Unidentified');
	});

	it('parses delimited CSV/TSV text cleanly', () => {
		const rows = parseDelimitedText('Tube,Qty,Box\n"6L6GC",2,Metal\n');
		expect(rows).toEqual([
			['Tube', 'Qty', 'Box'],
			['6L6GC', '2', 'Metal']
		]);
	});
});
