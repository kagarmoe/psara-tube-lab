import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://psara:psara_dev@localhost:5433/psara_tube_lab';

const isProduction = process.env.NODE_ENV === 'production';

// Render Managed PostgreSQL requires SSL in production; local Docker Postgres does not.
const useSsl =
	isProduction || databaseUrl.includes('render.com') || databaseUrl.includes('sslmode=require');

export const sql = postgres(databaseUrl, {
	max: 10,
	idle_timeout: 20,
	connect_timeout: 10,
	ssl: useSsl ? 'require' : false
});

export const db = drizzle(sql, { schema });
export * from './schema';
