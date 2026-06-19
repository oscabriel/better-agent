import type { ProductDb } from "@better-agent/db";

import { GITHUB_CONNECTED_ACCOUNT_CATALOG_ID } from "../connected-accounts/github";
import { createGitHubIssue, GitHubIssueCreationError } from "../connected-accounts/github-issues";
import type { CreatedGitHubIssue } from "../connected-accounts/github-issues";
import { getDecryptedConnectedAccountCredential } from "../connected-accounts/repository";

export interface ThinkspaceGitHubIssueProposal {
	body: string;
	repo: string;
	title: string;
}

/**
 * The seam the held GitHub-issue tool writes through once an Approval is
 * granted. Defined as an interface so the runtime tool stays unaware of
 * credential storage and GitHub transport, and tests can substitute a recorder.
 * `create` throws on failure (validation, dead token, API error); the runtime
 * tool maps those to a product-safe message so the model never sees transport
 * detail and never fabricates success.
 */
export interface ThinkspaceGitHubIssueCreator {
	create: (proposal: ThinkspaceGitHubIssueProposal) => Promise<CreatedGitHubIssue>;
}

export interface CreateThinkspaceGitHubIssueCreatorInput {
	db: ProductDb;
	/** AES-GCM secret: `env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET`. */
	encryptionSecret: string;
	/** The Thinkspace owner whose product-level GitHub credential backs the tool. */
	ownerUserId: string;
}

/**
 * Store-backed GitHub-issue creator. The owner's credential is fetched and
 * decrypted only inside `create`, which the AI SDK runs only after the owner
 * approves the held proposal — so a rejected proposal never materialises the
 * token (PRD #108, ADR-0009). A missing/disconnected account surfaces as a
 * needs-reconnect error rather than a silent no-op.
 */
export const createThinkspaceGitHubIssueCreator = ({
	db,
	encryptionSecret,
	ownerUserId,
}: CreateThinkspaceGitHubIssueCreatorInput): ThinkspaceGitHubIssueCreator => ({
	create: async (proposal) => {
		const token = await getDecryptedConnectedAccountCredential(db, {
			catalogId: GITHUB_CONNECTED_ACCOUNT_CATALOG_ID,
			secret: encryptionSecret,
			userId: ownerUserId,
		});

		if (!token) {
			throw new GitHubIssueCreationError(
				"No connected GitHub account is available, so nothing was created. Connect a GitHub account before using this tool.",
				{ needsReconnect: true },
			);
		}

		return await createGitHubIssue(token, proposal);
	},
});
