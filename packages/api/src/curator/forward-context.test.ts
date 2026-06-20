import assert from "node:assert/strict";
import test from "node:test";

import {
	decodeCurationForwardContext,
	encodeCurationForwardContext,
	matchesCurationForwardContext,
	parseCurationDraftThinkspaceId,
} from "./forward-context";

test("parses the draft Thinkspace id out of a curation route path", () => {
	assert.equal(parseCurationDraftThinkspaceId("/api/curator/thinkspace_123"), "thinkspace_123");
	assert.equal(
		parseCurationDraftThinkspaceId("/api/curator/thinkspace_123/get-messages"),
		"thinkspace_123",
	);
});

test("fails closed for non-curation or id-less paths", () => {
	assert.equal(parseCurationDraftThinkspaceId("/api/curator/"), null);
	assert.equal(parseCurationDraftThinkspaceId("/api/sittings/thinkspace_123"), null);
	assert.equal(parseCurationDraftThinkspaceId("/api/curator"), null);
});

test("round-trips an authenticated forward context through the header value", () => {
	const context = { draftThinkspaceId: "thinkspace_abc", ownerUserId: "user_1" };
	const decoded = decodeCurationForwardContext(encodeCurationForwardContext(context));

	assert.deepEqual(decoded, context);
});

test("decoding fails closed for missing, malformed, or wrong-shaped values", () => {
	assert.equal(decodeCurationForwardContext(null), null);
	assert.equal(decodeCurationForwardContext(""), null);
	assert.equal(decodeCurationForwardContext("not-json"), null);
	assert.equal(
		decodeCurationForwardContext(encodeURIComponent(JSON.stringify({ ownerUserId: "user_1" }))),
		null,
	);
	assert.equal(
		decodeCurationForwardContext(
			encodeURIComponent(JSON.stringify({ draftThinkspaceId: 42, ownerUserId: "user_1" })),
		),
		null,
	);
	assert.equal(
		decodeCurationForwardContext(
			encodeURIComponent(JSON.stringify({ draftThinkspaceId: "  ", ownerUserId: "user_1" })),
		),
		null,
	);
});

test("admits only a forward context whose owner and draft both match the runtime's bound", () => {
	const bound = { draftThinkspaceId: "thinkspace_abc", ownerUserId: "user_1" };

	assert.equal(matchesCurationForwardContext({ ...bound }, bound), true);
	// Wrong owner — another user's stamped context cannot reach this draft's runtime.
	assert.equal(
		matchesCurationForwardContext(
			{ draftThinkspaceId: "thinkspace_abc", ownerUserId: "user_2" },
			bound,
		),
		false,
	);
	// Wrong draft — the right owner against the wrong draft's runtime is rejected.
	assert.equal(
		matchesCurationForwardContext(
			{ draftThinkspaceId: "thinkspace_other", ownerUserId: "user_1" },
			bound,
		),
		false,
	);
	// No context at all matches nothing.
	assert.equal(matchesCurationForwardContext(null, bound), false);
});
