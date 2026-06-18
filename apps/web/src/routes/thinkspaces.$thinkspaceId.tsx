import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@better-agent/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@better-agent/ui/components/dropdown-menu";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@better-agent/ui/components/select";
import { Separator } from "@better-agent/ui/components/separator";
import {
	Tabs,
	TabsIndicator,
	TabsList,
	TabsPanel,
	TabsTab,
} from "@better-agent/ui/components/tabs";
import { Textarea } from "@better-agent/ui/components/textarea";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import {
	ActivityIcon,
	ArchiveIcon,
	ChevronRightIcon,
	CircleDashedIcon,
	CircleDotIcon,
	ClockIcon,
	CpuIcon,
	FileTextIcon,
	KeyRoundIcon,
	MessagesSquareIcon,
	MoreHorizontalIcon,
	TargetIcon,
	UserRoundIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";

import { SittingSection } from "@/components/sitting-section";
import { getUser } from "@/functions/get-user";

const routeApi = getRouteApi("/thinkspaces/$thinkspaceId");

const dateFormatter = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatDateTime = (value: Date | number | string | null): string => {
	if (!value) {
		return "—";
	}

	return dateFormatter.format(new Date(value));
};

// Compact date for metadata pills — pills carry the fact, not the full timestamp.
const metaDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

const formatMetaDate = (value: Date | number | string): string =>
	metaDateFormatter.format(new Date(value));

// Active reads affirmative (sage); a draft is neutral; archived is attention.
const getStatusBadgeVariant = (status: string): "destructive" | "outline" | "sage" => {
	if (status === "archived") {
		return "destructive";
	}

	if (status === "draft") {
		return "outline";
	}

	return "sage";
};

// Status pills lead with a glyph so the state reads at a glance, matching the
// metadata-pill pattern (DESIGN.md §7 Document Page).
const renderStatusBadgeIcon = (status: string) => {
	if (status === "archived") {
		return <ArchiveIcon aria-hidden />;
	}

	if (status === "draft") {
		return <CircleDashedIcon aria-hidden />;
	}

	return <CircleDotIcon aria-hidden />;
};

interface EnabledToolSelection {
	risk: "read_only" | "mutating" | "unknown";
	serverId: string;
	toolName?: string;
}

type McpToolAccessScopeView = { type: "server" } | { toolName: string; type: "tool" };

type BuiltInToolId = "web_search" | "web_fetch" | "source_read" | "memory_write";

interface BuiltInToolView {
	description: string;
	id: BuiltInToolId;
	name: string;
}

const BUILT_IN_TOOLS: readonly BuiltInToolView[] = [
	{
		description: "Search the public web. Read-only; potent only with the web reading Permission.",
		id: "web_search",
		name: "Web search",
	},
	{
		description:
			"Fetch and read public web pages. Read-only; potent only with the web reading Permission.",
		id: "web_fetch",
		name: "Web fetch",
	},
	{
		description: "Read this Thinkspace's Sources. Potent only with the Source reading Permission.",
		id: "source_read",
		name: "Source reading",
	},
	{
		description:
			"Propose a durable Product Memory, held for your Approval before it takes effect. Potent only with the Memory writing Permission.",
		id: "memory_write",
		name: "Memory writing",
	},
];

const isBuiltInToolId = (value: string): value is BuiltInToolId =>
	BUILT_IN_TOOLS.some((tool) => tool.id === value);

interface PermissionRequestView {
	actions?: string[];
	approvalRequired?: boolean;
	kind?:
		| "built_in_memory_write"
		| "built_in_source_read"
		| "built_in_web_read"
		| "mcp_tool_access"
		| "model_provider_credential";
	providerId?: string;
	reason?: string;
	resource?: {
		serverId: string;
		toolName: string;
	};
	risk?: string;
	scope?: McpToolAccessScopeView;
	serverId?: string;
	type?: string;
}

interface GrantedPermissionView {
	id: string;
	kind: string;
	providerId: string | null;
	reason: string;
	resourceScope: string;
}

type ToolPotencyView = "inert" | "potent";

interface EnabledToolPotencyView {
	potency: ToolPotencyView;
	source: string;
	toolId: string;
}

interface AgentProfileRevisionView {
	identity: {
		displayName: string;
		instructions: string;
	};
	modelBehavior: {
		modelId: string;
		reasoningLevel: string;
	};
	requestedPermissions?: PermissionRequestView[];
	status: "active" | "draft" | "superseded";
	toolEnablements: { source: string; toolId: string }[];
	version: number;
}

const toEnabledToolSelection = (enablement: { toolId: string }): EnabledToolSelection => {
	const [serverId, toolName] = enablement.toolId.split(":", 2);

	return { risk: "unknown", serverId: serverId ?? enablement.toolId, toolName };
};

const toProductToolId = (selection: EnabledToolSelection): string =>
	selection.toolName ? `${selection.serverId}:${selection.toolName}` : selection.serverId;

/**
 * The revision the owner edits and activates. A pending draft (post-activation
 * tool changes) takes precedence over the active revision so toggles stay
 * visible and can be re-activated; before the first activation it is the initial
 * draft.
 */
const resolveEditableRevision = (
	profileRevision: AgentProfileRevisionView | null,
	pendingDraftRevision: AgentProfileRevisionView | null,
): AgentProfileRevisionView | null => pendingDraftRevision ?? profileRevision;

const formatToolSource = (source: string): string => {
	if (source === "built_in") {
		return "Built-in tool";
	}

	if (source === "mcp_server") {
		return "External information source";
	}

	if (source === "connected_account") {
		return "Connected Account tool";
	}

	if (source === "local_node") {
		return "Local Node tool";
	}

	return "Tool";
};

const getToolPotencyLabel = (potency: ToolPotencyView): string =>
	potency === "potent" ? "Potent" : "Inert";

const getToolPotencyBadgeVariant = (
	potency: ToolPotencyView,
): "default" | "outline" | "secondary" => (potency === "potent" ? "default" : "secondary");

const formatMcpScope = (scope: McpToolAccessScopeView | undefined): string => {
	if (!scope) {
		return "source scope";
	}

	return scope.type === "server" ? "source scope" : `specific tool: ${scope.toolName}`;
};

const parseStoredMcpScope = (value: string): McpToolAccessScopeView | undefined => {
	try {
		const parsed = JSON.parse(value) as unknown;

		if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
			const { type } = parsed as { type?: unknown };
			if (type === "server") {
				return { type: "server" };
			}
			if (type === "tool" && typeof (parsed as { toolName?: unknown }).toolName === "string") {
				return { toolName: (parsed as { toolName: string }).toolName, type: "tool" };
			}
		}
	} catch {
		return undefined;
	}

	return undefined;
};

