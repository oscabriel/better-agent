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

interface ExaApiKeyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	apiKey: string;
	onApiKeyChange: (value: string) => void;
	onSave: () => void;
	isSaving: boolean;
}

export function ExaApiKeyDialog({
	open,
	onOpenChange,
	apiKey,
	onApiKeyChange,
	onSave,
	isSaving,
}: ExaApiKeyDialogProps) {
	const id = useId();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add API Key for Exa</DialogTitle>
					<DialogDescription>
						Enter your Exa API key to enable web search. Get your key from{" "}
						<a
							href="https://dashboard.exa.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground"
						>
							exa.ai
						</a>
						. Your key is stored securely and only used for your requests.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor={id}>API Key</Label>
						<Input
							id={id}
							type="password"
							value={apiKey}
							onChange={(e) => onApiKeyChange(e.target.value)}
							placeholder="Enter your Exa API key"
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
