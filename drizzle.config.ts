import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
	process.loadEnvFile('.env');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'postgresql://psara:psara_dev@localhost:5433/psara_tube_lab'
	}
});
