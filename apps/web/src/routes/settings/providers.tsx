import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";
import { orpc } from "@/web/lib/orpc";
import { ApiKeyDialog } from "./-components/providers/api-key-dialog";
import { ProviderRow } from "./-components/providers/provider-row";

interface Provider {
	id: string;
	name: string;
	description: string;
	appProvided: boolean;
}

const SUPPORTED_PROVIDERS: Provider[] = [
	{
		id: "openai",
		name: "OpenAI",
		description: "GPT-4o, GPT-4.1, o3 models",
		appProvided: true,
	},
	{
		id: "google",
		name: "Google",
		description: "Gemini 2.5 Flash, Pro",
		appProvided: true,
	},
	{
		id: "anthropic",
		name: "Anthropic",
		description: "Claude Opus, Sonnet, Haiku",
		appProvided: false,
	},
];

export const Route = createFileRoute("/settings/providers")({
	component: ProviderSettings,
});

function ProviderSettings() {
	const queryClient = useQueryClient();
	const updateUserSettings = useUpdateUserSettings();
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
		null,
	);
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [isSavingApiKey, setIsSavingApiKey] = useState(false);

	const settingsQuery = useUserSettings();

	const handleSaveApiKey = async () => {
		if (!selectedProvider || !apiKeyInput.trim()) {
			toast.error("Please enter a valid API key");
			return;
		}
		const currentKeys = settingsQuery.data?.apiKeys || {};
		const newKeys = {
			...currentKeys,
			[selectedProvider.id]: apiKeyInput.trim(),
		};
		try {
			setIsSavingApiKey(true);
			await updateUserSettings({ apiKeys: newKeys });
			queryClient.invalidateQueries({
				queryKey: orpc.models.listAvailable.key(),
			});
			toast.success("API key saved successfully");
			setShowApiKeyDialog(false);
			setApiKeyInput("");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save API key";
			toast.error(message);
		} finally {
			setIsSavingApiKey(false);
		}
	};

	const openApiKeyDialog = (provider: Provider) => {
		setSelectedProvider(provider);
		setApiKeyInput("");
		setShowApiKeyDialog(true);
	};

	const userApiKeys = settingsQuery.data?.apiKeys || {};

	if (settingsQuery.isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const appProvidedProviders = SUPPORTED_PROVIDERS.filter((p) => p.appProvided);
	const byokOnlyProviders = SUPPORTED_PROVIDERS.filter((p) => !p.appProvided);

	return (
		<div className="space-y-6">
			{/* App-Provided Providers (with basic free models) */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<CardTitle>Core Providers</CardTitle>
					</div>
					<CardDescription>
						These providers include free models. Premium models are BYOK.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{appProvidedProviders.map((provider) => {
						const hasUserKey = Boolean(userApiKeys[provider.id]);
						return (
							<ProviderRow
								key={provider.id}
								provider={provider}
								hasUserKey={hasUserKey}
								onAddKey={openApiKeyDialog}
							/>
						);
					})}
				</CardContent>
			</Card>

			{/* BYOK Only Providers */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<CardTitle>BYOK Providers</CardTitle>
					</div>
					<CardDescription>
						These providers require your own API key to access any models.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{byokOnlyProviders.map((provider) => {
						const hasUserKey = Boolean(userApiKeys[provider.id]);
						return (
							<ProviderRow
								key={provider.id}
								provider={provider}
								hasUserKey={hasUserKey}
								onAddKey={openApiKeyDialog}
							/>
						);
					})}
				</CardContent>
			</Card>

			<ApiKeyDialog
				open={showApiKeyDialog}
				onOpenChange={setShowApiKeyDialog}
				provider={selectedProvider}
				apiKeyInput={apiKeyInput}
				onApiKeyChange={setApiKeyInput}
				onSave={handleSaveApiKey}
				isSaving={isSavingApiKey}
			/>
		</div>
	);
}
