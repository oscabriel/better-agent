import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { encryptCredential, redactCredential } from "../crypto";
import { protectedProcedure } from "../procedures";
import { GitHubValidationError, resolveGitHubAccount } from "./github";
import {
	deleteConnectedAccount,
	listConnectedAccounts,
	upsertConnectedAccount,
} from "./repository";

const GITHUB_CATALOG_ID = "github";
const REDACTED_PLACEHOLDER = "••••";

const connectInput = z.object({ token: z.string().trim().min(1) });
const disconnectInput = z.object({ accountId: z.string().min(1) });

const encryptionSecret = (env: { API_ENCRYPTION_KEY?: string; BETTER_AUTH_SECRET: string }) =>
	env.API_ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;

/**
 * The raw token never leaves the server. List surfaces only the resolved
 * identity ("Connected as @login") and a static redacted placeholder; the
 * real first/last preview is shown once, at connect time, when the plaintext
 * is already in hand.
 */
const toAccountOutput = (row: Awaited<ReturnType<typeof listConnectedAccounts>>[number]) => ({
	catalogId: row.catalogId,
	createdAt: row.createdAt,
	credentialType: row.credentialType,
	externalAccountId: row.externalAccountId,
	id: row.id,
	label: row.label,
	redactedCredential: REDACTED_PLACEHOLDER,
	updatedAt: row.updatedAt,
});

export const connectedAccountsRouter = {
	connect: protectedProcedure.input(connectInput).handler(async ({ context, input }) => {
		let identity: Awaited<ReturnType<typeof resolveGitHubAccount>>;
		try {
			identity = await resolveGitHubAccount(input.token);
		} catch (error) {
			if (error instanceof GitHubValidationError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}
			throw error;
		}

		const connected = await upsertConnectedAccount(context.db, {
			catalogId: GITHUB_CATALOG_ID,
			credentialType: "pat",
			encryptedCredential: await encryptCredential(input.token, encryptionSecret(context.env)),
			externalAccountId: identity.login,
			id: `connected_account_${crypto.randomUUID()}`,
			userId: context.session.user.id,
		});

		return { ...toAccountOutput(connected), redactedCredential: redactCredential(input.token) };
	}),
	disconnect: protectedProcedure.input(disconnectInput).handler(async ({ context, input }) => {
		const deleted = await deleteConnectedAccount(context.db, {
			id: input.accountId,
			userId: context.session.user.id,
		});
		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: "Connected account was not found." });
		}
		return { success: true };
	}),
	list: protectedProcedure.handler(async ({ context }) => {
		const rows = await listConnectedAccounts(context.db, context.session.user.id);
		return rows.map(toAccountOutput);
	}),
};
