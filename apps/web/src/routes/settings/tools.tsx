import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Settings, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { RouterOutputs } from "@/server/lib/router";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";
import { AddMcpServerDialog } from "./-components/tools/add-mcp-server-dialog";
import { ExaApiKeyDialog } from "./-components/tools/exa-api-key-dialog";
import { ExaApiKeySection } from "./-components/tools/exa-api-key-section";
import { McpServerRow } from "./-components/tools/mcp-server-row";

export const Route = createFileRoute("/settings/tools")({
	component: ToolsPage,
});

type MCPServer = RouterOutputs["mcp"]["listServers"][number];

function ToolsPage() {
	const queryClient = useQueryClient();
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showExaKeyDialog, setShowExaKeyDialog] = useState(false);
	const [newServer, setNewServer] = useState({
		name: "",
		url: "",
		type: "http" as "http" | "sse",
		description: "",
		headers: {} as Record<string, string>,
	});
	const [headerKey, setHeaderKey] = useState("");
	const [headerValue, setHeaderValue] = useState("");

	const { data: userSettings, isLoading: settingsLoading } = useUserSettings();
	const [exaApiKey, setExaApiKey] = useState("");

	const serversQuery = useQuery(orpc.mcp.listServers.queryOptions());

	const addServerMutation = useMutation(
		orpc.mcp.addCustomServer.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
				toast.success("MCP server added successfully");
				setShowAddDialog(false);
				setNewServer({
					name: "",
					url: "",
					type: "http",
					description: "",
					headers: {},
				});
				setHeaderKey("");
				setHeaderValue("");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const toggleServerMutation = useMutation(
		orpc.mcp.toggleServer.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const removeServerMutation = useMutation(
		orpc.mcp.removeCustomServer.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
				toast.success("MCP server removed successfully");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const handleAddServer = () => {
		if (!newServer.name || !newServer.url) {
			toast.error("Please fill in all required fields");
			return;
		}
		addServerMutation.mutate(newServer);
	};

	const isLoading = serversQuery.isLoading;
	const mcpServers = (serversQuery.data || []) as Array<
		MCPServer & { enabled: boolean }
	>;

	const addHeader = () => {
		if (headerKey && headerValue) {
			setNewServer((prev) => ({
				...prev,
				headers: { ...prev.headers, [headerKey]: headerValue },
			}));
			setHeaderKey("");
			setHeaderValue("");
		}
	};

	const removeHeader = (key: string) => {
		setNewServer((prev) => {
			const newHeaders = { ...prev.headers };
			delete newHeaders[key];
			return { ...prev, headers: newHeaders };
		});
	};

	const updateExaKeyMutation = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
				toast.success("Exa API key saved successfully");
				setShowExaKeyDialog(false);
				setExaApiKey("");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const handleSaveExaKey = () => {
		if (!exaApiKey.trim()) {
			toast.error("Please enter a valid API key");
			return;
		}
		const currentKeys = userSettings?.apiKeys || {};
		const newKeys = {
			...currentKeys,
			exa: exaApiKey.trim(),
		};
		updateExaKeyMutation.mutate({ apiKeys: newKeys });
	};

	if (isLoading || settingsLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Web Search</CardTitle>
					<CardDescription>
						Enable real-time web search for current events and latest
						information.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<ExaApiKeySection
						hasApiKey={Boolean(userSettings?.apiKeys?.exa)}
						onConfigureKey={() => {
							setExaApiKey("");
							setShowExaKeyDialog(true);
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<CardTitle>MCP Servers</CardTitle>
						<CardDescription>
							{mcpServers.length} server{mcpServers.length !== 1 ? "s" : ""}{" "}
							configured
						</CardDescription>
					</div>
					<Button size="sm" onClick={() => setShowAddDialog(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Add MCP Server
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{mcpServers.map((server) => (
						<McpServerRow
							key={server.id}
							server={server}
							onToggle={(serverId, enabled) =>
								toggleServerMutation.mutate({ serverId, enabled })
							}
							onRemove={(serverId) => removeServerMutation.mutate({ serverId })}
							isToggling={toggleServerMutation.isPending}
							isRemoving={removeServerMutation.isPending}
						/>
					))}
					{mcpServers.length > 0 && (
						<div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-muted-foreground text-sm">
							<ShieldAlert className="size-3.5 shrink-0" />
							<span>
								Consider only enabling MCP servers relevant to your immediate
								use case to avoid context bloat.
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			{mcpServers.length === 0 && (
				<Card>
					<CardContent className="p-8 text-center">
						<Settings className="mx-auto mb-4 size-12 text-muted-foreground" />
						<h3 className="mb-2 font-medium text-lg">
							No MCP Servers Configured
						</h3>
						<p className="mb-4 text-muted-foreground">
							Add your first MCP server to enable documentation search
							capabilities
						</p>
						<Button onClick={() => setShowAddDialog(true)}>
							<Plus className="mr-2 size-4" />
							Add MCP Server
						</Button>
					</CardContent>
				</Card>
			)}

			<AddMcpServerDialog
				open={showAddDialog}
				onOpenChange={setShowAddDialog}
				newServer={newServer}
				onServerChange={setNewServer}
				headerKey={headerKey}
				headerValue={headerValue}
				onHeaderKeyChange={setHeaderKey}
				onHeaderValueChange={setHeaderValue}
				onAddHeader={addHeader}
				onRemoveHeader={removeHeader}
				onAdd={handleAddServer}
				isAdding={addServerMutation.isPending}
			/>

			<ExaApiKeyDialog
				open={showExaKeyDialog}
				onOpenChange={setShowExaKeyDialog}
				apiKey={exaApiKey}
				onApiKeyChange={setExaApiKey}
				onSave={handleSaveExaKey}
				isSaving={updateExaKeyMutation.isPending}
			/>
		</div>
	);
}
