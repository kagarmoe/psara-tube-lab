import {
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/**
 * Authenticated club administrators, curators, and optional individual member accounts.
 * Shared member passcode access works without requiring rows here; individual accounts
 * live strictly in Postgres (zero PII in the repository).
 */
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: text('username').notNull().unique(),
	displayName: text('display_name').notNull(),
	role: text('role').notNull().default('member'), // 'member' | 'curator' | 'admin'
	passwordHash: text('password_hash').notNull(),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Master Vacuum Tube Reference (`Tube Reference` sheet).
 * `tubeRefId` (`T0001`–`T0735`, preserving historical gap at `T0322`) is immutable.
 * Inventory lot counts and total stock quantities are computed dynamically via `inventoryLots`.
 */
export const tubeReferences = pgTable(
	'tube_references',
	{
		tubeRefId: text('tube_ref_id').primaryKey(),
		referenceDesignation: text('reference_designation').notNull(),
		normalizedKey: text('normalized_key').notNull(),
		referenceStatus: text('reference_status').notNull().default('Started'),
		lookupStatus: text('lookup_status').notNull().default('Active'),
		tubeFamily: text('tube_family'),
		internalStructure: text('internal_structure'),
		generalFunction: text('general_function'),
		base: text('base'),
		pinCount: integer('pin_count'),
		basingCode: text('basing_code'),
		basingCodes: jsonb('basing_codes').$type<string[]>().notNull().default([]),
		envelope: text('envelope'),
		cap: text('cap'),
		heaterVoltage: text('heater_voltage'),
		heaterCurrent: text('heater_current'),
		heatingMethod: text('heating_method'),
		maxDiameterIn: doublePrecision('max_diameter_in'),
		maxSeatedHeightIn: doublePrecision('max_seated_height_in'),
		maxOverallHeightIn: doublePrecision('max_overall_height_in'),
		technicalNotes: text('technical_notes'),
		primarySource: text('primary_source'),
		printedPage: text('printed_page'),
		secondarySource: text('secondary_source'),
		secondaryPage: text('secondary_page'),
		verificationStatus: text('verification_status'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('idx_tube_ref_normalized').on(table.normalizedKey),
		index('idx_tube_ref_designation').on(table.referenceDesignation),
		index('idx_tube_ref_lookup_status').on(table.lookupStatus),
		index('idx_tube_ref_base_pins').on(table.base, table.pinCount)
	]
);

/**
 * Storage locations (`Locations` sheet columns A:F).
 */
export const locations = pgTable('locations', {
	locationCode: text('location_code').primaryKey(),
	locationKind: text('location_kind').notNull(),
	description: text('description').notNull(),
	active: boolean('active').notNull().default(true),
	reviewStatus: text('review_status'),
	notes: text('notes')
});

/**
 * Multi-layer box definitions (`Locations` sheet columns H:K).
 */
export const boxLayers = pgTable(
	'box_layers',
	{
		id: serial('id').primaryKey(),
		box: text('box').notNull(),
		layer: text('layer').notNull(),
		active: boolean('active').notNull().default(true),
		notes: text('notes')
	},
	(table) => [uniqueIndex('uidx_box_layer').on(table.box, table.layer)]
);

/**
 * Physical club inventory lots (`PSARA Inventory` sheet).
 */
export const inventoryLots = pgTable(
	'inventory_lots',
	{
		id: serial('id').primaryKey(),
		sourceRow: integer('source_row'),
		tubeNumber: text('tube_number').notNull(),
		canonicalDesignation: text('canonical_designation').notNull(),
		normalizedKey: text('normalized_key').notNull(),
		boxNo: text('box_no'),
		quantity: integer('quantity'),
		quantityUnknown: boolean('quantity_unknown').notNull().default(false),
		boxLayer: text('box_layer'),
		comment: text('comment'),
		tubeRefId: text('tube_ref_id').references(() => tubeReferences.tubeRefId, {
			onDelete: 'set null'
		}),
		stockCondition: text('stock_condition').notNull().default('Unknown'),
		testStatus: text('test_status').notNull().default('Unknown'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('idx_inv_tube_ref').on(table.tubeRefId),
		index('idx_inv_normalized').on(table.normalizedKey),
		index('idx_inv_box_layer').on(table.boxNo, table.boxLayer)
	]
);

/**
 * Substitution and family relationships (`Relationships` sheet).
 * Note: "Related replaces Original" is strictly one-way (non-reversible).
 */
export const relationships = pgTable(
	'relationships',
	{
		id: serial('id').primaryKey(),
		inventorySourceRow: integer('inventory_source_row'),
		designation: text('designation').notNull(),
		relatedDesignation: text('related_designation').notNull(),
		sourceTubeRefId: text('source_tube_ref_id').references(() => tubeReferences.tubeRefId, {
			onDelete: 'set null'
		}),
		targetTubeRefId: text('target_tube_ref_id').references(() => tubeReferences.tubeRefId, {
			onDelete: 'set null'
		}),
		relationship: text('relationship').notNull(),
		direction: text('direction').notNull(),
		differenceType: text('difference_type'),
		qualificationNotes: text('qualification_notes'),
		source: text('source'),
		sourcePage: text('source_page'),
		originalNote: text('original_note'),
		verificationStatus: text('verification_status')
	},
	(table) => [
		index('idx_rel_source_ref').on(table.sourceTubeRefId),
		index('idx_rel_target_ref').on(table.targetTubeRefId),
		index('idx_rel_designations').on(table.designation, table.relatedDesignation)
	]
);

/**
 * Controlled vocabulary options (`Lists` sheet).
 */
export const controlledLists = pgTable(
	'controlled_lists',
	{
		id: serial('id').primaryKey(),
		listName: text('list_name').notNull(),
		value: text('value').notNull(),
		definitionUse: text('definition_use'),
		sourceBasis: text('source_basis'),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(table) => [uniqueIndex('uidx_controlled_list_value').on(table.listName, table.value)]
);

/**
 * Filament / heater pin-pair presets by base group (`Filament_heater_options` sheet).
 */
export const filamentHeaterOptions = pgTable('filament_heater_options', {
	id: serial('id').primaryKey(),
	listName: text('list_name').notNull(),
	baseGroup: text('base_group').notNull(),
	optionOrder: integer('option_order').notNull(),
	filamentHeaterOption: text('filament_heater_option').notNull(),
	pin1: text('pin_1'),
	pin2: text('pin_2'),
	thirdPinOrTap: text('third_pin_or_tap'),
	treeBehavior: text('tree_behavior'),
	defaultAssumption: boolean('default_assumption').notNull().default(false),
	notes: text('notes')
});

/**
 * Functional electrodes used in the Mystery Tube identification helper (`Functional_elements` sheet).
 */
export const functionalElements = pgTable('functional_elements', {
	id: serial('id').primaryKey(),
	listName: text('list_name').notNull(),
	tier: text('tier').notNull(),
	optionOrder: integer('option_order').notNull(),
	functionalElement: text('functional_element').notNull(),
	symbol: text('symbol'),
	recommendedForMainOptions: boolean('recommended_for_main_options').notNull().default(false),
	functionDescription: text('function_description'),
	notes: text('notes')
});

/**
 * Reference basing diagrams and envelope outline PNGs (`Basing Diagrams`, `Envelope Outlines`,
 * `asset_manifest.csv`, and `tungsol_image_index.csv`).
 */
export const diagramAssets = pgTable(
	'diagram_assets',
	{
		id: serial('id').primaryKey(),
		category: text('category').notNull(), // 'Basing' | 'Envelope'
		code: text('code').notNull(),
		lookupKey: text('lookup_key').notNull(),
		assetPath: text('asset_path').notNull().unique(),
		source: text('source'),
		printedPage: text('printed_page'),
		alternateCode: text('alternate_code'),
		envelopeShape: text('envelope_shape'),
		baseLabel: text('base_label'),
		cap: text('cap'),
		notes: text('notes')
	},
	(table) => [
		index('idx_diagram_category_key').on(table.category, table.lookupKey),
		index('idx_diagram_code').on(table.code)
	]
);

/**
 * Club member pull sheets / checkout requests.
 */
export const pullRequests = pgTable('pull_requests', {
	id: serial('id').primaryKey(),
	requestCode: text('request_code').notNull().unique(),
	memberName: text('member_name').notNull(),
	purpose: text('purpose'),
	status: text('status').notNull().default('Pending'), // 'Pending' | 'Pulled' | 'Returned' | 'Closed'
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Line items on a member pull request with atomic pull/return counters.
 */
export const pullRequestItems = pgTable('pull_request_items', {
	id: serial('id').primaryKey(),
	pullRequestId: integer('pull_request_id')
		.notNull()
		.references(() => pullRequests.id, { onDelete: 'cascade' }),
	lotId: integer('lot_id').references(() => inventoryLots.id, { onDelete: 'set null' }),
	tubeRefId: text('tube_ref_id').references(() => tubeReferences.tubeRefId, {
		onDelete: 'set null'
	}),
	designation: text('designation').notNull(),
	boxNo: text('box_no'),
	boxLayer: text('box_layer'),
	qtyRequested: integer('qty_requested').notNull(),
	qtyPulled: integer('qty_pulled').notNull().default(0),
	qtyReturned: integer('qty_returned').notNull().default(0),
	notes: text('notes')
});

/**
 * Historical and new single acquisition log entries (`Acquisition Entries` sheet).
 */
export const acquisitionEntries = pgTable('acquisition_entries', {
	entryId: text('entry_id').primaryKey(),
	enteredAt: text('entered_at'),
	status: text('status').notNull(),
	selectedTubeRefId: text('selected_tube_ref_id').references(() => tubeReferences.tubeRefId, {
		onDelete: 'set null'
	}),
	observedDesignation: text('observed_designation'),
	quantity: integer('quantity'),
	location: text('location'),
	layer: text('layer'),
	envelope: text('envelope'),
	base: text('base'),
	cap: text('cap'),
	basingCode: text('basing_code'),
	baseMaterial: text('base_material'),
	rcaOutline: text('rca_outline'),
	diameterIn: doublePrecision('diameter_in'),
	heightIn: doublePrecision('height_in'),
	notes: text('notes'),
	referenceChanges: text('reference_changes'),
	source: text('source'),
	sourcePage: text('source_page'),
	originalReferenceSnapshot: text('original_reference_snapshot'),
	stockCondition: text('stock_condition'),
	testStatus: text('test_status'),
	lotId: integer('lot_id').references(() => inventoryLots.id, { onDelete: 'set null' })
});

/**
 * Uploaded/staged spreadsheet batch headers (`Batch Import` groupings).
 */
export const acquisitionBatches = pgTable('acquisition_batches', {
	id: serial('id').primaryKey(),
	batchName: text('batch_name').notNull(),
	sourceType: text('source_type').notNull(),
	createdBy: text('created_by'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Staged batch import rows with `sourceSignature` idempotency (`Batch Import` sheet).
 */
export const batchImportRows = pgTable('batch_import_rows', {
	id: serial('id').primaryKey(),
	batchId: integer('batch_id')
		.notNull()
		.references(() => acquisitionBatches.id, { onDelete: 'cascade' }),
	readingId: text('reading_id').notNull(),
	sourceSignature: text('source_signature').notNull().unique(),
	box: text('box'),
	layer: text('layer'),
	rowNum: text('row_num'),
	colNum: text('col_num'),
	brand: text('brand'),
	tube: text('tube'),
	qty: integer('qty'),
	confidence: text('confidence'),
	labelType: text('label_type'),
	stockCondition: text('stock_condition'),
	testStatus: text('test_status'),
	itemCategory: text('item_category'),
	checkFlag: text('check_flag'),
	notes: text('notes'),
	sourceImage: text('source_image'),
	importTube: text('import_tube'),
	importQty: integer('import_qty'),
	importBox: text('import_box'),
	importLayer: text('import_layer'),
	importStock: text('import_stock'),
	importTest: text('import_test'),
	importEnvelope: text('import_envelope'),
	reviewed: boolean('reviewed').notNull().default(false),
	selectedTubeRefId: text('selected_tube_ref_id').references(() => tubeReferences.tubeRefId, {
		onDelete: 'set null'
	}),
	importStatus: text('import_status').notNull().default('Pending'),
	reasonOrCandidates: text('reason_or_candidates'),
	acquisitionId: text('acquisition_id'),
	importedAt: text('imported_at'),
	sourceDetails: text('source_details')
});

/**
 * Curator exception / data quality review queue (`Review` sheet).
 */
export const reviewQueue = pgTable('review_queue', {
	id: serial('id').primaryKey(),
	sheet: text('sheet'),
	referenceRow: integer('reference_row'),
	field: text('field'),
	currentValue: text('current_value'),
	issue: text('issue'),
	suggestedAction: text('suggested_action'),
	status: text('status').notNull().default('Examine'),
	tubeRefId: text('tube_ref_id').references(() => tubeReferences.tubeRefId, {
		onDelete: 'set null'
	}),
	resolutionNotes: text('resolution_notes'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Saved Mystery Tube Helper observations & pinout runs.
 */
export const unmarkedObservations = pgTable('unmarked_observations', {
	id: serial('id').primaryKey(),
	pinCount: integer('pin_count'),
	baseType: text('base_type'),
	topCap: text('top_cap'),
	envelope: text('envelope'),
	diameterIn: doublePrecision('diameter_in'),
	heightIn: doublePrecision('height_in'),
	filamentPins: text('filament_pins'),
	continuityNotes: text('continuity_notes'),
	functionalElementsJson: jsonb('functional_elements_json').$type<string[]>().notNull().default([]),
	matchedTubeRefIds: jsonb('matched_tube_ref_ids').$type<string[]>().notNull().default([]),
	photoExtractedJson: jsonb('photo_extracted_json').$type<Record<string, unknown> | null>(),
	observerName: text('observer_name'),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Audit trail for inventory pulls, returns, intakes, batch commits, and curator edits.
 */
export const auditLog = pgTable('audit_log', {
	id: serial('id').primaryKey(),
	actor: text('actor').notNull(),
	action: text('action').notNull(),
	entityType: text('entity_type').notNull(),
	entityId: text('entity_id').notNull(),
	details: jsonb('details').$type<Record<string, unknown> | null>(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
