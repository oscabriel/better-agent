import { Loader2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/web/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Label } from "@/web/components/ui/label";

interface Provider {
	id: string;
	name: string;
	description: string;
	appProvided: boolean;
}

interface ApiKeyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	provider: Provider | null;
	apiKeyInput: string;
	onApiKeyChange: (value: string) => void;
	onSave: () => void;
	isSaving: boolean;
}

export function ApiKeyDialog({
	open,
	onOpenChange,
	provider,
	apiKeyInput,
	onApiKeyChange,
	onSave,
	isSaving,
}: ApiKeyDialogProps) {
	const id = useId();

	const getPlaceholder = (providerId: string | undefined) => {
		switch (providerId) {
			case "openai":
				return "sk-...";
			case "anthropic":
				return "sk-ant-...";
			case "google":
				return "AI...";
			default:
				return "Enter your API key";
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add API Key for {provider?.name}</DialogTitle>
					<DialogDescription>
						Enter your {provider?.name} API key to unlock premium models. Your
						key is stored securely and only used for your requests.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor={id}>API Key</Label>
						<Input
							id={id}
							type="password"
							value={apiKeyInput}
							onChange={(e) => onApiKeyChange(e.target.value)}
							placeholder={getPlaceholder(provider?.id)}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={onSave} disabled={isSaving}>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save API Key"
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
