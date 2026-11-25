import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../../app';
import { demoSwitchRedirect, isDemoAdminApiBlocked, safeRedirectPath } from './demo-guard';

const demoAdmin: SessionUser = {
	username: 'demo-admin',
	displayName: 'Demo Admin',
	role: 'admin',
	authMethod: 'demo'
};
const realAdmin: SessionUser = { ...demoAdmin, username: 'kim', authMethod: 'account' };

describe('isDemoAdminApiBlocked', () => {
	it('blocks demo sessions from the workbook export and inventory writes', () => {
		expect(isDemoAdminApiBlocked(demoAdmin, '/api/admin/export/xlsx')).toBe(true);
		expect(isDemoAdminApiBlocked(demoAdmin, '/api/admin/intake')).toBe(true);
	});

	it('allows signed-in admin accounts', () => {
		expect(isDemoAdminApiBlocked(realAdmin, '/api/admin/export/xlsx')).toBe(false);
	});

	it('leaves non-admin APIs alone for demo sessions', () => {
		expect(isDemoAdminApiBlocked(demoAdmin, '/api/tubes/search')).toBe(false);
		expect(isDemoAdminApiBlocked(demoAdmin, '/api/administer')).toBe(false);
	});
});

describe('safeRedirectPath', () => {
	it('rejects protocol-relative and backslash open redirects', () => {
		expect(safeRedirectPath('//evil.example')).toBe('/');
		expect(safeRedirectPath('/\\evil.example')).toBe('/');
		expect(safeRedirectPath('https://evil.example')).toBe('/');
	});

	it('keeps same-site paths', () => {
		expect(safeRedirectPath('/tubes/42?x=1')).toBe('/tubes/42?x=1');
	});
});

describe('demoSwitchRedirect', () => {
	it('sends a member switch from admin pages home', () => {
		expect(demoSwitchRedirect('member', '/admin')).toBe('/');
		expect(demoSwitchRedirect('member', '/admin/anything?tab=batch')).toBe('/');
	});

	it('keeps the current page otherwise', () => {
		expect(demoSwitchRedirect('member', '/tubes/42')).toBe('/tubes/42');
		expect(demoSwitchRedirect('member', '/administrivia')).toBe('/administrivia');
		expect(demoSwitchRedirect('admin', '/admin')).toBe('/admin');
	});
});
