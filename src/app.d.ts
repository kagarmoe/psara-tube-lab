export type UserRole = 'member' | 'curator' | 'admin';

export interface SessionUser {
	username: string;
	displayName: string;
	role: UserRole;
	authMethod: 'passcode' | 'account' | 'demo';
}

declare global {
	namespace App {
		interface Locals {
			session: SessionUser | null;
			demoMode: boolean;
		}
	}
}

export {};
