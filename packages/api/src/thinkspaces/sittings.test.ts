import assert from "node:assert/strict";
import test from "node:test";

import {
	createThinkspaceTurnAttribution,
	decodeSittingForwardContext,
	encodeSittingForwardContext,
	matchesSittingForwardContext,
	parseSittingThinkspaceId,
	SITTING_FORWARD_CONTEXT_HEADER,
	SITTING_ROUTE_PREFIX,
} from "./sittings";

test("the Sitting route prefix and forward header are stable contract values", () => {
	assert.equal(SITTING_ROUTE_PREFIX, "/api/sittings/");
	assert.equal(SITTING_FORWARD_CONTEXT_HEADER, "x-better-agent-sitting-forward");
});

test("parseSittingThinkspaceId reads the id from the bare path and companion subpaths", () => {
	assert.equal(parseSittingThinkspaceId("/api/sittings/thinkspace_123"), "thinkspace_123");
	assert.equal(
		parseSittingThinkspaceId("/api/sittings/thinkspace_123/get-messages"),
		"thinkspace_123",
	);
});

test("parseSittingThinkspaceId decodes percent-encoded ids", () => {
	assert.equal(parseSittingThinkspaceId("/api/sittings/thinkspace%5F123"), "thinkspace_123");
});

test("parseSittingThinkspaceId fails closed on non-Sitting or empty paths", () => {
	assert.equal(parseSittingThinkspaceId("/api/sittings/"), null);
	assert.equal(parseSittingThinkspaceId("/api/sittings"), null);
	assert.equal(parseSittingThinkspaceId("/api/rpc/thinkspaces.get"), null);
	assert.equal(parseSittingThinkspaceId("/"), null);
});

test("a forward context round-trips through encode and decode", () => {
	const context = { ownerUserId: "owner_user", thinkspaceId: "thinkspace_123" };
	const decoded = decodeSittingForwardContext(encodeSittingForwardContext(context));

	assert.deepEqual(decoded, context);
});

test("the encoded forward context is header-safe (no whitespace or control characters)", () => {
	const encoded = encodeSittingForwardContext({
		ownerUserId: "owner user",
		thinkspaceId: "thinkspace 123",
	});

	assert.doesNotMatch(encoded, /[\s"]/u);
});

test("decodeSittingForwardContext fails closed on missing or malformed values", () => {
	assert.equal(decodeSittingForwardContext(null), null);
	assert.equal(decodeSittingForwardContext(""), null);
	assert.equal(decodeSittingForwardContext("not-json"), null);
	assert.equal(decodeSittingForwardContext(encodeURIComponent('{"ownerUserId":"owner"}')), null);
	assert.equal(
		decodeSittingForwardContext(
			encodeURIComponent('{"ownerUserId":"","thinkspaceId":"thinkspace_123"}'),
		),
		null,
	);
});

test("matchesSittingForwardContext requires both owner and Thinkspace to agree", () => {
	const expected = { ownerUserId: "owner_user", thinkspaceId: "thinkspace_123" };

	assert.equal(matchesSittingForwardContext({ ...expected }, expected), true);
	assert.equal(
		matchesSittingForwardContext(
			{ ownerUserId: "attacker", thinkspaceId: "thinkspace_123" },
			expected,
		),
		false,
	);
	assert.equal(
		matchesSittingForwardContext(
			{ ownerUserId: "owner_user", thinkspaceId: "thinkspace_other" },
			expected,
		),
		false,
	);
	assert.equal(matchesSittingForwardContext(null, expected), false);
});

test("turn attribution is taken from the active revision id and version", () => {
	const attribution = createThinkspaceTurnAttribution({
		id: "agent_profile_revision_abc",
		version: 3,
	});

	assert.deepEqual(attribution, {
		profileRevisionId: "agent_profile_revision_abc",
		profileVersion: 3,
	});
});
