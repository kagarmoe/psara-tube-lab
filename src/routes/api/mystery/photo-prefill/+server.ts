import { json } from '@sveltejs/kit';
import {
	extractTubeFeaturesFromImage,
	type VisionConfigInput,
	type VisionProvider
} from '$lib/server/vision';
import type { RequestHandler } from './$types';

const ALLOWED_PROVIDERS = new Set<VisionProvider>(['gemini', 'anthropic', 'openai', 'local']);

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const imageBase64 = String(body?.imageBase64 ?? '').trim();
	const mimeType = String(body?.mimeType ?? 'image/jpeg').trim();

	if (!imageBase64 || imageBase64.length > 8_000_000) {
		return json(
			{ error: 'Please provide an image under ~6 MB for photo analysis.' },
			{ status: 400 }
		);
	}

	const override: VisionConfigInput | undefined = body?.provider
		? {
				provider: ALLOWED_PROVIDERS.has(body.provider) ? body.provider : undefined,
				apiKey: body.apiKey ? String(body.apiKey) : undefined,
				baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
				model: body.model ? String(body.model) : undefined
			}
		: undefined;

	try {
		const suggestion = await extractTubeFeaturesFromImage({
			imageBase64,
			mimeType,
			override
		});
		return json({ suggestion });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Photo extraction failed.';
		return json({ error: message }, { status: 400 });
	}
};
