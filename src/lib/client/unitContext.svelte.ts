import { getContext, setContext } from 'svelte';
import type { MeasurementUnit } from '$lib/shared/units';

const UNIT_CONTEXT_KEY = Symbol('psara-unit');

export class UnitPreferenceState {
	unit = $state<MeasurementUnit>('in');

	constructor(initial: MeasurementUnit) {
		this.unit = initial;
	}

	async setUnit(next: MeasurementUnit) {
		if (this.unit === next) return;
		this.unit = next;
		try {
			await fetch('/api/prefs/unit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ unit: next })
			});
		} catch {
			// Local reactive state remains updated even if offline
		}
	}
}

export function provideUnitPreference(initial: MeasurementUnit): UnitPreferenceState {
	const state = new UnitPreferenceState(initial);
	setContext(UNIT_CONTEXT_KEY, state);
	return state;
}

export function useUnitPreference(): UnitPreferenceState {
	return getContext<UnitPreferenceState>(UNIT_CONTEXT_KEY);
}
