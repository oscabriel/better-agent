/**
 * GitHub credential validation for Connected Accounts. A pasted fine-grained
 * Personal Access Token is validated against GitHub `GET /user` so we resolve
 * and store the account identity at connect time, and reject anything GitHub
 * will not honour before it is ever persisted (ADR-0009).
 */
const GITHUB_USER_ENDPOINT = "https://api.github.com/user";

/** A token GitHub would not accept, or an identity it would not return. */
export class GitHubValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitHubValidationError";
	}
}

export interface GitHubAccountIdentity {
	login: string;
}

export const resolveGitHubAccount = async (token: string): Promise<GitHubAccountIdentity> => {
	let response: Response;
	try {
		response = await fetch(GITHUB_USER_ENDPOINT, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"User-Agent": "better-agent",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});
	} catch {
		throw new GitHubValidationError(
			"Could not reach GitHub to validate the token. Try again shortly.",
		);
	}

	if (response.status === 401 || response.status === 403) {
		throw new GitHubValidationError(
			"GitHub rejected this token. Check that it is valid and has not expired, then try again.",
		);
	}
	if (!response.ok) {
		throw new GitHubValidationError("GitHub could not validate this token. Try again shortly.");
	}

	const body = (await response.json()) as { login?: unknown };
	if (typeof body.login !== "string" || body.login.length === 0) {
		throw new GitHubValidationError("GitHub did not return an account identity for this token.");
	}

	return { login: body.login };
};
