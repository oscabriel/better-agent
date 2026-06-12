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

const PRIVATE_HOSTNAME_PATTERNS = [
	/^localhost$/iu,
	/\.local(?:host|domain)?$/iu,
	/^127\./u,
	/^0\.0\.0\.0$/u,
	/^10\./u,
	/^192\.168\./u,
	/^172\.(?:1[6-9]|2\d|3[01])\./u,
	/^169\.254\./u,
	/^\[?::1\]?$/u,
	/^\[?f[cd][0-9a-f]{2}:/iu,
	/^\[?fe80:/iu,
];

const isPrivateHostname = (hostname: string): boolean =>
	PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));

/**
 * Scheme and obvious-private-host gate, applied to the requested URL and to
 * every redirect hop. The deployed Workers platform blocks private-network
 * egress anyway; this keeps local and future runtimes from reaching loopback
 * or RFC1918 hosts through the agent. A public hostname resolving privately
 * is the platform's job to stop — DNS is not visible at this layer.
 */
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

	if (isPrivateHostname(parsed.hostname)) {
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
const WEB_FETCH_MAX_REDIRECTS = 5;

const isRedirectStatus = (status: number): boolean => status >= 300 && status < 400;

export const createFetchWebReader = (fetchImpl: typeof fetch = fetch): ThinkspaceWebReader => ({
	// Redirects are followed manually so every hop passes the same URL gate
	// the requested URL did — a public page cannot bounce the agent onto a
	// loopback or private host.
	fetchPage: async (url) => {
		let target = assertFetchableWebUrl(url);

		for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {
			let response: Response;

			try {
				response = await fetchImpl(target.toString(), { method: "GET", redirect: "manual" });
			} catch {
				throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
			}

			if (isRedirectStatus(response.status)) {
				const location = response.headers.get("location");

				if (!location) {
					throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
				}

				target = assertFetchableWebUrl(new URL(location, target).toString());
				continue;
			}

			if (!response.ok) {
				throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
			}

			return truncate(await response.text(), WEB_FETCH_CONTENT_MAX_CHARS);
		}

		throw new ThinkspaceWebReadError(WEB_FETCH_UNAVAILABLE_MESSAGE);
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
