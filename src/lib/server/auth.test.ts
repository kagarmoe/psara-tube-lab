import { afterEach, describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { getSessionFromCookies } from './auth';

const noCookies = { get: () => undefined } as unknown as Cookies;

describe('getSessionFromCookies', () => {
	afterEach(() => {
		delete process.env.DEMO_MODE;
	});

	it('gives first-time demo visitors no session so they land on /login', () => {
		process.env.DEMO_MODE = 'true';
		expect(getSessionFromCookies(noCookies)).toBeNull();
	});
});
