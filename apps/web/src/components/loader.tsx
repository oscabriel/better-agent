import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<div className="flex h-full items-center justify-center py-12">
			<Loader2 className="size-5 animate-spin text-muted-foreground" />
		</div>
	);
}
