import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/web/components/ui/select";
import { Textarea } from "@/web/components/ui/textarea";

interface NewServer {
	name: string;
	url: string;
	type: "http" | "sse";
	description: string;
	headers: Record<string, string>;
}

interface AddMcpServerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	newServer: NewServer;
	onServerChange: (server: NewServer) => void;
	headerKey: string;
	headerValue: string;
	onHeaderKeyChange: (value: string) => void;
	onHeaderValueChange: (value: string) => void;
	onAddHeader: () => void;
	onRemoveHeader: (key: string) => void;
	onAdd: () => void;
	isAdding: boolean;
}

export function AddMcpServerDialog({
	open,
	onOpenChange,
	newServer,
	onServerChange,
	headerKey,
	headerValue,
	onHeaderKeyChange,
	onHeaderValueChange,
	onAddHeader,
	onRemoveHeader,
	onAdd,
	isAdding,
}: AddMcpServerDialogProps) {
	const id = useId();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Custom MCP Server</DialogTitle>
					<DialogDescription>
						Add a new MCP server to extend AI capabilities
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor={`${id}-name`}>Name</Label>
						<Input
							id={`${id}-name`}
							value={newServer.name}
							onChange={(e) =>
								onServerChange({ ...newServer, name: e.target.value })
							}
							placeholder="Custom Documentation Server"
						/>
					</div>

					<div>
						<Label htmlFor={`${id}-url`}>Server URL*</Label>
						<Input
							id={`${id}-url`}
							value={newServer.url}
							onChange={(e) =>
								onServerChange({ ...newServer, url: e.target.value })
							}
							placeholder="https://api.example.com/mcp"
						/>
					</div>

					<div>
						<Label htmlFor={`${id}-type`}>Transport Type*</Label>
						<Select
							value={newServer.type}
							onValueChange={(value: "http" | "sse") =>
								onServerChange({ ...newServer, type: value })
							}
						>
							<SelectTrigger id={`${id}-type`}>
								<SelectValue placeholder="Select transport type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="http">HTTP (Recommended)</SelectItem>
								<SelectItem value="sse">Server-Sent Events (SSE)</SelectItem>
							</SelectContent>
						</Select>
						<p className="mt-2 text-muted-foreground text-xs">
							Use HTTP for production deployments. SSE remains available for
							servers that only expose streaming endpoints.
						</p>
					</div>

					<div>
						<Label htmlFor={`${id}-description`}>Description (Optional)</Label>
						<Textarea
							id={`${id}-description`}
							value={newServer.description}
							onChange={(e) =>
								onServerChange({ ...newServer, description: e.target.value })
							}
							placeholder="What does this server provide?"
							rows={3}
						/>
					</div>

					<div>
						<Label>Headers (Optional)</Label>
						<div className="space-y-2">
							<div className="flex gap-2">
								<Input
									placeholder="Header name (e.g., x-api-key)"
									value={headerKey}
									onChange={(e) => onHeaderKeyChange(e.target.value)}
									className="flex-1"
								/>
								<Input
									placeholder="Header value"
									value={headerValue}
									onChange={(e) => onHeaderValueChange(e.target.value)}
									className="flex-1"
								/>
								<Button
									variant="outline"
									onClick={onAddHeader}
									disabled={!headerKey || !headerValue}
								>
									<Plus className="size-4" />
								</Button>
							</div>
							{Object.entries(newServer.headers || {}).length > 0 && (
								<div className="space-y-1 rounded border p-2">
									{Object.entries(newServer.headers || {}).map(
										([key, value]) => (
											<div
												key={key}
												className="flex items-center justify-between rounded bg-muted px-2 py-1 text-sm"
											>
												<span className="font-mono">
													{key}: {value}
												</span>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => onRemoveHeader(key)}
													className="size-6 p-0"
												>
													<Trash2 className="size-3" />
												</Button>
											</div>
										),
									)}
								</div>
							)}
						</div>
					</div>

					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={onAdd}
							disabled={isAdding || !newServer.name || !newServer.url}
						>
							{isAdding ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Adding...
								</>
							) : (
								"Add Server"
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
