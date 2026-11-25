import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { count, sql as drizzleSql } from 'drizzle-orm';
import { db, sql } from './index';
import {
	acquisitionBatches,
	acquisitionEntries,
	batchImportRows,
	boxLayers,
	controlledLists,
	diagramAssets,
	filamentHeaterOptions,
	functionalElements,
	inventoryLots,
	locations,
	relationships,
	reviewQueue,
	tubeReferences,
	users
} from './schema';

export interface SeedPayload {
	metadata: {
		generatedAt: string;
		sourceWorkbook: string;
		totalReferencePngsFound: number;
		basingMatchCount: number;
	};
	tubeReferences: Array<typeof tubeReferences.$inferInsert>;
	locations: Array<typeof locations.$inferInsert>;
	boxLayers: Array<typeof boxLayers.$inferInsert>;
	inventoryLots: Array<typeof inventoryLots.$inferInsert>;
	relationships: Array<typeof relationships.$inferInsert>;
	controlledLists: Array<typeof controlledLists.$inferInsert>;
	filamentHeaterOptions: Array<typeof filamentHeaterOptions.$inferInsert>;
	functionalElements: Array<typeof functionalElements.$inferInsert>;
	diagramAssets: Array<typeof diagramAssets.$inferInsert>;
	acquisitionEntries: Array<typeof acquisitionEntries.$inferInsert>;
	batchImportRows: Array<
		Omit<typeof batchImportRows.$inferInsert, 'batchId'> & { batchName?: string }
	>;
	reviewQueue: Array<typeof reviewQueue.$inferInsert>;
}

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const derived = scryptSync(password, salt, 64).toString('hex');
	return `scrypt$${salt}$${derived}`;
}

async function seedAdminUser(): Promise<void> {
	const adminUsername = (process.env.ADMIN_USERNAME ?? '').trim();
	const adminPassword = (process.env.ADMIN_PASSWORD ?? '').trim();
	const adminDisplayName = (process.env.ADMIN_DISPLAY_NAME ?? 'PSARA Admin').trim();

	if (adminUsername && adminPassword) {
		await db
			.insert(users)
			.values({
				username: adminUsername,
				displayName: adminDisplayName,
				role: 'admin',
				passwordHash: hashPassword(adminPassword),
				active: true
			})
			.onConflictDoNothing({ target: users.username });
	}
}

