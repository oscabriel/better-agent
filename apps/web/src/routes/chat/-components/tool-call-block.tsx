import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolOrDynamicToolName } from "ai";
import {
	ChevronDown,
	ChevronRight,
	Database,
	FileText,
	Globe,
	Search,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Card } from "@/web/components/ui/card";
import type { McpServer } from "@/web/hooks/use-mcp-servers";
import { useMcpServers } from "@/web/hooks/use-mcp-servers";

type ToolInvocationPart = ToolUIPart | DynamicToolUIPart;

interface WebSearchResult {
	url: string;
	title: string;
	publishedDate?: string;
	highlights?: string[];
	content?: string;
}

interface ToolCallBlockProps {
	part: ToolInvocationPart;
}

export function ToolCallBlock({ part }: ToolCallBlockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const { data: mcpServers } = useMcpServers();
	const toolName = getToolOrDynamicToolName(part);
	const servers = (Array.isArray(mcpServers) ? mcpServers : []) as McpServer[];
	const { server, actualToolName } = resolveServer(toolName, servers);
	const stateMeta = resolveState(part.state);
	const icon = resolveIcon(actualToolName);
	const serverInfo = server
		? {
				name: server.name,
				type: server.type.toUpperCase(),
			}
		: undefined;

	if (part.state === "input-streaming" || part.state === "input-available") {
		return (
			<Card className="gap-2 border-l-4 border-l-blue-500 py-2 md:py-3">
				<div className="space-y-2 px-2 md:space-y-3 md:px-3">
					<div className="flex items-center gap-1.5 md:gap-2">
						{icon}
						<span className="font-medium text-xs md:text-sm">
							{formatToolDisplayName(actualToolName, serverInfo?.name)}
						</span>
						<Badge className={`hidden md:inline-flex ${stateMeta.color}`}>
							{stateMeta.label}
						</Badge>
						{serverInfo && (
							<Badge
								variant="outline"
								className="hidden text-xs md:inline-flex"
							>
								{serverInfo.type}
							</Badge>
						)}
					</div>

					{part.input !== undefined && (
						<div className="text-muted-foreground text-xs md:text-sm">
							<pre className="whitespace-pre-wrap rounded bg-muted p-1.5 text-xs md:p-2">
								{JSON.stringify(part.input, null, 2)}
							</pre>
						</div>
					)}
				</div>
			</Card>
		);
	}

	if (part.state === "output-available") {
		return (
			<Card className="gap-2 border-l-4 border-l-green-500 py-2 md:py-3">
				<div className="space-y-2 px-2 md:space-y-3 md:px-3">
					<div className="flex flex-wrap items-center justify-between gap-1.5 md:gap-2">
						<div className="flex flex-wrap items-center gap-1 md:gap-1.5">
							{icon}
							<span className="font-medium text-xs md:text-sm">
								{formatToolDisplayName(actualToolName, serverInfo?.name)}
							</span>
							<Badge className={`hidden md:inline-flex ${stateMeta.color}`}>
								{stateMeta.label}
							</Badge>
							{serverInfo && (
								<Badge
									variant="outline"
									className="hidden text-xs md:inline-flex"
								>
									{serverInfo.type}
								</Badge>
							)}
						</div>
						{part.output !== undefined && (
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-1.5 text-xs md:h-7 md:px-2"
								onClick={() => setIsExpanded((value) => !value)}
							>
								{isExpanded ? (
									<ChevronDown className="size-3" />
								) : (
									<ChevronRight className="size-3" />
								)}
								<span className="ml-0.5 md:ml-1">Details</span>
							</Button>
						)}
					</div>

					{isExpanded && (
						<>
							{actualToolName === "webSearch" && Array.isArray(part.output) ? (
								<div className="space-y-1.5 md:space-y-2">
									{(part.output as WebSearchResult[]).map((result, idx) => (
										<div
											key={result.url || idx}
											className="rounded bg-muted p-2 md:p-3"
										>
											<a
												href={result.url}
												target="_blank"
												rel="noopener noreferrer"
												className="font-medium text-blue-600 text-xs hover:underline md:text-sm dark:text-blue-400"
											>
												{result.title}
											</a>
											<p className="mt-0.5 truncate text-muted-foreground text-xs md:mt-1">
												{result.url}
											</p>
											{result.publishedDate && (
												<p className="mt-0.5 text-muted-foreground text-xs md:mt-1">
													Published:{" "}
													{new Date(result.publishedDate).toLocaleDateString()}
												</p>
											)}
											{result.highlights && result.highlights.length > 0 ? (
												<div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
													{result.highlights.map((highlight, hIdx) => (
														<p
															key={`${result.url}-${hIdx}`}
															className="border-blue-500 border-l-2 pl-1.5 text-muted-foreground text-xs italic md:pl-2"
														>
															{highlight}
														</p>
													))}
												</div>
											) : result.content ? (
												<p className="mt-1.5 line-clamp-3 text-muted-foreground text-xs md:mt-2">
													{result.content}
												</p>
											) : null}
										</div>
									))}
								</div>
							) : (
								<div className="rounded bg-muted p-1.5 text-xs md:p-2">
									{typeof part.output === "string"
										? part.output
										: JSON.stringify(part.output, null, 2)}
								</div>
							)}

							{part.input !== undefined && (
								<div className="mt-2 space-y-2 border-t pt-2 text-xs md:mt-3 md:space-y-3 md:pt-3 md:text-sm">
									<div>
										<h4 className="mb-1.5 font-medium text-muted-foreground text-xs md:mb-2">
											Input:
										</h4>
										<pre className="whitespace-pre-wrap rounded bg-muted p-1.5 text-xs md:p-2">
											{JSON.stringify(part.input, null, 2)}
										</pre>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</Card>
		);
	}

	if (part.state === "output-error") {
		return (
			<Card className="gap-2 border-l-4 border-l-red-500 py-2 md:py-3">
				<div className="space-y-2 px-2 md:space-y-3 md:px-3">
					<div className="flex flex-wrap items-center gap-1 md:gap-1.5">
						{icon}
						<span className="font-medium text-xs md:text-sm">
							{formatToolDisplayName(actualToolName, serverInfo?.name)}
						</span>
						<Badge className={`hidden md:inline-flex ${stateMeta.color}`}>
							{stateMeta.label}
						</Badge>
						{serverInfo && (
							<Badge
								variant="outline"
								className="hidden text-xs md:inline-flex"
							>
								{serverInfo.type}
							</Badge>
						)}
					</div>
					<div className="text-destructive text-xs">
						Error: {part.errorText || "Unknown error occurred"}
					</div>
				</div>
			</Card>
		);
	}

	return null;
}

function resolveServer(
	toolName: string,
	servers: McpServer[],
): { server: McpServer | undefined; actualToolName: string } {
	for (const server of servers) {
		if (toolName.startsWith(`${server.id}_`)) {
			return {
				server,
				actualToolName: toolName.slice(server.id.length + 1),
			};
		}
	}
	return { server: undefined, actualToolName: toolName };
}

function resolveState(state: ToolInvocationPart["state"]) {
	switch (state) {
		case "input-streaming":
			return {
				color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
				label: "Processing...",
			};
		case "input-available":
			return {
				color:
					"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
				label: "Searching...",
			};
		case "output-available":
			return {
				color:
					"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
				label: "Complete",
			};
		case "output-error":
			return {
				color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
				label: "Error",
			};
		default:
			return {
				color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
				label: state,
			};
	}
}

function resolveIcon(toolName: string) {
	const lowerToolName = toolName.toLowerCase();
	if (
		lowerToolName.includes("search") ||
		lowerToolName.includes("docs") ||
		lowerToolName.includes("documentation")
	) {
		return <Search className="h-4 w-4" />;
	}
	if (
		lowerToolName.includes("database") ||
		lowerToolName.includes("query") ||
		lowerToolName.includes("sql")
	) {
		return <Database className="h-4 w-4" />;
	}
	if (
		lowerToolName.includes("web") ||
		lowerToolName.includes("http") ||
		lowerToolName.includes("fetch") ||
		lowerToolName.includes("url")
	) {
		return <Globe className="h-4 w-4" />;
	}
	return <FileText className="h-4 w-4" />;
}

function formatToolDisplayName(toolName: string, serverName?: string) {
	const displayNameMap: Record<string, string> = {
		webSearch: "Exa Web Search",
	};

	const displayName = displayNameMap[toolName] || toolName;
	return serverName ? `${serverName} - ${displayName}` : displayName;
}
