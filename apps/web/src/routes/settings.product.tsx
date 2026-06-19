import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
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
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

const routeApi = getRouteApi("/settings/product");

const PROVIDER_LABELS = {
	anthropic: "Anthropic",
	google: "Google",
	openai: "OpenAI",
} as const;

const REASONING_EFFORTS = ["low", "medium", "high"] as const;

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const catalogQuery = useSuspenseQuery(context.orpc.models.listAvailable.queryOptions());
	const credentialsQuery = useSuspenseQuery(context.orpc.models.listCredentials.queryOptions());
	const defaultsQuery = useSuspenseQuery(context.orpc.models.getDefaults.queryOptions());
	const connectedAccountsQuery = useSuspenseQuery(
		context.orpc.connectedAccounts.list.queryOptions(),
	);
	const [defaultModel, setDefaultModel] = useState(defaultsQuery.data.defaultModel);
	const [defaultReasoningEffort, setDefaultReasoningEffort] = useState(
		defaultsQuery.data.reasoningEffort,
	);
	const [providerId, setProviderId] = useState<keyof typeof PROVIDER_LABELS>("openai");
	const [credential, setCredential] = useState("");
	const [label, setLabel] = useState("");
	const [githubToken, setGithubToken] = useState("");
	const saveDefaults = useMutation(
		context.orpc.models.updateDefaults.mutationOptions({
			onSuccess: async (settings) => {
				setDefaultModel(settings.defaultModel);
				setDefaultReasoningEffort(settings.reasoningEffort);
				await queryClient.invalidateQueries({
					queryKey: context.orpc.models.getDefaults.queryKey(),
				});
			},
		}),
	);
	const saveCredential = useMutation(
		context.orpc.models.saveCredential.mutationOptions({
			onSuccess: async () => {
				setCredential("");
				setLabel("");
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: context.orpc.models.listAvailable.queryKey() }),
					queryClient.invalidateQueries({
						queryKey: context.orpc.models.listCredentials.queryKey(),
					}),
				]);
			},
		}),
	);
	const connectGithub = useMutation(
		context.orpc.connectedAccounts.connect.mutationOptions({
			onSuccess: async () => {
				setGithubToken("");
				await queryClient.invalidateQueries({
					queryKey: context.orpc.connectedAccounts.list.queryKey(),
				});
			},
		}),
	);
	const disconnectGithub = useMutation(
		context.orpc.connectedAccounts.disconnect.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: context.orpc.connectedAccounts.list.queryKey(),
				});
			},
		}),
	);

	// Base UI Select reads `items` to show the selected label in the trigger.
	const modelItems = catalogQuery.data.map((model) => ({
		label: `${model.name} · ${model.providerName}`,
		value: model.id,
	}));
	const reasoningItems = REASONING_EFFORTS.map((effort) => ({ label: effort, value: effort }));
	const providerItems = Object.entries(PROVIDER_LABELS).map(([value, providerName]) => ({
		label: providerName,
		value,
	}));

	const defaultsChanged =
		defaultModel !== defaultsQuery.data.defaultModel ||
		defaultReasoningEffort !== defaultsQuery.data.reasoningEffort;

	const handleDefaultsSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!(defaultModel && defaultsChanged) || saveDefaults.isPending) {
			return;
		}
		saveDefaults.mutate({ defaultModel, reasoningEffort: defaultReasoningEffort });
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (credential.trim().length < 8 || saveCredential.isPending) {
			return;
		}
		saveCredential.mutate({ credential, label: label.trim() || undefined, providerId });
	};

	const handleGithubSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (githubToken.trim().length < 20 || connectGithub.isPending) {
			return;
		}
		connectGithub.mutate({ token: githubToken.trim() });
	};

	return (
		<div className="grid gap-8">
			<div className="grid gap-2">
				<h2 className="text-xl font-semibold tracking-tight">Product</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Model credentials and product-level defaults. Thinkspace Agents need scoped Permissions
					before using any resource configured here.
				</p>
			</div>

			<section aria-labelledby="model-defaults-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h3 className="text-sm font-medium" id="model-defaults-heading">
						Default Agent Profile model behavior
					</h3>
					<p className="text-muted-foreground text-sm">
						These defaults seed newly created Agent Profile drafts. Existing Thinkspaces keep
						running under their active revision.
					</p>
				</div>
				<form
					className="grid max-w-xl gap-4 rounded-lg p-4 ring-1 ring-foreground/10"
					onSubmit={handleDefaultsSubmit}
				>
					<div className="grid gap-1.5">
						<Label htmlFor="default-model">Default model</Label>
						<Select
							items={modelItems}
							onValueChange={(value) => setDefaultModel(value as string)}
							value={defaultModel}
						>
							<SelectTrigger className="w-full" id="default-model">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{catalogQuery.data.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.name} · {model.providerName} · {model.id}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="default-reasoning-effort">Reasoning effort</Label>
						<Select
							items={reasoningItems}
							onValueChange={(value) =>
								setDefaultReasoningEffort(value as (typeof REASONING_EFFORTS)[number])
							}
							value={defaultReasoningEffort}
						>
							<SelectTrigger className="w-full capitalize" id="default-reasoning-effort">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{REASONING_EFFORTS.map((effort) => (
									<SelectItem className="capitalize" key={effort} value={effort}>
										{effort}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{saveDefaults.error ? (
						<p className="text-destructive text-sm" role="alert">
							{saveDefaults.error.message}
						</p>
					) : null}
					<Button
						className="w-fit"
						disabled={!defaultsChanged || saveDefaults.isPending}
						type="submit"
					>
						{saveDefaults.isPending ? "Saving…" : "Save defaults"}
					</Button>
				</form>
			</section>

			<Separator />

			<section aria-labelledby="model-catalog-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h3 className="text-sm font-medium" id="model-catalog-heading">
						Model catalog
					</h3>
					<p className="text-muted-foreground text-sm">
						Available models and their access status for your account.
					</p>
				</div>
				<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
					{catalogQuery.data.map((model, index) => (
						<div
							key={model.id}
							className={`grid gap-1 p-4 ${index < catalogQuery.data.length - 1 ? "border-b border-border" : ""}`}
						>
							<div className="flex flex-wrap items-center gap-2">
								<p className="text-sm font-medium">{model.name}</p>
								<Badge variant="outline">{model.providerName}</Badge>
								{model.availableForAccount ? (
									<Badge>Available</Badge>
								) : (
									<Badge variant="outline">Add credential</Badge>
								)}
							</div>
							<p className="text-muted-foreground text-sm">{model.description}</p>
							<p className="text-muted-foreground text-xs">
								{model.id} · {model.contextWindow.toLocaleString()} tokens · reasoning:{" "}
								{model.reasoning}
							</p>
						</div>
					))}
				</div>
			</section>

			<Separator />

			<section aria-labelledby="provider-credentials-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h3 className="text-sm font-medium" id="provider-credentials-heading">
						Provider credentials
					</h3>
					<p className="text-muted-foreground text-sm">
						API keys are encrypted at rest. Only a redacted preview is shown after saving.
					</p>
				</div>
				<form
					className="grid max-w-md gap-4 rounded-lg p-4 ring-1 ring-foreground/10"
					onSubmit={handleSubmit}
				>
					<div className="grid gap-1.5">
						<Label htmlFor="provider">Provider</Label>
						<Select
							items={providerItems}
							onValueChange={(value) => setProviderId(value as keyof typeof PROVIDER_LABELS)}
							value={providerId}
						>
							<SelectTrigger className="w-full" id="provider">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(PROVIDER_LABELS).map(([id, name]) => (
									<SelectItem key={id} value={id}>
										{name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="credential-label">Label</Label>
						<Input
							id="credential-label"
							onChange={(event) => setLabel(event.target.value)}
							placeholder="Optional label"
							value={label}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="credential">API key</Label>
						<Input
							id="credential"
							onChange={(event) => setCredential(event.target.value)}
							placeholder="Paste provider API key"
							type="password"
							value={credential}
						/>
					</div>
					{saveCredential.error ? (
						<p className="text-destructive text-sm" role="alert">
							{saveCredential.error.message}
						</p>
					) : null}
					<Button
						className="w-fit"
						disabled={credential.trim().length < 8 || saveCredential.isPending}
						type="submit"
					>
						{saveCredential.isPending ? "Saving…" : "Save credential"}
					</Button>
				</form>
				{credentialsQuery.data.length > 0 ? (
					<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
						{credentialsQuery.data.map((entry, index) => (
							<div
								key={entry.id}
								className={`flex items-center justify-between gap-4 p-4 text-sm ${index < credentialsQuery.data.length - 1 ? "border-b border-border" : ""}`}
							>
								<span className="font-medium">
									{PROVIDER_LABELS[entry.providerId as keyof typeof PROVIDER_LABELS]}
									{entry.label ? ` · ${entry.label}` : ""}
								</span>
								<span className="text-muted-foreground text-xs">{entry.redactedCredential}</span>
							</div>
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">No credentials saved.</p>
				)}
			</section>

			<Separator />

			<section aria-labelledby="connected-accounts-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h3 className="text-sm font-medium" id="connected-accounts-heading">
						Connected Accounts
					</h3>
					<p className="text-muted-foreground text-sm">
						Connect a GitHub account with a fine-grained personal access token. The token is
						validated with GitHub, encrypted at rest, and used only after you approve a specific
						action.
					</p>
				</div>
				<form
					className="grid max-w-md gap-4 rounded-lg p-4 ring-1 ring-foreground/10"
					onSubmit={handleGithubSubmit}
				>
					<div className="grid gap-1.5">
						<Label htmlFor="github-token">GitHub personal access token</Label>
						<Input
							autoComplete="off"
							id="github-token"
							onChange={(event) => setGithubToken(event.target.value)}
							placeholder="github_pat_…"
							type="password"
							value={githubToken}
						/>
					</div>
					{connectGithub.error ? (
						<p className="text-destructive text-sm" role="alert">
							{connectGithub.error.message}
						</p>
					) : null}
					<Button
						className="w-fit"
						disabled={githubToken.trim().length < 20 || connectGithub.isPending}
						type="submit"
					>
						{connectGithub.isPending ? "Connecting…" : "Connect GitHub"}
					</Button>
				</form>
				{connectedAccountsQuery.data.length > 0 ? (
					<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
						{connectedAccountsQuery.data.map((account, index) => (
							<div
								className={`flex items-center justify-between gap-4 p-4 text-sm ${index < connectedAccountsQuery.data.length - 1 ? "border-b border-border" : ""}`}
								key={account.id}
							>
								<div className="grid gap-1">
									<span className="font-medium">GitHub</span>
									<span className="text-muted-foreground text-xs">
										{account.externalAccountId
											? `Connected as @${account.externalAccountId}`
											: "Connected"}
									</span>
								</div>
								<Button
									disabled={disconnectGithub.isPending}
									onClick={() => disconnectGithub.mutate({ accountId: account.id })}
									size="sm"
									type="button"
									variant="outline"
								>
									{disconnectGithub.isPending ? "Disconnecting…" : "Disconnect"}
								</Button>
							</div>
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">No connected accounts.</p>
				)}
				{disconnectGithub.error ? (
					<p className="text-destructive text-sm" role="alert">
						{disconnectGithub.error.message}
					</p>
				) : null}
			</section>
		</div>
	);
};

export const Route = createFileRoute("/settings/product")({
	component: RouteComponent,
});
