import { inchesToMm } from './normalize';

export type MeasurementUnit = 'in' | 'mm';

/**
 * Format an inch measurement into high-readability inches or millimeters.
 */
export function formatDimension(
	inches: number | null | undefined,
	unit: MeasurementUnit
): string {
	if (inches === null || inches === undefined || !Number.isFinite(inches)) {
		return '—';
	}
	if (unit === 'mm') {
		const mm = inchesToMm(inches, 1);
		return mm !== null ? `${mm.toFixed(1)} mm` : '—';
	}
	// Trim trailing decimal zeroes while preserving readable precision
	const rounded = Math.round(inches * 10000) / 10000;
	return `${rounded} in`;
}

/**
 * Format both primary and secondary units for clarity when helpful.
 */
export function formatDimensionWithAlt(
	inches: number | null | undefined,
	unit: MeasurementUnit
): { primary: string; secondary: string | null } {
	if (inches === null || inches === undefined || !Number.isFinite(inches)) {
		return { primary: '—', secondary: null };
	}
	const inStr = `${Math.round(inches * 10000) / 10000} in`;
	const mm = inchesToMm(inches, 1);
	const mmStr = mm !== null ? `${mm.toFixed(1)} mm` : '';
	if (unit === 'mm') {
		return { primary: mmStr, secondary: inStr };
	}
	return { primary: inStr, secondary: mmStr || null };
}
