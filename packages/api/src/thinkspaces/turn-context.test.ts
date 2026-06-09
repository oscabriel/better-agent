import assert from "node:assert/strict";
import test from "node:test";

import { extractThinkspaceTurnProductSafeFailureMessage } from "./inspect";
import {
	bindThinkspaceTurnRuntimeContext,
	matchesThinkspaceTurnRuntimeContext,
} from "./turn-context";

test("a runtime binds to the first Thinkspace context it accepts", () => {
	const bound = bindThinkspaceTurnRuntimeContext({
		request: { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" },
	});

	assert.deepEqual(bound, { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" });
});

test("re-accepting work for the same Thinkspace refreshes the bound context", () => {
	const bound = bindThinkspaceTurnRuntimeContext({
		existing: { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" },
		request: { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" },
	});

	assert.deepEqual(bound, { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" });
});

test("a runtime already bound to one Thinkspace rejects work for another with a product-safe error", () => {
	let thrown: unknown;

	try {
		bindThinkspaceTurnRuntimeContext({
			existing: { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" },
			request: { ownerUserId: "attacker_user", thinkspaceId: "thinkspace_other" },
		});
	} catch (error) {
		thrown = error;
	}

	assert.ok(thrown instanceof Error);
	const productSafe = extractThinkspaceTurnProductSafeFailureMessage(thrown.message);
	assert.match(productSafe, /different Thinkspace/u);
	assert.doesNotMatch(productSafe, /thinkspace_other/u);
	assert.doesNotMatch(productSafe, /attacker_user/u);
});

test("inspection only matches the runtime context bound to the same Thinkspace", () => {
	const context = { ownerUserId: "owner_user", thinkspaceId: "thinkspace_context" };

	assert.equal(matchesThinkspaceTurnRuntimeContext(context, "thinkspace_context"), true);
	assert.equal(matchesThinkspaceTurnRuntimeContext(context, "thinkspace_other"), false);
	assert.equal(matchesThinkspaceTurnRuntimeContext(undefined, "thinkspace_context"), false);
});
