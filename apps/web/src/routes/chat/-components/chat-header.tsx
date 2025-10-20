import { Trash2 } from "lucide-react";
import { Button } from "@/web/components/ui/button";

interface ChatHeaderProps {
	title: string;
	onDelete: () => void;
	isDeleting: boolean;
}

export function ChatHeader({ title, onDelete, isDeleting }: ChatHeaderProps) {
	return (
		<div className="flex-shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
			<div className="flex items-center justify-between">
				<div className="flex-1 truncate">
					<h1 className="font-semibold text-lg">{title}</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={onDelete}
						disabled={isDeleting}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
