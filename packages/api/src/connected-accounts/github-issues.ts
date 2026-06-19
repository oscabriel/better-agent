/**
 * The first credentialed external mutation: creating a GitHub issue as a
 * Connected Account. The token that backs this is read only at execute time,
 * after the owner approves the held proposal (PRD #108, ADR-0009). Every GitHub
 * failure becomes a typed `GitHubIssueCreationError` — never a fabricated
 * success and never an uncaught throw (PR #106 grounding); there is no
 * auto-retry.
 */
import { GITHUB_API_BASE, githubAuthHeaders } from "./github";

/**
 * `owner/name`: owner is a GitHub login (alphanumeric or single hyphens, ≤39),
 * repo name starts alphanumeric then allows `-` `_` `.`. Anchored and
 * single-slash, so path traversal and malformed input never reach a request.
 */
const GITHUB_REPO_PATTERN =
	/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,99})$/u;

export const isValidGitHubRepo = (repo: string): boolean => GITHUB_REPO_PATTERN.test(repo);

/**
 * A GitHub mutation that did not happen. `needsReconnect` marks the credential
 * itself as the cause (401/403) so the agent can tell the owner to reconnect
 * the account rather than retry; every other cause is a transient/API failure.
 */
export class GitHubIssueCreationError extends Error {
	readonly needsReconnect: boolean;

	constructor(message: string, options: { needsReconnect?: boolean } = {}) {
		super(message);
		this.name = "GitHubIssueCreationError";
		this.needsReconnect = options.needsReconnect ?? false;
	}
}

export interface CreateGitHubIssueInput {
	body: string;
	repo: string;
	title: string;
}

export interface CreatedGitHubIssue {
	number: number;
	url: string;
}

/**
 * Create one issue in `input.repo` as the connected account. Validates the repo
 * format before any network call; a single attempt, with an honest typed result
 * either way.
 */
export const createGitHubIssue = async (
	token: string,
	input: CreateGitHubIssueInput,
): Promise<CreatedGitHubIssue> => {
	if (!isValidGitHubRepo(input.repo)) {
		throw new GitHubIssueCreationError(
			"The repository must be given as owner/name (for example, octocat/hello-world).",
		);
	}

	let response: Response;
	try {
		response = await fetch(`${GITHUB_API_BASE}/repos/${input.repo}/issues`, {
			body: JSON.stringify({ body: input.body, title: input.title }),
			headers: { ...githubAuthHeaders(token), "Content-Type": "application/json" },
			method: "POST",
		});
	} catch {
		throw new GitHubIssueCreationError(
			"Could not reach GitHub to create the issue. Nothing was created.",
		);
	}

	if (response.status === 401 || response.status === 403) {
		throw new GitHubIssueCreationError(
			"GitHub rejected the connected account's credential, so nothing was created. The GitHub account needs to be reconnected before this will work.",
			{ needsReconnect: true },
		);
	}
	if (!response.ok) {
		throw new GitHubIssueCreationError(
			"GitHub could not create the issue (the repository may not exist or the token may lack issue access). Nothing was created.",
		);
	}

	const issue = (await response.json()) as { html_url?: unknown; number?: unknown };
	if (typeof issue.number !== "number" || typeof issue.html_url !== "string") {
		throw new GitHubIssueCreationError(
			"GitHub accepted the request but did not return the created issue's details.",
		);
	}

	return { number: issue.number, url: issue.html_url };
};
