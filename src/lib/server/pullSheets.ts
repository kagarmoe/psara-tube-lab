import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	auditLog,
	inventoryLots,
	pullRequestItems,
	pullRequests,
	tubeReferences
} from '$lib/server/db/schema';
import { normalizeStockCondition, normalizeTestStatus } from '$lib/shared/normalize';

export interface PullSheetItemView {
	id: number;
	pullRequestId: number;
	lotId: number | null;
	tubeRefId: string | null;
	designation: string;
	boxNo: string | null;
	boxLayer: string | null;
	qtyRequested: number;
	qtyPulled: number;
	qtyReturned: number;
	notes: string | null;
	lotAvailableQty: number | null;
	lotQuantityUnknown: boolean;
	lotStockCondition: string | null;
	lotTestStatus: string | null;
}

export interface PullSheetView {
	id: number;
	requestCode: string;
	memberName: string;
	purpose: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	items: PullSheetItemView[];
}

function generateRequestCode(): string {
	const d = new Date();
	const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
		d.getUTCDate()
	).padStart(2, '0')}`;
	const suffix = Math.floor(1000 + Math.random() * 9000);
	return `PULL-${ymd}-${suffix}`;
}

export async function listPullSheets(statusFilter?: string): Promise<PullSheetView[]> {
	const requests = statusFilter
		? await db
				.select()
				.from(pullRequests)
				.where(eq(pullRequests.status, statusFilter))
				.orderBy(desc(pullRequests.createdAt), desc(pullRequests.id))
		: await db
				.select()
				.from(pullRequests)
				.orderBy(desc(pullRequests.createdAt), desc(pullRequests.id));

	if (requests.length === 0) return [];

	const items = await db
		.select({
			item: pullRequestItems,
			lotAvailableQty: inventoryLots.quantity,
			lotQuantityUnknown: inventoryLots.quantityUnknown,
			lotStockCondition: inventoryLots.stockCondition,
			lotTestStatus: inventoryLots.testStatus
		})
		.from(pullRequestItems)
		.leftJoin(inventoryLots, eq(pullRequestItems.lotId, inventoryLots.id))
		.orderBy(asc(pullRequestItems.id));

	const byReq = new Map<number, PullSheetItemView[]>();
	for (const row of items) {
		const list = byReq.get(row.item.pullRequestId) ?? [];
		list.push({
			id: row.item.id,
			pullRequestId: row.item.pullRequestId,
			lotId: row.item.lotId,
			tubeRefId: row.item.tubeRefId,
			designation: row.item.designation,
			boxNo: row.item.boxNo,
			boxLayer: row.item.boxLayer,
			qtyRequested: row.item.qtyRequested,
			qtyPulled: row.item.qtyPulled,
			qtyReturned: row.item.qtyReturned,
			notes: row.item.notes,
			lotAvailableQty: row.lotAvailableQty ?? null,
			lotQuantityUnknown: row.lotQuantityUnknown ?? false,
			lotStockCondition: row.lotStockCondition ?? null,
			lotTestStatus: row.lotTestStatus ?? null
		});
		byReq.set(row.item.pullRequestId, list);
	}

	return requests.map((req) => ({
		id: req.id,
		requestCode: req.requestCode,
		memberName: req.memberName,
		purpose: req.purpose,
		status: req.status,
		createdAt: req.createdAt.toISOString(),
		updatedAt: req.updatedAt.toISOString(),
		items: byReq.get(req.id) ?? []
	}));
}

export async function createEmptyPullSheet(params: {
	memberName: string;
	purpose?: string | null;
	actor: string;
}) {
	const memberName = params.memberName.trim() || 'PSARA Member';
	const purpose = params.purpose?.trim() || null;

	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(pullRequests)
			.values({
				requestCode: generateRequestCode(),
				memberName,
				purpose,
				status: 'Pending'
			})
			.returning();

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_sheet_created',
			entityType: 'pull_request',
			entityId: created.requestCode,
			details: { memberName, purpose }
		});

		return created;
	});
}

export async function addLotToPullSheet(params: {
	pullRequestId?: number | null;
	memberName: string;
	purpose?: string | null;
	lotId: number;
	qtyRequested: number;
	notes?: string | null;
	actor: string;
}) {
	const qty = Math.trunc(params.qtyRequested);
	if (!Number.isFinite(qty) || qty <= 0) {
		throw new Error('Requested quantity must be at least 1.');
	}

	return db.transaction(async (tx) => {
		const [lot] = await tx
			.select()
			.from(inventoryLots)
			.where(eq(inventoryLots.id, params.lotId))
			.limit(1);

		if (!lot) {
			throw new Error('Selected inventory lot no longer exists.');
		}

		if (!lot.quantityUnknown && (lot.quantity ?? 0) < qty) {
			throw new Error(
				`Only ${lot.quantity ?? 0} available in Box ${lot.boxNo ?? '—'} (Layer ${lot.boxLayer ?? '—'}).`
			);
		}

		let designation = lot.canonicalDesignation;
		if (lot.tubeRefId) {
			const [ref] = await tx
				.select({ referenceDesignation: tubeReferences.referenceDesignation })
				.from(tubeReferences)
				.where(eq(tubeReferences.tubeRefId, lot.tubeRefId))
				.limit(1);
			if (ref) designation = ref.referenceDesignation;
		}

		let sheetId = params.pullRequestId ?? null;
		let requestCode = '';

		if (sheetId) {
			const [existingSheet] = await tx
				.select()
				.from(pullRequests)
				.where(eq(pullRequests.id, sheetId))
				.limit(1);
			if (!existingSheet || existingSheet.status === 'Closed' || existingSheet.status === 'Returned') {
				sheetId = null;
			} else {
				requestCode = existingSheet.requestCode;
			}
		}

		if (!sheetId) {
			const [pendingExisting] = await tx
				.select()
				.from(pullRequests)
				.where(
					and(
						eq(pullRequests.status, 'Pending'),
						eq(pullRequests.memberName, params.memberName.trim() || 'PSARA Member')
					)
				)
				.orderBy(desc(pullRequests.id))
				.limit(1);

			if (pendingExisting) {
				sheetId = pendingExisting.id;
				requestCode = pendingExisting.requestCode;
			}
		}

		if (!sheetId) {
			const [created] = await tx
				.insert(pullRequests)
				.values({
					requestCode: generateRequestCode(),
					memberName: params.memberName.trim() || 'PSARA Member',
					purpose: params.purpose?.trim() || null,
					status: 'Pending'
				})
				.returning();
			sheetId = created.id;
			requestCode = created.requestCode;
		}

		const [item] = await tx
			.insert(pullRequestItems)
			.values({
				pullRequestId: sheetId,
				lotId: lot.id,
				tubeRefId: lot.tubeRefId,
				designation,
				boxNo: lot.boxNo,
				boxLayer: lot.boxLayer,
				qtyRequested: qty,
				qtyPulled: 0,
				qtyReturned: 0,
				notes: params.notes?.trim() || null
			})
			.returning();

		await tx
			.update(pullRequests)
			.set({ updatedAt: new Date() })
			.where(eq(pullRequests.id, sheetId));

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_item_added',
			entityType: 'pull_request',
			entityId: requestCode,
			details: {
				lotId: lot.id,
				designation,
				boxNo: lot.boxNo,
				boxLayer: lot.boxLayer,
				qtyRequested: qty
			}
		});

		return { pullRequestId: sheetId, requestCode, item };
	});
}

async function recomputeSheetStatus(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	pullRequestId: number
) {
	const items = await tx
		.select()
		.from(pullRequestItems)
		.where(eq(pullRequestItems.pullRequestId, pullRequestId));

	let totalRequested = 0;
	let totalPulled = 0;
	let totalReturned = 0;
	for (const it of items) {
		totalRequested += it.qtyRequested;
		totalPulled += it.qtyPulled;
		totalReturned += it.qtyReturned;
	}

	let nextStatus = 'Pending';
	if (totalPulled > 0 && totalReturned >= totalPulled && totalPulled >= totalRequested) {
		nextStatus = 'Returned';
	} else if (totalPulled > 0) {
		nextStatus = 'Pulled';
	}

	await tx
		.update(pullRequests)
		.set({ status: nextStatus, updatedAt: new Date() })
		.where(eq(pullRequests.id, pullRequestId));

	return nextStatus;
}

export async function pullLineItem(params: {
	itemId: number;
	qtyToPull: number;
	actor: string;
}) {
	const qty = Math.trunc(params.qtyToPull);
	if (!Number.isFinite(qty) || qty <= 0) {
		throw new Error('Quantity to pull must be greater than zero.');
	}

	return db.transaction(async (tx) => {
		const [item] = await tx
			.select()
			.from(pullRequestItems)
			.where(eq(pullRequestItems.id, params.itemId))
			.limit(1);
		if (!item) {
			throw new Error('Pull sheet item not found.');
		}

		const remainingToPull = item.qtyRequested - item.qtyPulled;
		if (qty > remainingToPull) {
			throw new Error(`Cannot pull ${qty}; only ${remainingToPull} remaining on this request.`);
		}

		if (item.lotId) {
			const [lot] = await tx
				.select()
				.from(inventoryLots)
				.where(eq(inventoryLots.id, item.lotId))
				.limit(1);
			if (!lot) {
				throw new Error('Source box lot is no longer present.');
			}

			if (!lot.quantityUnknown) {
				const available = lot.quantity ?? 0;
				if (available < qty) {
					throw new Error(
						`Insufficient stock in Box ${lot.boxNo ?? '—'} (available: ${available}, requested pull: ${qty}).`
					);
				}

				const updatedRows = await tx
					.update(inventoryLots)
					.set({
						quantity: sql`${inventoryLots.quantity} - ${qty}`,
						updatedAt: new Date()
					})
					.where(
						and(
							eq(inventoryLots.id, lot.id),
							sql`${inventoryLots.quantity} >= ${qty}`
						)
					)
					.returning();

				if (updatedRows.length === 0) {
					throw new Error('Concurrent inventory update blocked over-pull. Please refresh.');
				}
			}
		}

		const [updatedItem] = await tx
			.update(pullRequestItems)
			.set({ qtyPulled: item.qtyPulled + qty })
			.where(eq(pullRequestItems.id, item.id))
			.returning();

		const nextStatus = await recomputeSheetStatus(tx, item.pullRequestId);

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_item_pulled',
			entityType: 'pull_request_item',
			entityId: String(item.id),
			details: {
				pullRequestId: item.pullRequestId,
				lotId: item.lotId,
				designation: item.designation,
				qtyPulledNow: qty
			}
		});

		return { item: updatedItem, sheetStatus: nextStatus };
	});
}

export async function returnLineItem(params: {
	itemId: number;
	qtyToReturn: number;
	updatedTestStatus?: string | null;
	updatedStockCondition?: string | null;
	notes?: string | null;
	actor: string;
}) {
	const qty = Math.trunc(params.qtyToReturn);
	if (!Number.isFinite(qty) || qty <= 0) {
		throw new Error('Quantity to return must be greater than zero.');
	}

	return db.transaction(async (tx) => {
		const [item] = await tx
			.select()
			.from(pullRequestItems)
			.where(eq(pullRequestItems.id, params.itemId))
			.limit(1);
		if (!item) {
			throw new Error('Pull sheet item not found.');
		}

		const maxReturnable = item.qtyPulled - item.qtyReturned;
		if (qty > maxReturnable) {
			throw new Error(`Cannot return ${qty}; only ${maxReturnable} currently checked out.`);
		}

		const nextTest = params.updatedTestStatus
			? normalizeTestStatus(params.updatedTestStatus)
			: null;
		const nextCondition = params.updatedStockCondition
			? normalizeStockCondition(params.updatedStockCondition)
			: null;

		if (item.lotId) {
			const [lot] = await tx
				.select()
				.from(inventoryLots)
				.where(eq(inventoryLots.id, item.lotId))
				.limit(1);

			if (lot && !lot.quantityUnknown) {
				const effectiveTest = nextTest ?? lot.testStatus;
				const effectiveCondition = nextCondition ?? lot.stockCondition;
				const statusChanged =
					effectiveTest !== lot.testStatus || effectiveCondition !== lot.stockCondition;

				if (!statusChanged) {
					await tx
						.update(inventoryLots)
						.set({
							quantity: (lot.quantity ?? 0) + qty,
							updatedAt: new Date()
						})
						.where(eq(inventoryLots.id, lot.id));
				} else if ((lot.quantity ?? 0) === 0) {
					// Original lot is empty, safe to update its status in place
					await tx
						.update(inventoryLots)
						.set({
							quantity: qty,
							testStatus: effectiveTest,
							stockCondition: effectiveCondition,
							updatedAt: new Date()
						})
						.where(eq(inventoryLots.id, lot.id));
				} else {
					// Untouched tubes remain in the original lot; place returned tested/reclassified tubes into a matching lot
					const [matchingReturnLot] = await tx
						.select()
						.from(inventoryLots)
						.where(
							and(
								eq(inventoryLots.canonicalDesignation, lot.canonicalDesignation),
								eq(inventoryLots.stockCondition, effectiveCondition),
								eq(inventoryLots.testStatus, effectiveTest),
								lot.boxNo
									? eq(inventoryLots.boxNo, lot.boxNo)
									: sql`${inventoryLots.boxNo} IS NULL`,
								lot.boxLayer
									? eq(inventoryLots.boxLayer, lot.boxLayer)
									: sql`${inventoryLots.boxLayer} IS NULL`
							)
						)
						.limit(1);

					if (matchingReturnLot && !matchingReturnLot.quantityUnknown) {
						await tx
							.update(inventoryLots)
							.set({
								quantity: (matchingReturnLot.quantity ?? 0) + qty,
								updatedAt: new Date()
							})
							.where(eq(inventoryLots.id, matchingReturnLot.id));
					} else {
						await tx.insert(inventoryLots).values({
							tubeNumber: lot.tubeNumber,
							canonicalDesignation: lot.canonicalDesignation,
							normalizedKey: lot.normalizedKey,
							boxNo: lot.boxNo,
							boxLayer: lot.boxLayer,
							quantity: qty,
							quantityUnknown: false,
							comment: params.notes?.trim()
								? `Returned from pull sheet: ${params.notes.trim()}`
								: lot.comment,
							tubeRefId: lot.tubeRefId,
							stockCondition: effectiveCondition,
							testStatus: effectiveTest
						});
					}
				}
			}
		}

		const combinedNote = params.notes?.trim()
			? [item.notes, `Return note: ${params.notes.trim()}`].filter(Boolean).join(' | ')
			: item.notes;

		const [updatedItem] = await tx
			.update(pullRequestItems)
			.set({
				qtyReturned: item.qtyReturned + qty,
				notes: combinedNote
			})
			.where(eq(pullRequestItems.id, item.id))
			.returning();

		const nextStatus = await recomputeSheetStatus(tx, item.pullRequestId);

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_item_returned',
			entityType: 'pull_request_item',
			entityId: String(item.id),
			details: {
				pullRequestId: item.pullRequestId,
				lotId: item.lotId,
				designation: item.designation,
				qtyReturnedNow: qty,
				updatedTestStatus: nextTest,
				updatedStockCondition: nextCondition
			}
		});

		return { item: updatedItem, sheetStatus: nextStatus };
	});
}

export async function removePullLineItem(params: { itemId: number; actor: string }) {
	return db.transaction(async (tx) => {
		const [item] = await tx
			.select()
			.from(pullRequestItems)
			.where(eq(pullRequestItems.id, params.itemId))
			.limit(1);

		if (!item) {
			throw new Error('Pull sheet item not found.');
		}
		if (item.qtyPulled > 0) {
			throw new Error('Cannot remove an item that has already been pulled from stock. Use Return instead.');
		}

		await tx.delete(pullRequestItems).where(eq(pullRequestItems.id, item.id));
		await recomputeSheetStatus(tx, item.pullRequestId);

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_item_removed',
			entityType: 'pull_request_item',
			entityId: String(item.id),
			details: { pullRequestId: item.pullRequestId, designation: item.designation }
		});
	});
}

export async function closePullRequest(params: { pullRequestId: number; actor: string }) {
	return db.transaction(async (tx) => {
		const [updated] = await tx
			.update(pullRequests)
			.set({ status: 'Closed', updatedAt: new Date() })
			.where(eq(pullRequests.id, params.pullRequestId))
			.returning();

		if (!updated) {
			throw new Error('Pull sheet not found.');
		}

		await tx.insert(auditLog).values({
			actor: params.actor,
			action: 'pull_sheet_closed',
			entityType: 'pull_request',
			entityId: updated.requestCode,
			details: { pullRequestId: updated.id }
		});

		return updated;
	});
}
