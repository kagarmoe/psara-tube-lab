import type { SessionUser, UserRole } from '../../app';

export const DEMO_READ_ONLY_MESSAGE =
	'Demo mode is read-only. To make changes or export the workbook, sign in with a curator or admin account.';

function isUnderPath(pathname: string, base: string): boolean {
	return pathname === base || pathname.startsWith(`${base}/`);
}

/** Demo sessions may view the admin workbench but never call admin APIs (export or writes). */
export function isDemoAdminApiBlocked(session: SessionUser | null, pathname: string): boolean {
	return session?.authMethod === 'demo' && isUnderPath(pathname, '/api/admin');
}

/** Only allow same-site absolute paths; anything else falls back to home. */
export function safeRedirectPath(target: string): string {
	if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/';
	return target;
}

/** Where to land after a demo role switch: members can't view /admin, so send them home. */
export function demoSwitchRedirect(role: UserRole, redirectTo: string): string {
	const target = safeRedirectPath(redirectTo);
	const pathname = target.split(/[?#]/)[0];
	if (role !== 'admin' && isUnderPath(pathname, '/admin')) return '/';
	return target;
}