export async function seedDatabase(options?: { seedPath?: string }): Promise<{
	seeded: boolean;
	counts: Record<string, number>;
}> {
	const seedPath = options?.seedPath ?? resolve(process.cwd(), 'seed/psara_seed.json');
	if (!existsSync(seedPath)) {
		throw new Error(
			`Seed file not found at ${seedPath}. Run "npm run seed:extract" first.`
		);
	}

	const payload = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedPayload;

	// Ensure admin account exists whenever env vars are provided
	await seedAdminUser();

	const [{ value: existingRefCount }] = await db
		.select({ value: count() })
		.from(tubeReferences);
	const [{ value: existingInvCount }] = await db
		.select({ value: count() })
		.from(inventoryLots);

	if (existingRefCount > 0 && existingInvCount > 0) {
		// Re-ensure upserts for idempotent metadata tables without duplicating serial rows
		return {
			seeded: false,
			counts: await getTableCounts()
		};
	}

	await db.transaction(async (tx) => {
		if (existingRefCount === 0 && payload.tubeReferences.length > 0) {
			await tx.insert(tubeReferences).values(payload.tubeReferences).onConflictDoNothing();
		}

		if (payload.locations.length > 0) {
			await tx.insert(locations).values(payload.locations).onConflictDoNothing();
		}

		if (payload.boxLayers.length > 0) {
			await tx.insert(boxLayers).values(payload.boxLayers).onConflictDoNothing();
		}

		if (existingInvCount === 0 && payload.inventoryLots.length > 0) {
			const chunkSize = 250;
			for (let i = 0; i < payload.inventoryLots.length; i += chunkSize) {
				await tx
					.insert(inventoryLots)
					.values(payload.inventoryLots.slice(i, i + chunkSize));
			}
		}

		const [{ value: relCount }] = await tx.select({ value: count() }).from(relationships);
		if (relCount === 0 && payload.relationships.length > 0) {
			await tx.insert(relationships).values(payload.relationships);
		}

		if (payload.controlledLists.length > 0) {
			await tx.insert(controlledLists).values(payload.controlledLists).onConflictDoNothing();
		}

		const [{ value: filCount }] = await tx
			.select({ value: count() })
			.from(filamentHeaterOptions);
		if (filCount === 0 && payload.filamentHeaterOptions.length > 0) {
			await tx.insert(filamentHeaterOptions).values(payload.filamentHeaterOptions);
		}

		const [{ value: funcCount }] = await tx
			.select({ value: count() })
			.from(functionalElements);
		if (funcCount === 0 && payload.functionalElements.length > 0) {
			await tx.insert(functionalElements).values(payload.functionalElements);
		}

		if (payload.diagramAssets.length > 0) {
			const chunkSize = 200;
			for (let i = 0; i < payload.diagramAssets.length; i += chunkSize) {
				await tx
					.insert(diagramAssets)
					.values(payload.diagramAssets.slice(i, i + chunkSize))
					.onConflictDoNothing();
			}
		}

		if (payload.acquisitionEntries.length > 0) {
			await tx
				.insert(acquisitionEntries)
				.values(payload.acquisitionEntries)
				.onConflictDoNothing();
		}

		const [{ value: batchCount }] = await tx
			.select({ value: count() })
			.from(acquisitionBatches);
		if (batchCount === 0 && payload.batchImportRows.length > 0) {
			const [batch] = await tx
				.insert(acquisitionBatches)
				.values({
					batchName: 'METAL TUBES BOX.xlsx (Initial Workbook Seed)',
					sourceType: 'workbook_seed',
					createdBy: 'seed'
				})
				.returning({ id: acquisitionBatches.id });

			const rowsToInsert = payload.batchImportRows.map(({ batchName: _ignored, ...rest }) => ({
				...rest,
				batchId: batch.id
			}));
			await tx.insert(batchImportRows).values(rowsToInsert).onConflictDoNothing();
		}

		const [{ value: revCount }] = await tx.select({ value: count() }).from(reviewQueue);
		if (revCount === 0 && payload.reviewQueue.length > 0) {
			await tx.insert(reviewQueue).values(payload.reviewQueue);
		}
	});

	// Keep Postgres sequences synced after any bulk inserts
	await db.execute(drizzleSql`SELECT 1`);

	return {
		seeded: true,
		counts: await getTableCounts()
	};
}

export async function getTableCounts(): Promise<Record<string, number>> {
	const [
		[refs],
		[lots],
		[rels],
		[locs],
		[diagrams],
		[lists],
		[reviews],
		[acqs],
		[batches]
	] = await Promise.all([
		db.select({ value: count() }).from(tubeReferences),
		db.select({ value: count() }).from(inventoryLots),
		db.select({ value: count() }).from(relationships),
		db.select({ value: count() }).from(locations),
		db.select({ value: count() }).from(diagramAssets),
		db.select({ value: count() }).from(controlledLists),
		db.select({ value: count() }).from(reviewQueue),
		db.select({ value: count() }).from(acquisitionEntries),
		db.select({ value: count() }).from(batchImportRows)
	]);

	return {
		tubeReferences: refs.value,
		inventoryLots: lots.value,
		relationships: rels.value,
		locations: locs.value,
		diagramAssets: diagrams.value,
		controlledLists: lists.value,
		reviewQueue: reviews.value,
		acquisitionEntries: acqs.value,
		batchImportRows: batches.value
	};
}

const isMainModule =
	typeof process !== 'undefined' &&
	process.argv[1] &&
	(process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isMainModule) {
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
}
