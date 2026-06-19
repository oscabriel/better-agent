import assert from "node:assert/strict";
import test from "node:test";

import {
	CONNECTED_ACCOUNT_TOOL_IDS,
	connectedAccountCatalogIdFromToolId,
	connectedAccountToolPermissionKind,
	CREATE_GITHUB_ISSUE_TOOL_ID,
	createConnectedAccountToolPermissionRequests,
	isConnectedAccountToolId,
} from "./connected-account-tools";

test("the connected-account tool catalog is the source of truth for equippable tool ids", () => {
	assert.equal(CREATE_GITHUB_ISSUE_TOOL_ID, "github:create_issue");
	assert.deepEqual([...CONNECTED_ACCOUNT_TOOL_IDS], ["github:create_issue"]);
	assert.equal(isConnectedAccountToolId("github:create_issue"), true);
	assert.equal(isConnectedAccountToolId("memory_write"), false);
	assert.equal(isConnectedAccountToolId("github"), false);
	assert.equal(isConnectedAccountToolId(""), false);
});

test("derives the catalog id from a connected-account tool id", () => {
	assert.equal(connectedAccountCatalogIdFromToolId("github:create_issue"), "github");
	assert.equal(connectedAccountCatalogIdFromToolId("github"), "github");
});

test("every connected-account tool is governed by the one credential kind; empty fails closed", () => {
	assert.equal(
		connectedAccountToolPermissionKind("github:create_issue"),
		"connected_account_credential",
	);
	assert.equal(connectedAccountToolPermissionKind(""), null);
});

test("builds one connected_account_credential request per catalog id", () => {
	const requests = createConnectedAccountToolPermissionRequests(["github:create_issue"]);

	assert.equal(requests.length, 1);
	assert.equal(requests[0]?.kind, "connected_account_credential");
	assert.equal(requests[0]?.catalogId, "github");
	assert.match(requests[0]?.reason ?? "", /GitHub/u);
});

test("dedupes by catalog id and skips empty tool ids", () => {
	const requests = createConnectedAccountToolPermissionRequests([
		"github:create_issue",
		"github:other_tool",
		"",
	]);

	assert.deepEqual(
		requests.map((request) => request.catalogId),
		["github"],
	);
});

test("returns nothing when no connected-account tools are enabled", () => {
	assert.deepEqual(createConnectedAccountToolPermissionRequests([]), []);
});
