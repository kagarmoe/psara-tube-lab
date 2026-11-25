import {
	cleanDesignation,
	normalizeDesignationKey,
	splitDesignationAliases
} from './normalize';

export type MatchTier = 1 | 2 | 3 | 4;

export interface SearchCandidateInput {
	tubeRefId: string;
	referenceDesignation: string;
	normalizedKey: string;
	lookupStatus: string;
	tubeFamily?: string | null;
	internalStructure?: string | null;
	generalFunction?: string | null;
	base?: string | null;
	envelope?: string | null;
	basingCode?: string | null;
	technicalNotes?: string | null;
	lotComments?: string[];
	lotTubeNumbers?: string[];
}

export interface RelationshipRecordInput {
	id: number;
	designation: string;
	relatedDesignation: string;
	sourceTubeRefId: string | null;
	targetTubeRefId: string | null;
	relationship: string;
	direction: string;
	differenceType: string | null;
	qualificationNotes: string | null;
	originalNote: string | null;
	source: string | null;
	sourcePage: string | null;
	verificationStatus: string | null;
}

export interface ClassifiedRelationship {
	id: number;
	side: 'outgoing' | 'incoming';
	peerDesignation: string;
	peerTubeRefId: string | null;
	relationship: string;
	direction: string;
	roleBadge: string;
	summaryText: string;
	canUseAsSubstitute: boolean;
	oneWayWarning: boolean;
	differenceType: string | null;
	qualificationNotes: string | null;
	originalNote: string | null;
	source: string | null;
	sourcePage: string | null;
	verificationStatus: string | null;
}

/**
 * Determine direct search match tier (1 = Exact, 2 = Prefix, 4 = Keyword/Note).
 * Tier 3 (Related/Substitute) is resolved separately via `relationships`.
 */
