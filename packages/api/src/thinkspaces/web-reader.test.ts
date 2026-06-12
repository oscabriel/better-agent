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

test("loopback and private-network hosts are rejected before any request is made", () => {
	const privateUrls = [
		"http://localhost:8787/admin",
		"https://127.0.0.1/secrets",
		"http://0.0.0.0:6379",
		"http://10.0.0.5/internal",
		"https://192.168.1.1/router",
		"http://172.16.0.1/metadata",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:8080",
		"https://service.local/api",
	];

	for (const url of privateUrls) {
		assert.throws(
			() => assertFetchableWebUrl(url),
			ThinkspaceWebReadError,
			`${url} must be rejected`,
		);
	}
});

test("redirect hops are re-validated: a public page cannot bounce the fetch onto a private host", async () => {
	const requestedUrls: string[] = [];
	const reader = createFetchWebReader((input) => {
		requestedUrls.push(String(input));
		return Promise.resolve(
			new Response(null, {
				headers: { location: "http://127.0.0.1:6379/" },
				status: 302,
			}),
		);
	});

	await assert.rejects(reader.fetchPage("https://example.com/page"), ThinkspaceWebReadError);
	assert.deepEqual(requestedUrls, ["https://example.com/page"]);
});

test("legitimate redirects are followed to the final page with a hop cap", async () => {
	const reader = createFetchWebReader((input) => {
		const url = String(input);

		if (url === "https://example.com/old") {
			return Promise.resolve(new Response(null, { headers: { location: "/new" }, status: 301 }));
		}

		assert.equal(url, "https://example.com/new");
		return Promise.resolve(new Response("the moved page"));
	});

	assert.equal(await reader.fetchPage("https://example.com/old"), "the moved page");

	const loopingReader = createFetchWebReader(() =>
		Promise.resolve(new Response(null, { headers: { location: "/loop" }, status: 302 })),
	);
	await assert.rejects(loopingReader.fetchPage("https://example.com/loop"), ThinkspaceWebReadError);
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