const getPermissionRequestTitle = (permission: PermissionRequestView, index: number): string => {
	if (permission.kind === "built_in_web_read") {
		return "Web reading (built-in)";
	}

	if (permission.kind === "built_in_source_read") {
		return "Source reading (built-in)";
	}

	if (permission.kind === "built_in_memory_write") {
		return "Memory writing (built-in)";
	}

	if (permission.kind === "model_provider_credential") {
		return `Model credential: ${permission.providerId}`;
	}

	if (permission.kind === "mcp_tool_access") {
		return `External information access: ${permission.serverId}`;
	}

	return `${permission.resource?.serverId ?? `Permission request ${index + 1}`}${
		permission.resource?.toolName ? `/${permission.resource.toolName}` : ""
	}`;
};

const getPermissionRequestDescription = (permission: PermissionRequestView): string => {
	if (permission.kind === "mcp_tool_access") {
		return `${formatMcpScope(permission.scope)} · Risk: ${permission.risk ?? "unknown"} · ${permission.reason ?? "No reason provided."}`;
	}

	return (
		permission.reason ??
		`Risk: ${permission.risk ?? "unknown"} · Approval required: ${permission.approvalRequired ? "yes" : "no"}`
	);
};

const getGrantedPermissionTitle = (permission: GrantedPermissionView): string => {
	if (permission.kind === "built_in_web_read") {
		return "Web reading (built-in)";
	}

	if (permission.kind === "built_in_source_read") {
		return "Source reading (built-in)";
	}

	if (permission.kind === "built_in_memory_write") {
		return "Memory writing (built-in)";
	}

	if (permission.kind === "mcp_tool_access") {
		return `External information access: ${permission.providerId ?? "scoped source"}`;
	}

	if (permission.kind === "model_provider_credential") {
		return `Model credential: ${permission.providerId ?? "provider"}`;
	}

	return `${permission.kind}: ${permission.providerId ?? "scoped resource"}`;
};

const getGrantedPermissionDescription = (permission: GrantedPermissionView): string => {
	const scope =
		permission.kind === "mcp_tool_access"
			? `${formatMcpScope(parseStoredMcpScope(permission.resourceScope))} · `
			: "";

	return `${scope}${permission.reason || "No reason provided."}`;
};

type TurnInspectionStatus = "accepted" | "completed" | "failed" | "running" | "unknown";

const TURN_STATUS_BADGE_VARIANTS: Record<
	TurnInspectionStatus,
	"default" | "destructive" | "outline" | "secondary"
> = {
	accepted: "secondary",
	completed: "default",
	failed: "destructive",
	running: "secondary",
	unknown: "outline",
};

const TURN_STATUS_POLL_INTERVAL_MS = 2000;

const getSubmitTurnBlockedMessage = ({
	isArchived,
	isDraft,
	modelReady,
}: {
	isArchived: boolean;
	isDraft: boolean;
	modelReady: boolean;
}): string | null => {
	if (isArchived) {
		return "Archived Thinkspaces cannot accept new Thinkspace Agent turns.";
	}

	if (isDraft) {
		return "Activate this Thinkspace before submitting turns.";
	}

	if (!modelReady) {
		return "Model configuration must be ready before submitting a turn.";
	}

	return null;
};

const TurnInspectionPanel = ({
	initialSubmissionId,
	thinkspaceId,
}: {
	initialSubmissionId: string;
	thinkspaceId: string;
}) => {
	const context = routeApi.useRouteContext();
	const [submissionIdInput, setSubmissionIdInput] = useState(initialSubmissionId);
	const [inspectedSubmissionId, setInspectedSubmissionId] = useState(initialSubmissionId);
	const inspectionQuery = useQuery(
		context.orpc.thinkspaces.inspectTurn.queryOptions({
			enabled: Boolean(inspectedSubmissionId),
			input: { submissionId: inspectedSubmissionId, thinkspaceId },
			refetchInterval: (query) => {
				const status = query.state.data?.status;
				return status === "accepted" || status === "running" ? TURN_STATUS_POLL_INTERVAL_MS : false;
			},
		}),
	);
	const inspection = inspectionQuery.data;

	return (
		<div className="grid gap-3 rounded-lg p-4 ring-1 ring-foreground/10">
			<div className="grid gap-1">
				<p className="text-sm font-medium">Turn status</p>
				<p className="text-muted-foreground text-xs">
					Inspect a submitted turn by its submission handle. These runtime diagnostics are for
					debugging and are not the Audit Trail.
				</p>
			</div>
			<form
				className="flex items-end gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					setInspectedSubmissionId(submissionIdInput.trim());
				}}
			>
				<div className="grid flex-1 gap-2">
					<Label htmlFor="turn-submission-id">Submission handle</Label>
					<Input
						id="turn-submission-id"
						maxLength={128}
						onChange={(event) => setSubmissionIdInput(event.target.value)}
						placeholder="Paste a submission handle from an accepted turn."
						value={submissionIdInput}
					/>
				</div>
				<Button
					disabled={!submissionIdInput.trim() || inspectionQuery.isFetching}
					type="submit"
					variant="outline"
				>
					Check status
				</Button>
			</form>
			{inspectionQuery.isError ? (
				<p className="text-destructive text-xs" role="alert">
					{inspectionQuery.error.message}
				</p>
			) : null}
			{inspection ? (
				<div className="grid gap-2 border-border border-t pt-3">
					<div className="flex items-center justify-between gap-4">
						<p className="break-all text-muted-foreground text-xs">{inspection.submissionId}</p>
						<Badge variant={TURN_STATUS_BADGE_VARIANTS[inspection.status]}>
							{inspection.status}
						</Badge>
					</div>
					<p className="text-muted-foreground text-sm">{inspection.message}</p>
					{inspection.resultText ? (
						<p className="whitespace-pre-wrap rounded-md p-3 ring-1 ring-foreground/10 text-sm leading-relaxed">
							{inspection.resultText}
						</p>
					) : null}
					{inspection.toolActivity.length > 0 ? (
						<div className="grid gap-1">
							<p className="font-medium text-sm">Tool activity</p>
							<ul className="grid list-disc gap-1 pl-5 text-muted-foreground text-sm">
								{inspection.toolActivity.map((entry, position) => (
									<li key={`${position}-${entry}`}>{entry}</li>
								))}
							</ul>
						</div>
					) : null}
					<div className="flex flex-wrap gap-4 text-muted-foreground text-xs">
						<span>Accepted {formatDateTime(inspection.acceptedAt)}</span>
						<span>Started {formatDateTime(inspection.startedAt)}</span>
						<span>Completed {formatDateTime(inspection.completedAt)}</span>
					</div>
				</div>
			) : null}
		</div>
	);
};

