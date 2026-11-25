import { existsSync } from 'node:fs';
import { sql } from '../src/lib/server/db';
import { seedDatabase } from '../src/lib/server/db/seed';

if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
	process.loadEnvFile('.env');
}

seedDatabase()
	.then(async (result) => {
		console.log(
			result.seeded ? 'Seeded PSARA database:' : 'Database already seeded (idempotent skip):',
			result.counts
		);
		await sql.end();
	})
	.catch(async (err) => {
		console.error('Seed failed:', err);
		await sql.end();
		process.exit(1);
	});
