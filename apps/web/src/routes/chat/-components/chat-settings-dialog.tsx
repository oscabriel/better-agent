import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Brain,
	Globe,
	Hammer,
	Settings2,
	ShieldCheck,
	Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { RouterOutputs } from "@/server/api/orpc";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/web/components/ui/dialog";
import { Label } from "@/web/components/ui/label";
import { ScrollArea } from "@/web/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { Separator } from "@/web/components/ui/separator";
import { Switch } from "@/web/components/ui/switch";
import { type McpServer, useMcpServers } from "@/web/hooks/use-mcp-servers";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";

interface ChatSettingsDialogProps {
	disabled?: boolean;
	modelId?: string;
	onModelChange?: (modelId: string) => void;
}

type ModelDefinition = RouterOutputs["models"]["list"][number];

const DEFAULT_MODEL_ID = "google:gemini-2.5-flash-lite";

export function ChatSettingsDialog({
	disabled,
	modelId,
	onModelChange,
}: ChatSettingsDialogProps) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	// Models query
	const modelsQuery = useQuery(
		orpc.models.list.queryOptions({
			staleTime: 60_000,
		}),
	);

	// User settings
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();

	// MCP servers
	const { data: servers = [], isLoading: isLoadingServers } = useMcpServers({
		enabled: open,
	});

	const toggleMutation = useMutation(
		orpc.mcp.toggleServer.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: orpc.mcp.listServers.key(),
				});
			},
		}),
	);

	// Model selection logic
	const models = modelsQuery.data || [];
	const userApiKeys = settingsQuery.data?.apiKeys || {};
	const enabledModels = settingsQuery.data?.enabledModels || [];

	const modelsWithAvailability = models.map((model: ModelDefinition) => {
		const providerKey = model.id.split(":")[0] || model.provider.toLowerCase();
		const hasProviderKey = Boolean(userApiKeys[providerKey]);
		const isAvailable = model.access === "free" || hasProviderKey;
		return {
			...model,
			providerKey,
			isAvailable,
		};
	});

	const isLoading = modelsQuery.isLoading || settingsQuery.isLoading;
	// Use persisted selectedModel as fallback instead of hardcoded default
	const effectiveValue =
		modelId ?? settingsQuery.data?.selectedModel ?? DEFAULT_MODEL_ID;
	const selectedModelDef = modelsWithAvailability.find(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.id === effectiveValue,
	);

	const hasCustomSelection = enabledModels.length > 0;
	const enabledModelSet = useMemo(
		() => new Set(enabledModels),
		[enabledModels],
	);
	const shouldIncludeModel = (
		model: ModelDefinition & { isAvailable: boolean },
	): boolean => {
		if (model.access === "free") return true;
		if (!hasCustomSelection) return true;
		if (enabledModelSet.has(model.id)) return true;
		return selectedModelDef?.id === model.id;
	};

	const visibleModels = modelsWithAvailability.filter(shouldIncludeModel);
	const freeModels = visibleModels.filter(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.access === "free",
	);
	const byokModels = visibleModels.filter(
		(model: ModelDefinition & { isAvailable: boolean }) =>
			model.access === "byok",
	);

	const hasAnyModels = visibleModels.length > 0;

	// Reasoning capability
	const selectedModel = modelsQuery.data?.find((m) => m.id === modelId);
	const hasReasoningCapability =
		selectedModel?.capabilities?.includes("reasoning") ?? false;
	const currentEffort = settingsQuery.data?.reasoningEffort ?? "medium";

	// Web search
	const hasExaKey = Boolean(settingsQuery.data?.apiKeys?.exa);
	const webSearchEnabled = settingsQuery.data?.webSearchEnabled ?? false;

	// Sorted MCP servers
	const sortedServers = useMemo(() => {
		return [...(servers as Array<McpServer & { enabled: boolean }>)].sort(
			(a, b) => {
				if (a.isBuiltIn === b.isBuiltIn) {
					return a.name.localeCompare(b.name);
				}
				return a.isBuiltIn ? -1 : 1;
			},
		);
	}, [servers]);

	const handleEffortChange = async (value: string) => {
		try {
			await updateSettings({
				reasoningEffort: value as "off" | "low" | "medium" | "high",
			});
		} catch (error) {
			console.error("Failed to update reasoning effort:", error);
		}
	};

	const handleWebSearchToggle = async () => {
		if (!hasExaKey) {
			return;
		}
		const newState = !webSearchEnabled;
		try {
			await updateSettings({ webSearchEnabled: newState });
			toast.success(newState ? "Web search enabled" : "Web search disabled");
		} catch (err) {
			toast.error(`Failed to update web search setting: ${err}`);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					disabled={disabled}
					title="Chat settings"
				>
					<Settings2 className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] max-w-lg">
				<DialogHeader>
					<DialogTitle>Chat Settings</DialogTitle>
					<DialogDescription>
						Configure model, reasoning, tools, and search settings
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
					<div className="space-y-6">
						{/* Model Selection */}
						<div className="space-y-3">
							<Label className="font-semibold text-sm">Model</Label>
							<Select
								value={selectedModelDef ? selectedModelDef.id : effectiveValue}
								onValueChange={(value) => onModelChange?.(value)}
								disabled={isLoading || !hasAnyModels}
							>
								<SelectTrigger className="h-10">
									<SelectValue
										placeholder={
											isLoading ? "Loading models..." : "Select a model"
										}
									>
										{selectedModelDef && <span>{selectedModelDef.name}</span>}
									</SelectValue>
								</SelectTrigger>
								<SelectContent className="max-h-72">
									{isLoading ? (
										<div className="px-2 py-4 text-center text-muted-foreground text-sm">
											Loading models...
										</div>
									) : !hasAnyModels ? (
										<div className="px-2 py-4 text-center text-muted-foreground text-sm">
											No models available. Configure providers in Settings.
										</div>
									) : (
										<>
											{freeModels.length > 0 && (
												<>
													<div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
														Basic Models
													</div>
													{freeModels.map(
														(
															model: ModelDefinition & { isAvailable: boolean },
														) => {
															const hasReasoning =
																model.capabilities?.includes("reasoning");
															return (
																<SelectItem key={model.id} value={model.id}>
																	<div className="flex items-center gap-2">
																		<span>{model.name}</span>
																		{hasReasoning && (
																			<Brain className="size-3 text-purple-600" />
																		)}
																	</div>
																</SelectItem>
															);
														},
													)}
												</>
											)}

											{byokModels.length > 0 && (
												<>
													<div className="mt-2 border-t px-2 py-1.5 pt-2 font-semibold text-muted-foreground text-xs">
														BYOK Models
													</div>
													{byokModels.map(
														(
															model: ModelDefinition & { isAvailable: boolean },
														) => {
															const hasReasoning =
																model.capabilities?.includes("reasoning");
															return (
																<SelectItem
																	key={model.id}
																	value={model.id}
																	disabled={!model.isAvailable}
																	title={
																		model.isAvailable
																			? undefined
																			: `Add your ${model.provider} API key in Settings → Providers`
																	}
																>
																	<div className="flex items-center gap-2">
																		<span
																			className={
																				!model.isAvailable ? "opacity-50" : ""
																			}
																		>
																			{model.name}
																		</span>
																		{hasReasoning && (
																			<Brain className="size-3 text-purple-600" />
																		)}
																	</div>
																</SelectItem>
															);
														},
													)}
												</>
											)}
										</>
									)}
								</SelectContent>
							</Select>
						</div>

						{/* Reasoning Effort */}
						{hasReasoningCapability && (
							<>
								<Separator />
								<div className="space-y-3">
									<Label className="font-semibold text-sm">
										Reasoning Effort
									</Label>
									<Select
										value={currentEffort}
										onValueChange={handleEffortChange}
									>
										<SelectTrigger className="h-10">
											<div className="flex items-center gap-2">
												<Brain className="size-4 text-purple-600" />
												<SelectValue />
											</div>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="off">Off</SelectItem>
											<SelectItem value="low">Low</SelectItem>
											<SelectItem value="medium">Medium</SelectItem>
											<SelectItem value="high">High</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</>
						)}

						{/* Web Search */}
						<Separator />
						<div className="space-y-3">
							<Label className="font-semibold text-sm">Web Search</Label>
							<div className="flex items-center justify-between rounded-md border p-3">
								<div className="flex items-center gap-3">
									<Globe className="size-4" />
									<div>
										<p className="font-medium text-sm">
											{webSearchEnabled && hasExaKey ? "Enabled" : "Disabled"}
										</p>
										{!hasExaKey && (
											<p className="text-muted-foreground text-xs">
												Configure Exa API key in settings
											</p>
										)}
									</div>
								</div>
								<Switch
									checked={webSearchEnabled && hasExaKey}
									onCheckedChange={handleWebSearchToggle}
									disabled={!hasExaKey || disabled}
								/>
							</div>
						</div>

						{/* Tools (MCP) */}
						<Separator />
						<div className="space-y-3">
							<Label className="flex items-center gap-2 font-semibold text-sm">
								<Hammer className="size-4 text-green-500" />
								Tools
							</Label>
							{isLoadingServers ? (
								<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
									Loading tools...
								</div>
							) : sortedServers.length === 0 ? (
								<div className="flex flex-col items-center gap-2 rounded-md border py-8 text-center text-muted-foreground text-sm">
									<Wrench className="size-5" />
									<span>No tools configured yet.</span>
								</div>
							) : (
								<div className="space-y-3">
									{sortedServers.map((server) => {
										const isMutating = toggleMutation.isPending;
										return (
											<div
												key={server.id}
												className="flex items-start justify-between rounded-md border p-3"
											>
												<div className="space-y-1.5">
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium text-sm">
															{server.name}
														</span>
														{server.isBuiltIn ? (
															<Badge variant="secondary" className="text-xs">
																Built-In
															</Badge>
														) : (
															<Badge variant="outline" className="text-xs">
																Custom
															</Badge>
														)}
														<Badge variant="outline" className="text-xs">
															{server.type.toUpperCase()}
														</Badge>
													</div>
													{server.description ? (
														<p className="text-muted-foreground text-xs">
															{server.description}
														</p>
													) : null}
													<p className="font-mono text-[11px] text-muted-foreground">
														{(() => {
															try {
																const parsed = new URL(server.url);
																return parsed.host + parsed.pathname;
															} catch (_error) {
																return server.url;
															}
														})()}
													</p>
												</div>
												<Switch
													checked={server.enabled}
													onCheckedChange={(checked) =>
														toggleMutation.mutate({
															serverId: server.id,
															enabled: checked,
														})
													}
													disabled={isMutating}
													className="ml-4"
												/>
											</div>
										);
									})}
									<div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-muted-foreground text-xs">
										<div className="items-centered flex gap-2">
											<ShieldCheck className="size-3.5" />
											<span>
												Consider only enabling tools relevant to your immediate
												use case.
											</span>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