const AgentProfileSection = ({
	activationError,
	isActivating,
	onActivate,
	pendingDraftRevision,
	profileRevision,
}: {
	activationError?: Error | null;
	isActivating: boolean;
	onActivate: () => void;
	pendingDraftRevision: AgentProfileRevisionView | null;
	profileRevision: AgentProfileRevisionView | null;
}) => {
	const isReactivation = Boolean(pendingDraftRevision);
	// The draft the owner can activate: a pending re-activation on an active
	// Thinkspace, or the initial draft before the first activation.
	const activatableDraft =
		pendingDraftRevision ?? (profileRevision?.status === "draft" ? profileRevision : null);
	const idleActivateLabel = isReactivation ? "Activate changes" : "Activate Thinkspace";
	const activateButtonLabel = isActivating ? "Activating…" : idleActivateLabel;

	return (
		<section aria-labelledby="agent-profile-heading" className="grid gap-4">
			<div className="grid gap-1">
				<h2 className="text-lg font-semibold tracking-tight" id="agent-profile-heading">
					Agent Profile
				</h2>
				<p className="text-muted-foreground text-sm">
					Identity, instructions, and model behavior are versioned together. Drafts take effect only
					when activated.
				</p>
			</div>
			{profileRevision ? (
				<div className="grid gap-4 rounded-lg p-4 ring-1 ring-foreground/10">
					<div className="flex items-start justify-between gap-4">
						<div className="grid gap-1">
							<p className="text-sm font-medium">{profileRevision.identity.displayName}</p>
							<p className="text-muted-foreground text-xs">
								Revision {profileRevision.version} · {profileRevision.status}
							</p>
						</div>
						<Badge variant={profileRevision.status === "active" ? "default" : "outline"}>
							{profileRevision.status}
						</Badge>
					</div>
					<div className="grid gap-1 border-border border-t pt-4">
						<p className="text-muted-foreground text-xs font-medium">Instructions</p>
						<p className="whitespace-pre-wrap text-sm leading-relaxed">
							{profileRevision.identity.instructions || "No instructions yet."}
						</p>
					</div>
					<div className="grid gap-1 border-border border-t pt-4">
						<p className="text-muted-foreground text-xs font-medium">Model behavior</p>
						<p className="break-all text-sm">{profileRevision.modelBehavior.modelId}</p>
						<p className="text-muted-foreground text-xs">
							Reasoning level: {profileRevision.modelBehavior.reasoningLevel}
						</p>
					</div>
					{activatableDraft ? (
						<div className="grid gap-2 border-border border-t pt-4">
							<p className="text-muted-foreground text-sm">
								{isReactivation
									? `Revision ${activatableDraft.version} has staged tool and Permission changes. Activate to apply them and re-grant the requested Permissions; the active revision keeps running until you do.`
									: "Activation makes this revision the Thinkspace Agent's active behavior and moves the Thinkspace out of draft."}
							</p>
							<div>
								<Button disabled={isActivating} onClick={onActivate} type="button">
									{activateButtonLabel}
								</Button>
							</div>
							{activationError ? (
								<p className="text-destructive text-sm" role="alert">
									{activationError.message}
								</p>
							) : null}
						</div>
					) : null}
				</div>
			) : (
				<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
					No Agent Profile revision has been created for this Thinkspace yet.
				</p>
			)}
		</section>
	);
};

const SubmitTurnSection = ({
	isArchived,
	isDraft,
	modelReady,
	thinkspaceId,
}: {
	isArchived: boolean;
	isDraft: boolean;
	modelReady: boolean;
	thinkspaceId: string;
}) => {
	const context = routeApi.useRouteContext();
	const [turnInstruction, setTurnInstruction] = useState("");
	const [turnIdempotencyKey, setTurnIdempotencyKey] = useState(() => crypto.randomUUID());
	const submitTurnMutation = useMutation(
		context.orpc.thinkspaces.submitTurn.mutationOptions({
			onSuccess: () => {
				setTurnInstruction("");
				setTurnIdempotencyKey(crypto.randomUUID());
			},
		}),
	);
	const blockedMessage = getSubmitTurnBlockedMessage({ isArchived, isDraft, modelReady });
	const turnInputDisabled = Boolean(blockedMessage);
	const submitDisabled =
		turnInputDisabled || !turnInstruction.trim() || submitTurnMutation.isPending;

	return (
		<section aria-labelledby="submit-turn-heading" className="grid gap-4">
			<div className="grid gap-1">
				<h2 className="text-lg font-semibold tracking-tight" id="submit-turn-heading">
					Submit a turn
				</h2>
				<p className="text-muted-foreground text-sm">
					Send a bounded instruction to this Thinkspace Agent. Work is durably accepted and can be
					inspected later; acceptance is separate from completion.
				</p>
			</div>
			<form
				className="grid gap-3 rounded-lg p-4 ring-1 ring-foreground/10"
				onSubmit={(event) => {
					event.preventDefault();
					if (submitDisabled) {
						return;
					}
					submitTurnMutation.mutate({
						idempotencyKey: turnIdempotencyKey,
						instruction: turnInstruction,
						thinkspaceId,
					});
				}}
			>
				<div className="grid gap-2">
					<Label htmlFor="turn-instruction">Instruction</Label>
					<Textarea
						disabled={turnInputDisabled}
						id="turn-instruction"
						maxLength={4000}
						onChange={(event) => setTurnInstruction(event.target.value)}
						placeholder="Describe one bounded piece of work for this Thinkspace Agent."
						rows={3}
						value={turnInstruction}
					/>
				</div>
				{blockedMessage ? <p className="text-muted-foreground text-xs">{blockedMessage}</p> : null}
				{submitTurnMutation.isError ? (
					<p className="text-destructive text-xs">{submitTurnMutation.error.message}</p>
				) : null}
				{submitTurnMutation.data ? (
					<div className="grid gap-1 border-border border-t pt-3">
						<div className="flex items-center justify-between gap-4">
							<p className="text-sm font-medium">Last accepted turn</p>
							<Badge variant={submitTurnMutation.data.deduplicated ? "outline" : "default"}>
								{submitTurnMutation.data.deduplicated ? "already accepted" : "accepted"}
							</Badge>
						</div>
						<p className="break-all text-muted-foreground text-xs">
							Submission: {submitTurnMutation.data.submissionId}
						</p>
						<p className="text-muted-foreground text-xs">
							Accepted {formatDateTime(submitTurnMutation.data.acceptedAt)}
						</p>
					</div>
				) : null}
				<div>
					<Button disabled={submitDisabled} type="submit">
						{submitTurnMutation.isPending ? "Submitting…" : "Submit turn"}
					</Button>
				</div>
			</form>
			<TurnInspectionPanel
				initialSubmissionId={submitTurnMutation.data?.submissionId ?? ""}
				key={submitTurnMutation.data?.submissionId ?? "no-accepted-turn"}
				thinkspaceId={thinkspaceId}
			/>
		</section>
	);
};

