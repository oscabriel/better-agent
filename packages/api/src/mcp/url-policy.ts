const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1", "169.254.169.254"]);
const PRIVATE_IPV4_RANGES = [
	/^10\./u,
	/^127\./u,
	/^169\.254\./u,
	/^172\.(1[6-9]|2\d|3[01])\./u,
	/^192\.168\./u,
];

export class McpUrlPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McpUrlPolicyError";
	}
}

export const assertSafeMcpServerUrl = (value: string, allowInsecureDevUrls = false): URL => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new McpUrlPolicyError("MCP server URL must be a valid URL.");
	}

	if (url.protocol !== "https:" && !allowInsecureDevUrls) {
		throw new McpUrlPolicyError("MCP server URL must use HTTPS.");
	}

	const hostname = url.hostname.toLowerCase();
	if (
		!allowInsecureDevUrls &&
		(PRIVATE_HOSTS.has(hostname) || PRIVATE_IPV4_RANGES.some((range) => range.test(hostname)))
	) {
		throw new McpUrlPolicyError(
			"MCP server URL cannot target private, loopback, link-local, or cloud metadata hosts.",
		);
	}

	if (url.username || url.password) {
		throw new McpUrlPolicyError("MCP credentials must not be embedded in URLs.");
	}

	return url;
};
