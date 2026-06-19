import assert from "node:assert/strict";
import test from "node:test";

import { decryptCredential, encryptCredential, redactCredential } from "./crypto";

test("encrypt/decrypt round-trips the plaintext credential", async () => {
	const secret = "test-secret";
	const plaintext = "ghp_exampleFineGrainedToken1234567890";

	const encrypted = await encryptCredential(plaintext, secret);
	assert.notEqual(encrypted, plaintext);
	assert.equal(await decryptCredential(encrypted, secret), plaintext);
});

test("each encryption uses a fresh IV so ciphertext differs", async () => {
	const secret = "test-secret";
	const plaintext = "ghp_exampleFineGrainedToken1234567890";

	const first = await encryptCredential(plaintext, secret);
	const second = await encryptCredential(plaintext, secret);

	assert.notEqual(first, second);
	assert.equal(await decryptCredential(first, secret), plaintext);
	assert.equal(await decryptCredential(second, secret), plaintext);
});

test("decrypting with the wrong secret fails", async () => {
	const encrypted = await encryptCredential("a-secret-value", "right-secret");
	await assert.rejects(() => decryptCredential(encrypted, "wrong-secret"));
});

test("redactCredential keeps only the first and last four characters", () => {
	assert.equal(redactCredential("ghp_abcdefghijklmnop"), "ghp_…mnop");
	assert.equal(redactCredential("short"), "••••");
	assert.equal(redactCredential("exactly8"), "••••");
});
