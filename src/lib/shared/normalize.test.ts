import { describe, expect, it } from 'vitest';
import {
	buildSourceSignature,
	cleanBasingCodes,
	cleanDesignation,
	containsEmailAddress,
	excelSerialToIso,
	formatBasingCodeDisplay,
	inchesToMm,
	normalizeBasingLookupKey,
	normalizeDesignationKey,
	normalizeStockCondition,
	normalizeTestStatus,
	parseDimensionInches,
	parsePinCount,
	parseQuantity,
	splitDesignationAliases
} from './normalize';

describe('designation normalization', () => {
	it('cleans and uppercases designations', () => {
		expect(cleanDesignation(' 6sn7\u2013gt ')).toBe('6SN7-GT');
		expect(normalizeDesignationKey('6SN7-GT')).toBe('6SN7GT');
		expect(splitDesignationAliases('6CG7/6FQ7')).toEqual(['6CG7', '6FQ7']);
	});
});

describe('dimension parsing and metric conversion', () => {
	it('converts mixed and simple fractions from _TEST.xlsm', () => {
		expect(parseDimensionInches('1 3/16')).toBe(1.1875);
		expect(parseDimensionInches('14/16')).toBe(0.875);
		expect(parseDimensionInches('1.3125')).toBe(1.3125);
		expect(parseDimensionInches('N/A')).toBeNull();
		expect(parseDimensionInches('?')).toBeNull();
	});

	it('converts inches to millimeters cleanly', () => {
		expect(inchesToMm(1)).toBe(25.4);
		expect(inchesToMm(1.1875, 2)).toBe(30.16);
		expect(inchesToMm(null)).toBeNull();
	});
});

describe('basing code cleanup and lookup keys', () => {
	it('fixes workbook typos and removes stray envelope codes', () => {
		expect(cleanBasingCodes('5B0')).toEqual(['5BO']);
		expect(cleanBasingCodes('9 CA')).toEqual(['9CA']);
		expect(cleanBasingCodes('9AJ / 9LP')).toEqual(['9AJ', '9LP']);
		expect(cleanBasingCodes('S14')).toEqual([]);
		expect(cleanBasingCodes('s14')).toEqual([]);
		expect(formatBasingCodeDisplay('9AJ / 9LP')).toBe('9AJ / 9LP');
		expect(formatBasingCodeDisplay('S14')).toBeNull();
	});

	it('normalizes basing lookup keys by stripping hyphens and leading G-', () => {
		expect(normalizeBasingLookupKey('4-K')).toBe('4K');
		expect(normalizeBasingLookupKey('G-7Z')).toBe('7Z');
		expect(normalizeBasingLookupKey('0A5')).toBe('0A5');
	});
});

describe('lot statuses, quantities, signatures, and PII guard', () => {
	it('normalizes test statuses and stock conditions', () => {
		expect(normalizeTestStatus('tested')).toBe('Tested');
		expect(normalizeTestStatus('untested')).toBe('Untested');
		expect(normalizeStockCondition('nos')).toBe('NOS');
		expect(normalizeStockCondition('')).toBe('Unknown');
	});

	it('flags ? quantities as unknown without inventing zero', () => {
		expect(parseQuantity('?')).toEqual({ quantity: null, quantityUnknown: true });
		expect(parseQuantity('18')).toEqual({ quantity: 18, quantityUnknown: false });
		expect(parseQuantity('')).toEqual({ quantity: null, quantityUnknown: false });
		expect(parsePinCount('8-pin')).toBe(8);
	});

	it('matches VBA netstring Batch Import source signature format', () => {
		const sig = buildSourceSignature([
			['Tube Number', '6SK7'],
			['Box', 'Metal'],
			['Layer', '1'],
			['Qty', '18'],
			['Test Status', 'untested']
		]);
		expect(sig).toBe(
			'11:Tube Number4:6SK73:Box5:Metal5:Layer1:13:Qty2:1811:Test Status8:untested'
		);
	});

	it('converts Excel serial timestamps and detects emails', () => {
		const iso = excelSerialToIso(46349.72306712963);
		expect(iso).toMatch(/^2026-11-23T17:21:/);
		expect(containsEmailAddress('contact john@example.com')).toBe(true);
		expect(containsEmailAddress('T0363 Metal octals')).toBe(false);
	});
});
