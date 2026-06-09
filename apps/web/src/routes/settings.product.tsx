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
		<div className="grid gap-8">
			<div className="grid gap-2">
				<h2 className="text-xl font-semibold tracking-tight">Product</h2>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Model credentials and product-level defaults. Thinkspace Agents need scoped Permissions
					before using any resource configured here.
				</p>
			</div>

			<section aria-labelledby="model-catalog-heading" className="grid gap-4">
				<div className="grid gap-1">
					<h3 className="text-sm font-medium" id="model-catalog-heading">
						Model catalog
					</h3>
					<p className="text-muted-foreground text-sm">
						Available models and their access status for your account.
					</p>
				</div>
				<div className="border border-border">
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
									<Badge variant="outline">
										{model.access === "app_provided" ? "App-provided" : "Add credential"}
									</Badge>
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
				<form className="grid max-w-md gap-4 border border-border p-4" onSubmit={handleSubmit}>
					<div className="grid gap-1.5">
						<Label htmlFor="provider">Provider</Label>
						<select
							className="h-8 w-full border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
							id="provider"
							onChange={(event) =>
								setProviderId(event.target.value as keyof typeof PROVIDER_LABELS)
							}
							value={providerId}
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
					<div className="border border-border">
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
		</div>
	);
};

export const Route = createFileRoute("/settings/product")({
	component: RouteComponent,
});
