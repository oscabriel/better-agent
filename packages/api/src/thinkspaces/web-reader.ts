/**
 * The web reading seam behind the built-in web tools. The concrete provider
 * is an implementation detail with two product guarantees: it requires no
 * user credential and performs no writes (GET only). Failures are signalled
 * with a product-safe error so the tool layer can degrade inside the turn.
 */

export const WEB_SEARCH_RESULT_MAX_CHARS = 8000;
export const WEB_FETCH_CONTENT_MAX_CHARS = 16_000;

/** Product-safe by construction: callers may surface the message verbatim. */
export class ThinkspaceWebReadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ThinkspaceWebReadError";
	}
}

export interface ThinkspaceWebReader {
	fetchPage: (url: string) => Promise<string>;
	search: (query: string) => Promise<string>;
}

const WEB_FETCH_UNSUPPORTED_URL_MESSAGE =
	"Only public http(s) URLs can be fetched by this Thinkspace Agent.";
const WEB_FETCH_UNAVAILABLE_MESSAGE =
	"That web page could not be fetched for this turn. It may be unavailable or unreachable.";
const WEB_SEARCH_UNAVAILABLE_MESSAGE =
	"Web search is temporarily unavailable for this turn. Continue with the available context.";

export const assertFetchableWebUrl = (url: string): URL => {
	let parsed: URL;

	try {
		parsed = new URL(url);
	} catch {
		throw new ThinkspaceWebReadError(WEB_FETCH_UNSUPPORTED_URL_MESSAGE);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new ThinkspaceWebReadError(WEB_FETCH_UNSUPPORTED_URL_MESSAGE);
	}

	return parsed;
};

const truncate = (text: string, maxChars: number): string =>
	text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[Content truncated.]` : text;

interface DuckDuckGoTopic {
	FirstURL?: string;
	Text?: string;
	Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoAnswer {
	AbstractText?: string;
	AbstractURL?: string;
	Heading?: string;
	RelatedTopics?: DuckDuckGoTopic[];
}

const flattenSearchTopics = (topics: readonly DuckDuckGoTopic[]): DuckDuckGoTopic[] =>
	topics.flatMap((topic) => (topic.Topics ? flattenSearchTopics(topic.Topics) : [topic]));

const formatSearchAnswer = (query: string, answer: DuckDuckGoAnswer): string => {
	const lines: string[] = [];

	if (answer.AbstractText) {
		lines.push(`${answer.Heading ?? query}: ${answer.AbstractText}`);

		if (answer.AbstractURL) {
			lines.push(`Source: ${answer.AbstractURL}`);
		}
	}

	const topics = flattenSearchTopics(answer.RelatedTopics ?? []).filter(
		(topic) => topic.Text && topic.FirstURL,
	);

	for (const topic of topics) {
		lines.push(`- ${topic.Text} (${topic.FirstURL})`);
	}

	if (lines.length === 0) {
		return `No web results were found for "${query}".`;
	}

	return truncate(lines.join("\n"), WEB_SEARCH_RESULT_MAX_CHARS);
};

/**
 * Credential-free provider on the platform fetch: search through the
 * DuckDuckGo Instant Answer API, page reads as plain GET requests.
 */
export const createFetchWebReader = (fetchImpl: typeof fetch = fetch): ThinkspaceWebReader => ({
	fetchPage: async (url) => {
		const parsed = assertFetchableWebUrl(url);

		let response: Response;

		try {
			response = await fetchImpl(parsed.toString(), { method: "GET", redirect: "follow" });
		} catch {
			throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
		}

		if (!response.ok) {
			throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
		}

		return truncate(await response.text(), WEB_FETCH_CONTENT_MAX_CHARS);
	},
	search: async (query) => {
		const endpoint = new URL("https://api.duckduckgo.com/");
		endpoint.searchParams.set("q", query);
		endpoint.searchParams.set("format", "json");
		endpoint.searchParams.set("no_html", "1");
		endpoint.searchParams.set("skip_disambig", "1");

		let answer: DuckDuckGoAnswer;

		try {
			const response = await fetchImpl(endpoint.toString(), { method: "GET" });

			if (!response.ok) {
				throw new Error("search responded with a non-OK status");
			}

			answer = (await response.json()) as DuckDuckGoAnswer;
		} catch {
			throw new ThinkspaceWebReadError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
		}

		return formatSearchAnswer(query, answer);
	},
});
