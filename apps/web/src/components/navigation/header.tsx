import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { useIsMobile } from "@/web/hooks/use-mobile";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { cn } from "@/web/utils/cn";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const CHAT_SIDEBAR_EVENT = "better-chat:open-history";
const SETTINGS_SIDEBAR_EVENT = "better-chat:open-settings";

export default function Header() {
	const location = useRouterState({ select: (state) => state.location });
	const isMobile = useIsMobile();
	const pathname = location.pathname ?? "";
	const isChatRoute = pathname.startsWith("/chat");
	const isSettingsRoute = pathname.startsWith("/settings");
	const showSidebarToggle = isMobile && (isChatRoute || isSettingsRoute);

	const settingsQuery = useUserSettings();

	const handleToggleSidebar = () => {
		if (isChatRoute) {
			window.dispatchEvent(new CustomEvent(CHAT_SIDEBAR_EVENT));
			return;
		}
		if (isSettingsRoute) {
			window.dispatchEvent(new CustomEvent(SETTINGS_SIDEBAR_EVENT));
		}
	};

	return (
		<div className="bg-background">
			<header className="fixed top-0 z-50 w-full bg-background/80 px-4 backdrop-blur-sm">
				<nav
					className={cn(
						"mx-auto flex items-center justify-between py-4",
						settingsQuery.data?.chatWidth === "comfortable"
							? "max-w-7xl"
							: "max-w-5xl",
					)}
				>
					<div className="flex items-center gap-2">
						{showSidebarToggle && (
							<Button
								variant="ghost"
								size="icon"
								onClick={handleToggleSidebar}
								className="md:hidden"
							>
								<Menu className="size-5" />
							</Button>
						)}
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold text-lg text-primary"
						>
							<span className="text-3xl">☁️</span>
						</Link>
					</div>
					<div className="flex items-center gap-2">
						<UserMenu />
						<ModeToggle />
					</div>
				</nav>
			</header>
		</div>
	);
}
