import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2Middleware,
} from "@ai-sdk/provider";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";

export const loggingMiddleware: LanguageModelV2Middleware = {
	wrapGenerate: async ({
		doGenerate,
		params: _params,
	}: {
		doGenerate: () => PromiseLike<
			Awaited<ReturnType<LanguageModelV2["doGenerate"]>>
		>;
		params: LanguageModelV2CallOptions;
	}) => {
		const result = await doGenerate();
		return result;
	},

	wrapStream: async ({
		doStream,
		params: _params,
	}: {
		doStream: () => PromiseLike<
			Awaited<ReturnType<LanguageModelV2["doStream"]>>
		>;
		params: LanguageModelV2CallOptions;
	}) => {
		const { stream, ...rest } = await doStream();

		const transformStream = new TransformStream({
			flush() {},
		});

		return {
			stream: stream.pipeThrough(transformStream),
			...rest,
		};
	},
};

export function withStandardMiddleware(
	model: LanguageModelV2,
	options?: {
		temperature?: number;
		maxOutputTokens?: number;
		enableLogging?: boolean;
	},
) {
	const middlewares = [];

	if (options?.enableLogging) {
		middlewares.push(loggingMiddleware);
	}

	middlewares.push(
		defaultSettingsMiddleware({
			settings: {
				temperature: options?.temperature ?? 0.7,
				maxOutputTokens: options?.maxOutputTokens,
			},
		}),
	);

	return wrapLanguageModel({
		model,
		middleware: middlewares,
	});
}