export function classifyDirectMatchTier(
	queryRaw: string,
	candidate: SearchCandidateInput
): 1 | 2 | 4 | null {
	const qClean = cleanDesignation(queryRaw);
	const qKey = normalizeDesignationKey(queryRaw);
	if (!qClean) return null;

	// Tier 1: Exact TubeRefID, exact canonical designation, normalized key, or alias token
	if (
		candidate.tubeRefId.toUpperCase() === qClean ||
		candidate.referenceDesignation.toUpperCase() === qClean ||
		(qKey.length > 0 && candidate.normalizedKey === qKey) ||
		splitDesignationAliases(candidate.referenceDesignation).some(
			(alias) => normalizeDesignationKey(alias) === qKey && qKey.length > 0
		) ||
		(candidate.lotTubeNumbers ?? []).some(
			(n) => qKey.length > 0 && normalizeDesignationKey(n) === qKey
		)
	) {
		return 1;
	}

	// Tier 2: Prefix match on designation, normalized key, or alias tokens
	if (
		candidate.referenceDesignation.toUpperCase().startsWith(qClean) ||
		(qKey.length >= 2 && candidate.normalizedKey.startsWith(qKey)) ||
		splitDesignationAliases(candidate.referenceDesignation).some(
			(alias) => qKey.length >= 2 && normalizeDesignationKey(alias).startsWith(qKey)
		)
	) {
		return 2;
	}

	// Tier 4: Substring / keyword match across family, function, notes, base, envelope, lots
	const qLower = qClean.toLowerCase();
	const haystack = [
		candidate.referenceDesignation,
		candidate.tubeFamily,
		candidate.internalStructure,
		candidate.generalFunction,
		candidate.base,
		candidate.envelope,
		candidate.basingCode,
		candidate.technicalNotes,
		...(candidate.lotComments ?? []),
		...(candidate.lotTubeNumbers ?? [])
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();

	if (haystack.includes(qLower)) {
		return 4;
	}

	return null;
}

/**
 * Enforce Marc's direction rule (`PSARA_ReverseRelationshipAllowed`):
 * - `Interchangeable` applies in both directions.
 * - `Related replaces Original` applies ONLY in the forward direction (Related -> Original).
 *   Viewing from the replacement side marks it as a one-way replacement warning so members do not
 *   mistakenly put the older Original tube into a socket expecting the replacement's ratings.
 * - `Related only` is informational in both directions (not a drop-in substitute).
 */
export function classifyRelationshipView(
	rel: RelationshipRecordInput,
	currentTubeRefId: string,
	currentDesignation: string
): ClassifiedRelationship | null {
	const currentKey = normalizeDesignationKey(currentDesignation);
	const isOutgoing =
		rel.sourceTubeRefId === currentTubeRefId ||
		(!rel.sourceTubeRefId && normalizeDesignationKey(rel.designation) === currentKey);
	const isIncoming =
		rel.targetTubeRefId === currentTubeRefId ||
		(!rel.targetTubeRefId && normalizeDesignationKey(rel.relatedDesignation) === currentKey);

	if (!isOutgoing && !isIncoming) return null;

	const side: 'outgoing' | 'incoming' = isOutgoing ? 'outgoing' : 'incoming';
	const peerDesignation = side === 'outgoing' ? rel.relatedDesignation : rel.designation;
	const peerTubeRefId = side === 'outgoing' ? rel.targetTubeRefId : rel.sourceTubeRefId;

	if (rel.direction === 'Interchangeable') {
		return {
			id: rel.id,
			side,
			peerDesignation,
			peerTubeRefId,
			relationship: rel.relationship,
			direction: rel.direction,
			roleBadge: 'Interchangeable',
			summaryText: `${peerDesignation} is interchangeable with ${currentDesignation}.`,
			canUseAsSubstitute: true,
			oneWayWarning: false,
			differenceType: rel.differenceType,
			qualificationNotes: rel.qualificationNotes,
			originalNote: rel.originalNote,
			source: rel.source,
			sourcePage: rel.sourcePage,
			verificationStatus: rel.verificationStatus
		};
	}

	if (rel.direction === 'Related replaces Original') {
		if (side === 'outgoing') {
			return {
				id: rel.id,
				side,
				peerDesignation,
				peerTubeRefId,
				relationship: rel.relationship,
				direction: rel.direction,
				roleBadge: 'Upgrade / Replacement Available',
				summaryText: `${peerDesignation} can replace ${currentDesignation} (one-way).`,
				canUseAsSubstitute: true,
				oneWayWarning: true,
				differenceType: rel.differenceType,
				qualificationNotes: rel.qualificationNotes,
				originalNote: rel.originalNote,
				source: rel.source,
				sourcePage: rel.sourcePage,
				verificationStatus: rel.verificationStatus
			};
		}

		// Reversed view: never advertise Original as a substitute for Related!
		return {
			id: rel.id,
			side,
			peerDesignation,
			peerTubeRefId,
			relationship: rel.relationship,
			direction: rel.direction,
			roleBadge: 'One-Way Warning — Do Not Reverse',
			summaryText: `${currentDesignation} replaces ${rel.designation}. Do NOT substitute ${rel.designation} in place of ${currentDesignation}.`,
			canUseAsSubstitute: false,
			oneWayWarning: true,
			differenceType: rel.differenceType,
			qualificationNotes: rel.qualificationNotes,
			originalNote: rel.originalNote,
			source: rel.source,
			sourcePage: rel.sourcePage,
			verificationStatus: rel.verificationStatus
		};
	}

	return {
		id: rel.id,
		side,
		peerDesignation,
		peerTubeRefId,
		relationship: rel.relationship,
		direction: rel.direction,
		roleBadge: 'Related Type (Check Specs)',
		summaryText: `${peerDesignation} is related to ${currentDesignation}, not a confirmed direct substitute.`,
		canUseAsSubstitute: false,
		oneWayWarning: false,
		differenceType: rel.differenceType,
		qualificationNotes: rel.qualificationNotes,
		originalNote: rel.originalNote,
		source: rel.source,
		sourcePage: rel.sourcePage,
		verificationStatus: rel.verificationStatus
	};
}

/**
 * Check whether traversing from a Tier 1/2 match over `rel` may surface the peer
 * as a Tier 3 search substitute candidate.
 */
export function isNavigableSubstituteEdge(
	rel: RelationshipRecordInput,
	matchedTubeRefId: string,
	matchedDesignation: string
): { peerTubeRefId: string | null; reason: string } | null {
	const classified = classifyRelationshipView(rel, matchedTubeRefId, matchedDesignation);
	if (!classified || !classified.canUseAsSubstitute) {
		return null;
	}
	return {
		peerTubeRefId: classified.peerTubeRefId,
		reason:
			classified.side === 'outgoing' && rel.direction === 'Related replaces Original'
				? `${classified.relationship} for ${matchedDesignation}`
				: `${classified.relationship} (${classified.direction}) with ${matchedDesignation}`
	};
}

/**
 * Normalize envelope descriptors like "T5½", "T-5 1/2", "MT8B", "ST-12" into
 * comparable keys for matching reference Envelope Outline diagrams.
 */
export function normalizeEnvelopeShapeKey(raw: string | null | undefined): string {
	if (!raw) return '';
	let s = raw
		.trim()
		.toUpperCase()
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.replace(/½/g, '.5')
		.replace(/¼/g, '.25')
		.replace(/¾/g, '.75')
		.replace(/\s+1\/2/g, '.5')
		.replace(/1\/2/g, '.5')
		.replace(/[\s-]+/g, '');

	if (s === 'METALTYPE' || s.startsWith('MT')) {
		return 'METAL';
	}
	return s;
}
