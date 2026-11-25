import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { SessionUser, UserRole } from '../../app';

export const SESSION_COOKIE_NAME = 'psara_session';
export const UNIT_COOKIE_NAME = 'psara_unit';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days for club convenience

function getSessionSecret(): string {
	return process.env.SESSION_SECRET || 'psara-local-dev-insecure-fallback-secret';
}

export function isDemoModeEnabled(): boolean {
	return (process.env.DEMO_MODE ?? 'false').toLowerCase() === 'true';
}

export function getMemberAccessCode(): string {
	return (process.env.MEMBER_ACCESS_CODE ?? '').trim();
}

export function verifyScryptPassword(password: string, storedHash: string): boolean {
	const parts = storedHash.split('$');
	if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
	const [, salt, hexDigest] = parts;
	const expected = Buffer.from(hexDigest, 'hex');
	const actual = scryptSync(password, salt, 64);
	if (expected.length !== actual.length) return false;
	return timingSafeEqual(expected, actual);
}

export function verifySharedPasscode(candidate: string): boolean {
	const configured = getMemberAccessCode();
	if (!configured) return false;
	const a = Buffer.from(candidate.trim(), 'utf8');
	const b = Buffer.from(configured, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

interface CookiePayload {
	u: SessionUser;
	exp: number;
}

export function signSessionToken(user: SessionUser): string {
	const payload: CookiePayload = {
		u: user,
		exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
	};
	const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	const sig = createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
	return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
	if (!token) return null;
	const dotIdx = token.indexOf('.');
	if (dotIdx <= 0) return null;
	const encoded = token.slice(0, dotIdx);
	const sig = token.slice(dotIdx + 1);
	const expectedSig = createHmac('sha256', getSessionSecret())
		.update(encoded)
		.digest('base64url');

	const sigBuf = Buffer.from(sig, 'utf8');
	const expectedBuf = Buffer.from(expectedSig, 'utf8');
	if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
		return null;
	}

	try {
		const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CookiePayload;
		if (!decoded?.u || typeof decoded.exp !== 'number') return null;
		if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
		return decoded.u;
	} catch {
		return null;
	}
}

export function isHttpsRequest(request: Request, url: URL): boolean {
	return (
		url.protocol === 'https:' ||
		request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'
	);
}

export function setSessionCookie(cookies: Cookies, user: SessionUser, secure = false): void {
	const token = signSessionToken(user);
	cookies.set(SESSION_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: SESSION_TTL_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

export function getSessionFromCookies(cookies: Cookies): SessionUser | null {
	const existing = verifySessionToken(cookies.get(SESSION_COOKIE_NAME));
	if (existing) return existing;

	if (isDemoModeEnabled()) {
		return {
			username: 'demo-member',
			displayName: 'Demo Club Member',
			role: 'member',
			authMethod: 'demo'
		};
	}

	return null;
}

export async function authenticateAccount(
	username: string,
	password: string
): Promise<SessionUser | null> {
	const cleanUser = username.trim();
	if (!cleanUser || !password) return null;

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.username, cleanUser))
		.limit(1);

	if (!user || !user.active) return null;
	if (!verifyScryptPassword(password, user.passwordHash)) return null;

	const role: UserRole =
		user.role === 'admin' || user.role === 'curator' ? user.role : 'member';

	return {
		username: user.username,
		displayName: user.displayName,
		role,
		authMethod: 'account'
	};
}

export function isAdminOrCurator(session: SessionUser | null): boolean {
	return session?.role === 'admin' || session?.role === 'curator';
}
