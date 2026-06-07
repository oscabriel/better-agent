import { Badge } from "@better-agent/ui/components/badge";
import { Button } from "@better-agent/ui/components/button";
import { Input } from "@better-agent/ui/components/input";
import { Label } from "@better-agent/ui/components/label";
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

const RouteComponent = () => {
	const context = routeApi.useRouteContext();
	const queryClient = useQueryClient();
	const catalogQuery = useSuspenseQuery(context.orpc.models.listAvailable.queryOptions());
	const credentialsQuery = useSuspenseQuery(context.orpc.models.listCredentials.queryOptions());
	const [providerId, setProviderId] = useState<keyof typeof PROVIDER_LABELS>("openai");
	const [credential, setCredential] = useState("");
	const [label, setLabel] = useState("");
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

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (credential.trim().length < 8 || saveCredential.isPending) {
			return;
		}
		saveCredential.mutate({ credential, label: label.trim() || undefined, providerId });
	};

	return (
		<div className="grid gap-6">
			<div className="grid gap-1">
				<h2 className="text-xl font-semibold tracking-tight">Product settings</h2>
				<p className="text-muted-foreground text-sm leading-6">
					Configure product-level defaults and Connected Accounts. These choices prepare Better
					Agent, but a Thinkspace Agent still needs scoped Permissions before it can use a resource.
				</p>
			</div>

			<section className="grid gap-3" aria-labelledby="model-catalog-heading">
				<div className="grid gap-1">
					<h3 id="model-catalog-heading" className="font-medium">
						Model catalog
					</h3>
					<p className="text-muted-foreground text-sm leading-6">
						Public model metadata is visible here. BYOK credentials make models available to your
						account, but do not grant access to any Thinkspace by themselves.
					</p>
				</div>
				<div className="grid gap-2">
					{catalogQuery.data.map((model) => (
						<div
							key={model.id}
							className="grid gap-2 border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-start"
						>
							<div className="grid gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-medium">{model.name}</p>
									<Badge variant="outline">{model.providerName}</Badge>
									<Badge variant={model.availableForAccount ? "default" : "outline"}>
										{model.access === "app_provided" ? "App-provided" : "BYOK"}
									</Badge>
									{model.requiresThinkspacePermission ? (
										<Badge variant="outline">Needs Thinkspace Permission</Badge>
									) : null}
								</div>
								<p className="text-muted-foreground text-sm">{model.description}</p>
								<p className="text-muted-foreground text-xs">
									{model.id} · {model.contextWindow.toLocaleString()} context · reasoning:{" "}
									{model.reasoning}
								</p>
							</div>
							<span className="text-muted-foreground text-xs">
								{model.availableForAccount ? "Available" : "Add credential"}
							</span>
						</div>
					))}
				</div>
			</section>

			<Separator />

			<section className="grid gap-3" aria-labelledby="provider-credentials-heading">
				<div className="grid gap-1">
					<h3 id="provider-credentials-heading" className="font-medium">
						Provider credentials
					</h3>
					<p className="text-muted-foreground text-sm leading-6">
						Credentials are encrypted when saved and only redacted status is returned after save.
					</p>
				</div>
				<form className="grid gap-3 border border-border p-4" onSubmit={handleSubmit}>
					<div className="grid gap-1.5">
						<Label htmlFor="provider">Provider</Label>
						<select
							id="provider"
							className="border border-input bg-background px-2.5 py-2 text-sm"
							value={providerId}
							onChange={(event) =>
								setProviderId(event.target.value as keyof typeof PROVIDER_LABELS)
							}
						>
							{Object.entries(PROVIDER_LABELS).map(([id, name]) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
						</select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="credential-label">Label</Label>
						<Input
							id="credential-label"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="Optional label"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="credential">API key</Label>
						<Input
							id="credential"
							type="password"
							value={credential}
							onChange={(event) => setCredential(event.target.value)}
							placeholder="Paste provider API key"
						/>
					</div>
					{saveCredential.error ? (
						<p className="text-destructive text-xs" role="alert">
							{saveCredential.error.message}
						</p>
					) : null}
					<Button
						className="w-fit"
						type="submit"
						disabled={credential.trim().length < 8 || saveCredential.isPending}
					>
						{saveCredential.isPending ? "Saving…" : "Save encrypted credential"}
					</Button>
				</form>
				<div className="grid gap-2">
					{credentialsQuery.data.length === 0 ? (
						<p className="text-muted-foreground text-sm">No provider credentials saved.</p>
					) : null}
					{credentialsQuery.data.map((entry) => (
						<div
							key={entry.id}
							className="flex flex-col gap-1 border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
						>
							<span>
								{PROVIDER_LABELS[entry.providerId as keyof typeof PROVIDER_LABELS]}{" "}
								{entry.label ? `· ${entry.label}` : ""}
							</span>
							<span className="text-muted-foreground">
								{entry.redactedCredential} · Permission still scoped per Thinkspace
							</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
};

export const Route = createFileRoute("/settings/product")({
	component: RouteComponent,
});