const formatSourceSize = (sizeBytes: number): string => {
	if (sizeBytes < 1024) {
		return `${sizeBytes} B`;
	}

	return `${(sizeBytes / 1024).toFixed(1)} KB`;
};

const formatSourceContentType = (contentType: string): string =>
	contentType === "text/markdown" ? "Markdown" : "Plain text";

const SOURCE_CONTENT_TYPE_OPTIONS = [
	{ label: "Markdown", value: "text/markdown" },
	{ label: "Plain text", value: "text/plain" },
] as const;

type SourceContentTypeOption = (typeof SOURCE_CONTENT_TYPE_OPTIONS)[number]["value"];

const SourcesSection = ({
	isArchived,
	thinkspaceId,
}: {
	isArchived: boolean;
	thinkspaceId: string;
}) => {
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const [sourceName, setSourceName] = useState("");
	const [sourceDescription, setSourceDescription] = useState("");
	const [sourceContentType, setSourceContentType] =
		useState<SourceContentTypeOption>("text/markdown");
	const [sourceContent, setSourceContent] = useState("");
	const [viewedSourceId, setViewedSourceId] = useState<string | null>(null);
	const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
	const sourcesQuery = useQuery(
		context.orpc.sources.list.queryOptions({ input: { thinkspaceId } }),
	);
	const sourceContentQuery = useQuery(
		context.orpc.sources.getContent.queryOptions({
			enabled: Boolean(viewedSourceId),
			input: { sourceId: viewedSourceId ?? "", thinkspaceId },
		}),
	);
	const invalidateSources = async () => {
		await queryClient.invalidateQueries({
			queryKey: context.orpc.sources.list.queryKey({ input: { thinkspaceId } }),
		});
	};
	const uploadSourceMutation = useMutation(
		context.orpc.sources.upload.mutationOptions({
			onSuccess: async () => {
				setSourceName("");
				setSourceDescription("");
				setSourceContent("");
				await invalidateSources();
			},
		}),
	);
	const deleteSourceMutation = useMutation(
		context.orpc.sources.delete.mutationOptions({
			onMutate: ({ sourceId }) => {
				setDeletingSourceId(sourceId);
			},
			onSettled: () => {
				setDeletingSourceId(null);
			},
			onSuccess: async ({ deletedSourceId }) => {
				setViewedSourceId((current) => (current === deletedSourceId ? null : current));
				await invalidateSources();
			},
		}),
	);
	const sources = sourcesQuery.data ?? [];
	const uploadDisabled =
		isArchived || !sourceName.trim() || !sourceContent || uploadSourceMutation.isPending;

	return (
		<section aria-labelledby="sources-heading" className="grid gap-4">
			<div className="grid gap-1">
				<h2 className="text-lg font-semibold tracking-tight" id="sources-heading">
					Sources
				</h2>
				<p className="text-muted-foreground text-sm">
					Material you hand to this Thinkspace — requirement docs, exported notes, ADRs. Sources are
					scoped to this Thinkspace only.
				</p>
			</div>
			<form
				className="grid gap-3 rounded-lg p-4 ring-1 ring-foreground/10"
				onSubmit={(event) => {
					event.preventDefault();
					if (uploadDisabled) {
						return;
					}
					uploadSourceMutation.mutate({
						content: sourceContent,
						contentType: sourceContentType,
						description: sourceDescription.trim() || undefined,
						name: sourceName,
						thinkspaceId,
					});
				}}
			>
				<div className="grid gap-2 sm:grid-cols-2">
					<div className="grid gap-2">
						<Label htmlFor="source-name">Name</Label>
						<Input
							disabled={isArchived}
							id="source-name"
							maxLength={120}
							onChange={(event) => setSourceName(event.target.value)}
							placeholder="Vendor pricing notes"
							value={sourceName}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="source-content-type">Format</Label>
						<Select
							disabled={isArchived}
							items={SOURCE_CONTENT_TYPE_OPTIONS}
							onValueChange={(value) => setSourceContentType(value as SourceContentTypeOption)}
							value={sourceContentType}
						>
							<SelectTrigger className="w-full" id="source-content-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SOURCE_CONTENT_TYPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="source-description">Description (optional)</Label>
					<Input
						disabled={isArchived}
						id="source-description"
						maxLength={500}
						onChange={(event) => setSourceDescription(event.target.value)}
						placeholder="What this material is for"
						value={sourceDescription}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="source-content">Content</Label>
					<Textarea
						disabled={isArchived}
						id="source-content"
						onChange={(event) => setSourceContent(event.target.value)}
						placeholder="Paste the text or markdown content of this Source."
						rows={5}
						value={sourceContent}
					/>
				</div>
				{uploadSourceMutation.isError ? (
					<p className="text-destructive text-xs" role="alert">
						{uploadSourceMutation.error.message}
					</p>
				) : null}
				<div>
					<Button disabled={uploadDisabled} type="submit">
						{uploadSourceMutation.isPending ? "Uploading…" : "Upload Source"}
					</Button>
				</div>
			</form>
			{sources.length === 0 ? (
				<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
					No Sources uploaded to this Thinkspace yet.
				</p>
			) : (
				<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
					{sources.map((source, index) => (
						<div
							key={source.id}
							className={`grid gap-2 p-4 ${index < sources.length - 1 ? "border-b border-border" : ""}`}
						>
							<div className="flex items-start justify-between gap-4">
								<div className="grid gap-0.5">
									<p className="text-sm font-medium">{source.name}</p>
									{source.description ? (
										<p className="text-muted-foreground text-xs">{source.description}</p>
									) : null}
									<p className="text-muted-foreground text-xs">
										{formatSourceContentType(source.contentType)} ·{" "}
										{formatSourceSize(source.sizeBytes)} · Uploaded{" "}
										{formatDateTime(source.createdAt)}
									</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<Button
										onClick={() =>
											setViewedSourceId((current) => (current === source.id ? null : source.id))
										}
										size="sm"
										type="button"
										variant="outline"
									>
										{viewedSourceId === source.id ? "Hide" : "View"}
									</Button>
									<Button
										disabled={Boolean(deletingSourceId)}
										onClick={() =>
											deleteSourceMutation.mutate({ sourceId: source.id, thinkspaceId })
										}
										size="sm"
										type="button"
										variant="outline"
									>
										{deletingSourceId === source.id ? "Deleting…" : "Delete"}
									</Button>
								</div>
							</div>
							{viewedSourceId === source.id ? (
								<div className="grid gap-2 border-border border-t pt-3">
									{sourceContentQuery.isError ? (
										<p className="text-destructive text-xs" role="alert">
											{sourceContentQuery.error.message}
										</p>
									) : null}
									{sourceContentQuery.isFetching ? (
										<p className="text-muted-foreground text-xs">Loading content…</p>
									) : null}
									{sourceContentQuery.data && sourceContentQuery.data.id === source.id ? (
										<p className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md p-3 ring-1 ring-foreground/10 text-sm leading-relaxed">
											{sourceContentQuery.data.content}
										</p>
									) : null}
								</div>
							) : null}
						</div>
					))}
				</div>
			)}
			{deleteSourceMutation.isError ? (
				<p className="text-destructive text-sm" role="alert">
					{deleteSourceMutation.error.message}
				</p>
			) : null}
		</section>
	);
};

