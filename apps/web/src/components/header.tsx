import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
	const links = [
		{ label: "Thinkspaces", to: "/thinkspaces" },
		{ label: "Settings", to: "/settings" },
	] as const;

	return (
		<header className="border-b border-border bg-background">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
				<div className="flex items-center gap-6">
					<Link className="text-sm font-semibold tracking-tight" to="/">
						Better Agent
					</Link>
					<nav aria-label="Primary" className="flex gap-1">
						{links.map(({ to, label }) => (
							<Link
								activeProps={{ className: "bg-muted text-foreground" }}
								className="px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
								key={to}
								to={to}
							>
								{label}
							</Link>
						))}
					</nav>
				</div>
				<UserMenu />
			</div>
		</header>
	);
}
