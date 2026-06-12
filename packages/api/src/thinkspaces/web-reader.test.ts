import assert from "node:assert/strict";
import test from "node:test";

import {
	assertFetchableWebUrl,
	createFetchWebReader,
	ThinkspaceWebReadError,
	WEB_FETCH_CONTENT_MAX_CHARS,
} from "./web-reader";

const jsonResponse = (body: unknown): Response => Response.json(body);

test("only http(s) URLs are fetchable; everything else is rejected product-safely", () => {
	assert.equal(assertFetchableWebUrl("https://example.com/pricing").hostname, "example.com");
	assert.equal(assertFetchableWebUrl("http://example.com").protocol, "http:");

	const scriptScheme = "java";
	const rejectedUrls = [
		"ftp://example.com",
		"file:///etc/passwd",
		`${scriptScheme}script:alert(1)`,
		"not a url",
	];

	for (const url of rejectedUrls) {
		assert.throws(() => assertFetchableWebUrl(url), ThinkspaceWebReadError);
	}
});

test("fetchPage performs a GET and truncates oversized content to the cap", async () => {
	const requests: { method?: string; url: string }[] = [];
	const reader = createFetchWebReader((input, init) => {
		requests.push({ method: init?.method, url: String(input) });
		return Promise.resolve(new Response("x".repeat(WEB_FETCH_CONTENT_MAX_CHARS + 500)));
	});

	const content = await reader.fetchPage("https://example.com/pricing");

	assert.equal(requests[0]?.method, "GET");
	assert.equal(requests[0]?.url, "https://example.com/pricing");
	assert.ok(content.length < WEB_FETCH_CONTENT_MAX_CHARS + 100);
	assert.match(content, /\[Content truncated\.\]/u);
});

test("fetch failures and non-OK responses surface product-safe errors without transport detail", async () => {
	const failingReader = createFetchWebReader(() =>
		Promise.reject(new Error("getaddrinfo ENOTFOUND internal-host")),
	);
	await assert.rejects(failingReader.fetchPage("https://example.com"), (error: unknown) => {
		assert.ok(error instanceof ThinkspaceWebReadError);
		assert.doesNotMatch(error.message, /ENOTFOUND|internal-host/u);
		return true;
	});

	const notOkReader = createFetchWebReader(() =>
		Promise.resolve(new Response("forbidden", { status: 403 })),
	);
	await assert.rejects(notOkReader.fetchPage("https://example.com"), ThinkspaceWebReadError);
});

test("search formats the instant answer and related topics into compact result lines", async () => {
	const reader = createFetchWebReader((input) => {
		const url = new URL(String(input));
		assert.equal(url.origin, "https://api.duckduckgo.com");
		assert.equal(url.searchParams.get("q"), "observability vendors");

		return Promise.resolve(
			jsonResponse({
				AbstractText: "Observability is the ability to infer internal state.",
				AbstractURL: "https://en.wikipedia.org/wiki/Observability",
				Heading: "Observability",
				RelatedTopics: [
					{ FirstURL: "https://example.com/a", Text: "Vendor A overview" },
					{ Topics: [{ FirstURL: "https://example.com/b", Text: "Vendor B overview" }] },
				],
			}),
		);
	});

	const results = await reader.search("observability vendors");

	assert.match(results, /Observability: Observability is the ability/u);
	assert.match(results, /- Vendor A overview \(https:\/\/example\.com\/a\)/u);
	assert.match(results, /- Vendor B overview \(https:\/\/example\.com\/b\)/u);
});

test("an empty answer reports no results rather than an empty string", async () => {
	const reader = createFetchWebReader(() => Promise.resolve(jsonResponse({})));

	const results = await reader.search("a query with no answers");

	assert.match(results, /No web results were found/u);
});

test("search transport failures surface a product-safe unavailability error", async () => {
	const reader = createFetchWebReader(() => Promise.reject(new Error("socket hang up")));

	await assert.rejects(reader.search("anything"), (error: unknown) => {
		assert.ok(error instanceof ThinkspaceWebReadError);
		assert.match(error.message, /temporarily unavailable/u);
		assert.doesNotMatch(error.message, /socket/u);
		return true;
	});
});