interface McpCatalogServerView {
	description: string;
	id: string;
	name: string;
	riskLevel: EnabledToolSelection["risk"];
}

const ToolsSection = ({
	enabledBuiltInToolIds,
	enabledTools,
	isArchived,
	mcpCatalog,
	onToggleBuiltInTool,
	onToggleCatalogTool,
	profileRevision,
	toolPotencyById,
	updateToolSelectionsError,
	updateToolSelectionsPending,
}: {
	enabledBuiltInToolIds: BuiltInToolId[];
	enabledTools: EnabledToolSelection[];
	isArchived: boolean;
	mcpCatalog: McpCatalogServerView[];
	onToggleBuiltInTool: (toolId: BuiltInToolId) => void;
	onToggleCatalogTool: (serverId: string, risk: EnabledToolSelection["risk"]) => void;
	profileRevision: AgentProfileRevisionView | null;
	toolPotencyById: ReadonlyMap<string, EnabledToolPotencyView>;
	updateToolSelectionsError?: Error | null;
	updateToolSelectionsPending: boolean;
}) => (
	<section aria-labelledby="tools-heading" className="grid gap-4">
		<div className="grid gap-1">
			<div className="flex items-center gap-2">
				<h2 className="text-lg font-semibold tracking-tight" id="tools-heading">
					Tools
				</h2>
				{profileRevision ? <Badge variant="outline">{profileRevision.status}</Badge> : null}
			</div>
			<p className="text-muted-foreground text-sm">
				Select catalog tools on the Agent Profile revision. Draft selections take effect after
				activation; active selections are used for turns.
			</p>
		</div>
		<div className="grid gap-2">
			<p className="text-sm font-medium">Built-in tools</p>
			<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
				{BUILT_IN_TOOLS.map((tool, index) => {
					const selected = enabledBuiltInToolIds.includes(tool.id);
					const toolPotency = selected ? toolPotencyById.get(tool.id) : undefined;

					return (
						<div
							key={tool.id}
							className={`flex items-center justify-between gap-4 p-4 ${index < BUILT_IN_TOOLS.length - 1 ? "border-b border-border" : ""} ${selected ? "bg-muted/30" : ""}`}
						>
							<div className="grid gap-0.5">
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium">{tool.name}</p>
									<span className="text-muted-foreground text-xs">read_only</span>
									{toolPotency ? (
										<Badge variant={getToolPotencyBadgeVariant(toolPotency.potency)}>
											{getToolPotencyLabel(toolPotency.potency)}
										</Badge>
									) : null}
								</div>
								<p className="text-muted-foreground text-sm">{tool.description}</p>
							</div>
							<Button
								disabled={isArchived || updateToolSelectionsPending}
								onClick={() => onToggleBuiltInTool(tool.id)}
								size="sm"
								type="button"
								variant={selected ? "secondary" : "outline"}
							>
								{selected ? "Remove" : "Select"}
							</Button>
						</div>
					);
				})}
			</div>
		</div>
		{mcpCatalog.length === 0 ? (
			<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
				No tools in the catalog.
			</p>
		) : (
			<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
				{mcpCatalog.map((server, index) => {
					const selectedTool = enabledTools.find((tool) => tool.serverId === server.id);
					const selected = Boolean(selectedTool);
					const toolPotency = selectedTool
						? toolPotencyById.get(toProductToolId(selectedTool))
						: undefined;

					return (
						<div
							key={server.id}
							className={`flex items-center justify-between gap-4 p-4 ${index < mcpCatalog.length - 1 ? "border-b border-border" : ""} ${selected ? "bg-muted/30" : ""}`}
						>
							<div className="grid gap-0.5">
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium">{server.name}</p>
									<span className="text-muted-foreground text-xs">{server.riskLevel}</span>
									{toolPotency ? (
										<Badge variant={getToolPotencyBadgeVariant(toolPotency.potency)}>
											{getToolPotencyLabel(toolPotency.potency)}
										</Badge>
									) : null}
								</div>
								<p className="text-muted-foreground text-sm">{server.description}</p>
							</div>
							<Button
								disabled={isArchived || updateToolSelectionsPending}
								onClick={() => onToggleCatalogTool(server.id, server.riskLevel)}
								size="sm"
								type="button"
								variant={selected ? "secondary" : "outline"}
							>
								{selected ? "Remove" : "Select"}
							</Button>
						</div>
					);
				})}
			</div>
		)}
		<div className="grid gap-2">
			<p className="text-sm font-medium">Enabled on Agent Profile</p>
			{profileRevision?.toolEnablements.length ? (
				<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
					{profileRevision.toolEnablements.map((enablement, index) => {
						const toolPotency = toolPotencyById.get(enablement.toolId);

						return (
							<div
								key={`${enablement.source}:${enablement.toolId}`}
								className={`flex items-center justify-between gap-4 p-4 ${index < profileRevision.toolEnablements.length - 1 ? "border-b border-border" : ""}`}
							>
								<div className="grid gap-0.5">
									<p className="break-all text-sm font-medium">{enablement.toolId}</p>
									<p className="text-muted-foreground text-xs">
										{formatToolSource(enablement.source)}
									</p>
								</div>
								{toolPotency ? (
									<Badge variant={getToolPotencyBadgeVariant(toolPotency.potency)}>
										{getToolPotencyLabel(toolPotency.potency)}
									</Badge>
								) : (
									<Badge variant="outline">Activates later</Badge>
								)}
							</div>
						);
					})}
				</div>
			) : (
				<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
					No tools enabled on this Agent Profile revision.
				</p>
			)}
		</div>
		{updateToolSelectionsError ? (
			<p className="text-destructive text-sm" role="alert">
				{updateToolSelectionsError.message}
			</p>
		) : null}
	</section>
);

