import assert from "node:assert/strict";
import test from "node:test";

import { user } from "@better-agent/db/schema/auth";
import type { UserMcpConnection } from "@better-agent/db/schema/settings";

import { createTestProductDb } from "../testing/product-db";
import { listBuiltInMcpServers } from "./catalog";
import { listGrantableMcpServers, userMcpConnectionToGrantableServer } from "./grantable-servers";
import { createCustomMcpConnection } from "./repository";

const baseConnection: UserMcpConnection = {
	authType: "none",
	catalogVisible: true,
	createdAt: new Date(),
	description: "Internal docs.",
	encryptedHeaders: "{}",
	id: "mcp_connection_docs",
	name: "Internal Docs",
	riskLevel: "read_only",
	serverId: null,
	transport: "streamable_http",
	updatedAt: new Date(),
	url: "https://example.com/mcp",
	userId: "user_grantable",
};

test("maps a registered connection onto the grantable shape", () => {
	const server = userMcpConnectionToGrantableServer(baseConnection);

	assert.equal(server.id, "mcp_connection_docs");
	assert.equal(server.authType, "none");
	assert.equal(server.riskLevel, "read_only");
	assert.equal(server.enabledByDefaultForThinkspaces, false);
});

test("treats a connection carrying secret headers as authenticated even if it declares none", () => {
	const server = userMcpConnectionToGrantableServer({
		...baseConnection,
		authType: "none",
		encryptedHeaders: JSON.stringify({ encrypted: "secret" }),
	});

	assert.equal(server.authType, "bearer");
});

test("lists built-in servers alongside the owner's registered connections", async () => {
	const db = createTestProductDb();
	await db.insert(user).values({ email: "owner@example.com", id: "user_grantable", name: "Owner" });
	await createCustomMcpConnection(db, {
		authType: "none",
		description: "Internal docs.",
		encryptedHeaders: "{}",
		id: "mcp_connection_docs",
		name: "Internal Docs",
		riskLevel: "read_only",
		transport: "streamable_http",
		url: "https://example.com/mcp",
		userId: "user_grantable",
	});

	const servers = await listGrantableMcpServers(db, "user_grantable");
	const ids = new Set(servers.map((server) => server.id));

	for (const builtIn of listBuiltInMcpServers()) {
		assert.ok(ids.has(builtIn.id));
	}
	assert.ok(ids.has("mcp_connection_docs"));
});
