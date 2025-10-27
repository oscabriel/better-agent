import { useNavigate } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { Card, CardContent } from "@/web/components/ui/card";

export function NotFound() {
	const navigate = useNavigate();

	return (
		<div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardContent className="flex flex-col items-center space-y-6 pt-6">
					<div className="flex size-16 items-center justify-center">
						<span className="font-bold text-8xl">404</span>
					</div>

					<div className="space-y-2 text-center">
						<h1 className="font-bold text-2xl tracking-tight">
							Page Not Found
						</h1>
						<p className="text-muted-foreground text-sm">
							The page you are looking for does not exist.
						</p>
					</div>

					<Button
						onClick={() => navigate({ to: "/", replace: true })}
						className="w-full"
					>
						<Home className="mr-2 size-4" />
						Go Back Home
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