const PermissionsSection = ({
	grantedPermissions,
	onRevokeGrantedPermission,
	requestedPermissions,
	revokePermissionError,
	revokingPermissionId,
}: {
	grantedPermissions: GrantedPermissionView[];
	onRevokeGrantedPermission: (permissionId: string) => void;
	requestedPermissions: PermissionRequestView[];
	revokePermissionError?: Error | null;
	revokingPermissionId: string | null;
}) => (
	<section aria-labelledby="permissions-heading" className="grid gap-4">
		<div className="grid gap-1">
			<h2 className="text-lg font-semibold tracking-tight" id="permissions-heading">
				Permissions
			</h2>
			<p className="text-muted-foreground text-sm">
				Scoped access for this Thinkspace. Permissions are separate from Approvals.
			</p>
		</div>
		<div className="grid gap-3">
			<div className="grid gap-2">
				<p className="text-sm font-medium">Requested on draft</p>
				{requestedPermissions.length === 0 ? (
					<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
						No draft Permission requests.
					</p>
				) : (
					<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
						{requestedPermissions.map((permission, index) => (
							<div
								key={`${permission.kind ?? permission.type}:${permission.providerId ?? permission.serverId ?? permission.resource?.serverId ?? index}`}
								className={`grid gap-0.5 p-4 ${index < requestedPermissions.length - 1 ? "border-b border-border" : ""}`}
							>
								<p className="text-sm font-medium">
									{getPermissionRequestTitle(permission, index)}
								</p>
								<p className="text-muted-foreground text-xs">
									{getPermissionRequestDescription(permission)}
								</p>
							</div>
						))}
					</div>
				)}
			</div>
			<div className="grid gap-2">
				<p className="text-sm font-medium">Granted to Thinkspace</p>
				{grantedPermissions.length === 0 ? (
					<p className="rounded-lg p-4 ring-1 ring-foreground/10 text-muted-foreground text-sm">
						No granted Permissions.
					</p>
				) : (
					<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
						{grantedPermissions.map((permission, index) => {
							const canRevoke =
								permission.kind === "mcp_tool_access" ||
								permission.kind === "built_in_web_read" ||
								permission.kind === "built_in_source_read";
							const isRevoking = revokingPermissionId === permission.id;

							return (
								<div
									key={permission.id}
									className={`flex items-start justify-between gap-4 p-4 ${index < grantedPermissions.length - 1 ? "border-b border-border" : ""}`}
								>
									<div className="grid gap-0.5">
										<p className="text-sm font-medium">{getGrantedPermissionTitle(permission)}</p>
										<p className="text-muted-foreground text-xs">
											{getGrantedPermissionDescription(permission)}
										</p>
									</div>
									{canRevoke ? (
										<Button
											disabled={Boolean(revokingPermissionId)}
											onClick={() => onRevokeGrantedPermission(permission.id)}
											size="sm"
											type="button"
											variant="outline"
										>
											{isRevoking ? "Revoking…" : "Revoke"}
										</Button>
									) : null}
								</div>
							);
						})}
					</div>
				)}
				{revokePermissionError ? (
					<p className="text-destructive text-sm" role="alert">
						{revokePermissionError.message}
					</p>
				) : null}
			</div>
		</div>
	</section>
);

