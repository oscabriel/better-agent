import { tool } from "ai";
import Exa from "exa-js";
import { z } from "zod";

export function createWebSearchTool(apiKey: string) {
	const exa = new Exa(apiKey);

	return tool({
		description:
			"Search the web for up-to-date information, current events, news, and real-time data. Use this for questions about recent developments, latest releases, or anything requiring current web information.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.max(100)
				.describe("The search query for finding web information"),
		}),
		execute: async ({ query }) => {
			if (!query || query.trim() === "") {
				throw new Error("Web search requires a non-empty query parameter");
			}

			const response = await exa.searchAndContents(query, {
				type: "auto",
				numResults: 5,
				text: { maxCharacters: 1000 },
				highlights: {
					highlightsPerUrl: 3,
					numSentences: 2,
				},
				livecrawl: "fallback",
			});

			if (!response.results || response.results.length === 0) {
				throw new Error(`No web search results found for query: "${query}"`);
			}

			const searchResults = response.results.map((result) => ({
				title: result.title,
				url: result.url,
				content: result.text || "",
				highlights: result.highlights || [],
				publishedDate: result.publishedDate,
			}));

			return searchResults;
		},
	});
}

export function isWebSearchEnabled(
	webSearchEnabled: boolean | undefined,
	apiKey: string | undefined,
): boolean {
	return Boolean(webSearchEnabled && apiKey);
}
