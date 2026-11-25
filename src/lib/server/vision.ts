/**
 * Strictly optional progressive-enhancement vision adapter for the Mystery Tube Helper.
 * Never persists keys or expects key files in the repository: reads either runtime
 * process environment (`VISION_PROVIDER`, `VISION_API_KEY`, `VISION_BASE_URL`, `VISION_MODEL`)
 * or a stateless per-request BYOK credential passed strictly in memory from the browser.
 */

export type VisionProvider = 'gemini' | 'anthropic' | 'openai' | 'local';

export interface VisionConfigInput {
	provider?: VisionProvider;
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

export interface VisionPrefillSuggestion {
	pinCount: number | null;
	baseGuess: string | null;
	hasTopCap: 'yes' | 'no' | 'any';
	envelopeGuess: string | null;
	visibleMarkings: string | null;
	visualClues: string[];
	notes: string;
	providerUsed: string;
}

const EXTRACTION_PROMPT = `You are assisting an antique radio club member identify an unmarked vacuum tube from a photo.
Return ONLY valid JSON with these keys (no markdown fences):
{
  "pinCount": integer or null,
  "baseGuess": string or null (e.g. "Octal 8-pin", "Miniature 7-pin", "Miniature 9-pin", "Loktal/Loctal 8-pin", "UX 4-pin", "UY 5-pin", "Large-pin 6-pin", "Compactron 12-pin"),
  "hasTopCap": "yes" | "no" | "any",
  "envelopeGuess": string or null (e.g. "T5½", "T6½", "T9", "T12", "MT8", "ST12", "ST14"),
  "visibleMarkings": string or null,
  "visualClues": array of strings among ["Metal shell / external shield", "Plate / Anode", "Cathode", "Grid 1", "Grid 2", "Internal shield", "Target"],
  "notes": short plain-English physical observation note
}
If unsure on any field, use null or "any" rather than guessing.`;

export function getServerVisionCapabilities(): {
	serverConfigured: boolean;
	provider: string | null;
} {
	const provider = (process.env.VISION_PROVIDER ?? '').trim().toLowerCase();
	const hasKey = Boolean((process.env.VISION_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim());
	const hasLocal = provider === 'local' && Boolean((process.env.VISION_BASE_URL ?? '').trim());
	if (hasLocal) return { serverConfigured: true, provider: 'local' };
	if (provider && hasKey) return { serverConfigured: true, provider };
	if (hasKey) return { serverConfigured: true, provider: 'gemini' };
	return { serverConfigured: false, provider: null };
}

function parseJsonPayload(rawText: string): Partial<VisionPrefillSuggestion> {
	const cleaned = rawText
		.trim()
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/```$/i, '')
		.trim();
	const match = cleaned.match(/\{[\s\S]*\}/);
	const parsed = JSON.parse(match ? match[0] : cleaned) as Record<string, unknown>;

	const pinCount =
		typeof parsed.pinCount === 'number' && Number.isInteger(parsed.pinCount)
			? parsed.pinCount
			: null;
	const hasTopCap =
		parsed.hasTopCap === 'yes' || parsed.hasTopCap === 'no' ? parsed.hasTopCap : 'any';

	return {
		pinCount,
		baseGuess: typeof parsed.baseGuess === 'string' ? parsed.baseGuess : null,
		hasTopCap,
		envelopeGuess: typeof parsed.envelopeGuess === 'string' ? parsed.envelopeGuess : null,
		visibleMarkings: typeof parsed.visibleMarkings === 'string' ? parsed.visibleMarkings : null,
		visualClues: Array.isArray(parsed.visualClues)
			? parsed.visualClues.filter((v): v is string => typeof v === 'string')
			: [],
		notes:
			typeof parsed.notes === 'string'
				? parsed.notes
				: 'Verify pin count and filament continuity physically before relying on AI guesses.'
	};
}

export async function extractTubeFeaturesFromImage(params: {
	imageBase64: string;
	mimeType: string;
	override?: VisionConfigInput;
}): Promise<VisionPrefillSuggestion> {
	const overrideProvider = params.override?.provider;
	const envProvider = (process.env.VISION_PROVIDER ?? '').trim().toLowerCase() as VisionProvider;
	const apiKey = (
		params.override?.apiKey ??
		process.env.VISION_API_KEY ??
		process.env.GEMINI_API_KEY ??
		''
	).trim();
	const provider: VisionProvider =
		overrideProvider ?? (envProvider || (apiKey ? 'gemini' : 'local'));

	if (provider !== 'local' && !apiKey) {
		throw new Error('No vision API key configured or provided for photo pre-fill.');
	}

	let rawText = '';

	if (provider === 'gemini') {
		const model = params.override?.model?.trim() || process.env.VISION_MODEL || 'gemini-2.5-flash';
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
			model
		)}:generateContent?key=${encodeURIComponent(apiKey)}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{ text: EXTRACTION_PROMPT },
							{
								inline_data: {
									mime_type: params.mimeType,
									data: params.imageBase64
								}
							}
						]
					}
				]
			})
		});
		if (!res.ok) {
			throw new Error(`Gemini vision request returned HTTP ${res.status}`);
		}
		const data = (await res.json()) as {
			candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		};
		rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
	} else if (provider === 'anthropic') {
		const model =
			params.override?.model?.trim() || process.env.VISION_MODEL || 'claude-3-5-sonnet-latest';
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model,
				max_tokens: 500,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'image',
								source: {
									type: 'base64',
									media_type: params.mimeType,
									data: params.imageBase64
								}
							},
							{ type: 'text', text: EXTRACTION_PROMPT }
						]
					}
				]
			})
		});
		if (!res.ok) {
			throw new Error(`Anthropic vision request returned HTTP ${res.status}`);
		}
		const data = (await res.json()) as {
			content?: Array<{ type: string; text?: string }>;
		};
		rawText = data.content?.find((c) => c.type === 'text')?.text ?? '';
	} else {
		// OpenAI or OpenAI-compatible local endpoint (e.g. Ollama / LM Studio)
		const baseUrl = (
			params.override?.baseUrl?.trim() ||
			process.env.VISION_BASE_URL ||
			(provider === 'local' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1')
		).replace(/\/+$/, '');
		const model =
			params.override?.model?.trim() ||
			process.env.VISION_MODEL ||
			(provider === 'local' ? 'qwen2.5vl' : 'gpt-4o-mini');

		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (apiKey) headers.authorization = `Bearer ${apiKey}`;

		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				model,
				max_tokens: 500,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: EXTRACTION_PROMPT },
							{
								type: 'image_url',
								image_url: { url: `data:${params.mimeType};base64,${params.imageBase64}` }
							}
						]
					}
				]
			})
		});
		if (!res.ok) {
			throw new Error(`${provider} vision request returned HTTP ${res.status}`);
		}
		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		rawText = data.choices?.[0]?.message?.content ?? '';
	}

	const parsed = parseJsonPayload(rawText);
	return {
		pinCount: parsed.pinCount ?? null,
		baseGuess: parsed.baseGuess ?? null,
		hasTopCap: parsed.hasTopCap ?? 'any',
		envelopeGuess: parsed.envelopeGuess ?? null,
		visibleMarkings: parsed.visibleMarkings ?? null,
		visualClues: parsed.visualClues ?? [],
		notes: parsed.notes ?? 'Verify measurements and filament continuity physically.',
		providerUsed: provider
	};
}