const ThinkspaceHeader = ({
	archiveDialogOpen,
	archiveError,
	grantedPermissionsCount,
	isArchived,
	isArchiving,
	isDraft,
	modelReady,
	onArchive,
	onArchiveDialogOpenChange,
	thinkspace,
}: {
	archiveDialogOpen: boolean;
	archiveError?: Error | null;
	grantedPermissionsCount: number;
	isArchived: boolean;
	isArchiving: boolean;
	isDraft: boolean;
	modelReady: boolean;
	onArchive: () => void;
	onArchiveDialogOpenChange: (open: boolean) => void;
	thinkspace: {
		archivedAt: Date | number | string | null;
		configurationSummary: string | null;
		goal: string;
		status: string;
		updatedAt: Date | number | string;
	};
}) => (
	<header className="grid gap-4">
		<nav
			aria-label="Breadcrumb"
			className="flex items-center gap-1.5 text-muted-foreground text-xs"
		>
			<Link className="transition-colors hover:text-foreground" to="/thinkspaces">
				Thinkspaces
			</Link>
			<ChevronRightIcon aria-hidden className="size-3.5" />
			<span aria-current="page" className="line-clamp-1 text-foreground">
				{thinkspace.goal}
			</span>
		</nav>
		<div className="flex items-start justify-between gap-4">
			<div className="flex items-start gap-2.5">
				<TargetIcon aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground" />
				<h1 className="text-2xl font-semibold tracking-tight text-balance">{thinkspace.goal}</h1>
			</div>
			{isArchived ? null : (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={<Button aria-label="Thinkspace actions" size="icon" variant="ghost" />}
					>
						<MoreHorizontalIcon />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							disabled={isDraft}
							onClick={() => onArchiveDialogOpenChange(true)}
							variant="destructive"
						>
							<ArchiveIcon />
							Archive Thinkspace
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
		<div className="flex flex-wrap items-center gap-1.5">
			<Badge variant={getStatusBadgeVariant(thinkspace.status)}>
				{renderStatusBadgeIcon(thinkspace.status)}
				<span className="capitalize">{thinkspace.status}</span>
			</Badge>
			<Badge variant={modelReady ? "sage" : "destructive"}>
				<CpuIcon aria-hidden />
				{modelReady ? "Model ready" : "Model not ready"}
			</Badge>
			<Badge variant="outline">
				<KeyRoundIcon aria-hidden />
				{grantedPermissionsCount} {grantedPermissionsCount === 1 ? "Permission" : "Permissions"}
			</Badge>
			<Badge variant="outline">
				<ClockIcon aria-hidden />
				Updated {formatMetaDate(thinkspace.updatedAt)}
			</Badge>
			{thinkspace.archivedAt ? (
				<Badge variant="outline">
					<ArchiveIcon aria-hidden />
					Archived {formatMetaDate(thinkspace.archivedAt)}
				</Badge>
			) : null}
		</div>
		{thinkspace.configurationSummary ? (
			<p className="max-w-[65ch] text-muted-foreground text-sm leading-relaxed text-pretty">
				{thinkspace.configurationSummary}
			</p>
		) : null}
		<Dialog onOpenChange={onArchiveDialogOpenChange} open={archiveDialogOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Archive this Thinkspace?</DialogTitle>
					<DialogDescription>
						Archiving disables active work and scheduled Routines. The Thinkspace stays inspectable
						— you can read its full history at any time.
					</DialogDescription>
				</DialogHeader>
				{archiveError ? (
					<p className="text-destructive text-sm" role="alert">
						{archiveError.message}
					</p>
				) : null}
				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button disabled={isArchiving} onClick={onArchive} variant="destructive">
						{isArchiving ? "Archiving…" : "Archive Thinkspace"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</header>
);

const RuntimeSection = ({
	modelReadiness,
	runtimePolicy,
	runtimeReadiness,
}: {
	modelReadiness: {
		message: string;
		modelId: string;
		modelName?: string | null;
		providerName?: string | null;
		status: string;
	};
	runtimePolicy: {
		capabilities: readonly { enabled: boolean; id: string; label: string }[];
		message: string;
		mode: string;
	};
	runtimeReadiness: {
		bindingName: string;
		className: string;
		runtimeName: string;
		status: string;
	};
}) => (
	<section aria-labelledby="runtime-heading" className="grid gap-4">
		<div className="grid gap-1">
			<h2 className="text-lg font-semibold tracking-tight" id="runtime-heading">
				Thinkspace Agent runtime
			</h2>
			<p className="text-muted-foreground text-sm">
				This Thinkspace resolves to one durable Thinkspace Agent using the Thinkspace id as its
				runtime identity.
			</p>
		</div>
		<div className="grid gap-4 rounded-lg p-4 ring-1 ring-foreground/10">
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-4">
					<p className="text-sm font-medium">Runtime readiness</p>
					<Badge variant="outline">{runtimeReadiness.status}</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Binding: {runtimeReadiness.bindingName} · Class: {runtimeReadiness.className}
				</p>
				<p className="break-all text-muted-foreground text-xs">
					Runtime identity: {runtimeReadiness.runtimeName}
				</p>
			</div>
			<div className="grid gap-2 border-border border-t pt-4">
				<div className="flex items-center justify-between gap-4">
					<p className="text-sm font-medium">Model readiness</p>
					<Badge variant={modelReadiness.status === "ready" ? "sage" : "destructive"}>
						{modelReadiness.status === "ready" ? "Ready" : "Not ready"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-sm">{modelReadiness.message}</p>
				<p className="text-muted-foreground text-xs">
					{modelReadiness.modelName ?? modelReadiness.modelId} ·{" "}
					{modelReadiness.providerName ?? "Unknown provider"}
				</p>
			</div>
			<div className="grid gap-2 border-border border-t pt-4">
				<div className="flex items-center justify-between gap-4">
					<p className="text-sm font-medium">Runtime safety policy</p>
					<Badge variant="outline">
						{runtimePolicy.mode === "governed_writes" ? "governed writes" : runtimePolicy.mode}
					</Badge>
				</div>
				<p className="text-muted-foreground text-sm">{runtimePolicy.message}</p>
				<ul className="grid gap-1">
					{runtimePolicy.capabilities.map((capability) => (
						<li className="flex items-center justify-between gap-4 text-xs" key={capability.id}>
							<span className="text-muted-foreground">{capability.label}</span>
							<span className={capability.enabled ? "text-sage" : "text-muted-foreground"}>
								{capability.enabled ? "enabled" : "disabled"}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	</section>
);

const RouteComponent = () => {
	const { thinkspaceId } = routeApi.useParams();
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const [revokingPermissionId, setRevokingPermissionId] = useState<string | null>(null);
	const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
	const thinkspaceQuery = useSuspenseQuery(
		context.orpc.thinkspaces.get.queryOptions({ input: { thinkspaceId } }),
	);
	const runtimeReadinessQuery = useSuspenseQuery(
		context.orpc.thinkspaces.runtimeReadiness.queryOptions({ input: { thinkspaceId } }),
	);
	const modelReadinessQuery = useSuspenseQuery(
		context.orpc.thinkspaces.modelReadiness.queryOptions({ input: { thinkspaceId } }),
	);
	const runtimePolicyQuery = useSuspenseQuery(
		context.orpc.thinkspaces.runtimePolicy.queryOptions({ input: { thinkspaceId } }),
	);
	const mcpCatalogQuery = useSuspenseQuery(context.orpc.mcp.listCatalog.queryOptions());
	const archiveMutation = useMutation(
		context.orpc.thinkspaces.archive.mutationOptions({
			onSuccess: async () => {
				setArchiveDialogOpen(false);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
					}),
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.list.queryKey(),
					}),
				]);
			},
		}),
	);
	const activateAgentProfileMutation = useMutation(
		context.orpc.thinkspaces.activateAgentProfile.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
					}),
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.list.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: context.orpc.thinkspaces.modelReadiness.queryKey({
							input: { thinkspaceId },
						}),
					}),
				]);
			},
		}),
	);
	const updateToolSelectionsMutation = useMutation(
		context.orpc.thinkspaces.updateToolSelections.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
				});
			},
		}),
	);
	const revokePermissionMutation = useMutation(
		context.orpc.thinkspaces.revokePermission.mutationOptions({
			onMutate: ({ permissionId }) => {
				setRevokingPermissionId(permissionId);
			},
			onSettled: () => {
				setRevokingPermissionId(null);
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.thinkspaces.get.queryKey({ input: { thinkspaceId } }),
				});
			},
		}),
	);

	const thinkspace = thinkspaceQuery.data;
	const runtimeReadiness = runtimeReadinessQuery.data;
	const modelReadiness = modelReadinessQuery.data;
	const runtimePolicy = runtimePolicyQuery.data;
	const profileRevision = thinkspace.agentProfileRevision;
	const pendingDraftRevision = thinkspace.pendingDraftRevision as AgentProfileRevisionView | null;
	const editableRevision = resolveEditableRevision(profileRevision, pendingDraftRevision);
	const isArchived = thinkspace.status === "archived";
	const isDraft = thinkspace.status === "draft";
	const enabledTools =
		editableRevision?.toolEnablements
			.filter((enablement) => enablement.source === "mcp_server")
			.map(toEnabledToolSelection) ?? [];
	const enabledBuiltInToolIds =
		editableRevision?.toolEnablements
			.filter((enablement) => enablement.source === "built_in")
			.map((enablement) => enablement.toolId)
			.filter(isBuiltInToolId) ?? [];
	const enabledToolPotencies = (thinkspace.enabledToolPotencies ?? []) as EnabledToolPotencyView[];
	const toolPotencyById = new Map(
		enabledToolPotencies.map((toolPotency) => [toolPotency.toolId, toolPotency] as const),
	);
	const requestedPermissions = editableRevision?.requestedPermissions ?? [];
	const grantedPermissions = (thinkspace.grantedPermissions ?? []) as GrantedPermissionView[];

	const toggleCatalogTool = (serverId: string, risk: "read_only" | "mutating" | "unknown") => {
		const selected = enabledTools.some((tool) => tool.serverId === serverId);
		const selections = selected
			? enabledTools.filter((tool) => tool.serverId !== serverId)
			: [...enabledTools, { risk, serverId }];

		updateToolSelectionsMutation.mutate({
			builtInToolIds: enabledBuiltInToolIds,
			selections,
			thinkspaceId,
		});
	};

	const toggleBuiltInTool = (toolId: BuiltInToolId) => {
		const selected = enabledBuiltInToolIds.includes(toolId);
		const builtInToolIds = selected
			? enabledBuiltInToolIds.filter((enabledToolId) => enabledToolId !== toolId)
			: [...enabledBuiltInToolIds, toolId];

		updateToolSelectionsMutation.mutate({
			builtInToolIds,
			selections: enabledTools,
			thinkspaceId,
		});
	};

	const handleActivateAgentProfile = () => {
		const hasActivatableDraft =
			Boolean(pendingDraftRevision) || profileRevision?.status === "draft";

		if (!hasActivatableDraft || activateAgentProfileMutation.isPending) {
			return;
		}

		activateAgentProfileMutation.mutate({ thinkspaceId });
	};

	const handleArchive = () => {
		if (isArchived || archiveMutation.isPending) {
			return;
		}

		archiveMutation.mutate({ thinkspaceId });
	};

	const handleRevokePermission = (permissionId: string) => {
		if (revokePermissionMutation.isPending) {
			return;
		}

		revokePermissionMutation.mutate({ permissionId, thinkspaceId });
	};

	return (
		<div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
			<ThinkspaceHeader
				archiveDialogOpen={archiveDialogOpen}
				archiveError={archiveMutation.error}
				grantedPermissionsCount={grantedPermissions.length}
				isArchived={isArchived}
				isArchiving={archiveMutation.isPending}
				isDraft={isDraft}
				modelReady={modelReadiness.status === "ready"}
				onArchive={handleArchive}
				onArchiveDialogOpenChange={setArchiveDialogOpen}
				thinkspace={thinkspace}
			/>

			<Tabs defaultValue="sitting">
				<TabsList>
					<TabsTab value="sitting">
						<MessagesSquareIcon />
						Sitting
					</TabsTab>
					<TabsTab value="profile">
						<UserRoundIcon />
						Profile
					</TabsTab>
					<TabsTab value="sources">
						<FileTextIcon />
						Sources
					</TabsTab>
					<TabsTab value="tools">
						<WrenchIcon />
						Tools &amp; Permissions
					</TabsTab>
					<TabsTab value="runtime">
						<ActivityIcon />
						Runtime
					</TabsTab>
					<TabsIndicator />
				</TabsList>

				<TabsPanel value="sitting">
					<SittingSection
						isArchived={isArchived}
						isDraft={isDraft}
						modelReady={modelReadiness.status === "ready"}
						thinkspaceId={thinkspaceId}
					/>
				</TabsPanel>

				<TabsPanel value="profile">
					<AgentProfileSection
						activationError={activateAgentProfileMutation.error}
						isActivating={activateAgentProfileMutation.isPending}
						onActivate={handleActivateAgentProfile}
						pendingDraftRevision={pendingDraftRevision}
						profileRevision={profileRevision}
					/>
				</TabsPanel>

				<TabsPanel value="sources">
					<SourcesSection isArchived={isArchived} thinkspaceId={thinkspaceId} />
				</TabsPanel>

				<TabsPanel className="grid gap-8" value="tools">
					<ToolsSection
						enabledBuiltInToolIds={enabledBuiltInToolIds}
						enabledTools={enabledTools}
						isArchived={isArchived}
						mcpCatalog={mcpCatalogQuery.data}
						onToggleBuiltInTool={toggleBuiltInTool}
						onToggleCatalogTool={toggleCatalogTool}
						profileRevision={editableRevision}
						toolPotencyById={toolPotencyById}
						updateToolSelectionsError={updateToolSelectionsMutation.error}
						updateToolSelectionsPending={updateToolSelectionsMutation.isPending}
					/>
					<Separator />
					<PermissionsSection
						grantedPermissions={grantedPermissions}
						onRevokeGrantedPermission={handleRevokePermission}
						requestedPermissions={requestedPermissions}
						revokePermissionError={revokePermissionMutation.error}
						revokingPermissionId={revokingPermissionId}
					/>
				</TabsPanel>

				<TabsPanel className="grid gap-8" value="runtime">
					<RuntimeSection
						modelReadiness={modelReadiness}
						runtimePolicy={runtimePolicy}
						runtimeReadiness={runtimeReadiness}
					/>
					<Separator />
					<SubmitTurnSection
						isArchived={isArchived}
						isDraft={isDraft}
						modelReady={modelReadiness.status === "ready"}
						thinkspaceId={thinkspaceId}
					/>
				</TabsPanel>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute("/thinkspaces/$thinkspaceId")({
	beforeLoad: async ({ location }) => {
		const session = await getUser();
		if (!session) {
			throw redirect({
				search: { redirect: location.href },
				to: "/login",
			});
		}
		return { session };
	},
	component: RouteComponent,
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.get.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.runtimeReadiness.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.modelReadiness.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
			context.queryClient.ensureQueryData(
				context.orpc.thinkspaces.runtimePolicy.queryOptions({
					input: { thinkspaceId: params.thinkspaceId },
				}),
			),
		]);
	},
});
