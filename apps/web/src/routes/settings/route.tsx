import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShellSkeleton } from "@/web/components/skeletons/app-skeleton";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/web/components/ui/sheet";
import { useIsMobile } from "@/web/hooks/use-mobile";
import { useUserSettings } from "@/web/hooks/use-user-settings";
import { SETTINGS_NAV_ITEMS } from "@/web/lib/constants";
import { requireAuthenticated } from "@/web/lib/route-guards";
import { cn } from "@/web/utils/cn";
import { SettingsError } from "./-components/settings-error";

export const Route = createFileRoute("/settings")({
	beforeLoad: (opts) => {
		requireAuthenticated({
			auth: opts.context.auth,
			location: opts.location,
		});
	},
	errorComponent: SettingsError,
	component: SettingsLayout,
	pendingComponent: AppShellSkeleton,
});

function SettingsLayout() {
	const navigate = useNavigate();
	const location = useRouterState({ select: (state) => state.location });
	const isMobile = useIsMobile();
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	const activePath = location.pathname ?? "";

	// Use shared settings hook
	const settingsQuery = useUserSettings();

	const navigationItems = useMemo(() => {
		return SETTINGS_NAV_ITEMS.map((item) => {
			const isActive =
				activePath === item.to || activePath.startsWith(`${item.to}/`);
			return { ...item, isActive };
		});
	}, [activePath]);

	useEffect(() => {
		const pathname = location.pathname ?? "";
		if (pathname === "/settings" || pathname === "/settings/") {
			void navigate({ to: "/settings/profile", replace: true });
		}
	}, [location.pathname, navigate]);

	useEffect(() => {
		const handler = () => setMobileSidebarOpen(true);
		window.addEventListener(
			"better-chat:open-settings",
			handler as EventListener,
		);
		return () =>
			window.removeEventListener(
				"better-chat:open-settings",
				handler as EventListener,
			);
	}, []);

	useEffect(() => {
		if (!isMobile) {
			setMobileSidebarOpen(false);
		}
	}, [isMobile]);

	const renderNavigation = (onNavigate?: () => void) => (
		<div className="space-y-2">
			{navigationItems.map((item) => (
				<Link
					key={item.to}
					to={item.to}
					className={cn(
						"block border px-3 py-3 transition",
						item.isActive
							? "border-primary bg-primary/10 text-primary"
							: "border-transparent bg-muted/40 text-foreground hover:border-muted hover:bg-muted",
					)}
					preload="intent"
					onClick={() => onNavigate?.()}
				>
					<div className="font-semibold text-sm">{item.label}</div>
					<p className="text-muted-foreground text-xs">{item.description}</p>
				</Link>
			))}
		</div>
	);

	return (
		<div className="max-w-[100vw] overflow-x-hidden px-2 pt-20 sm:px-4">
			{isMobile && (
				<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
					<SheetContent
						side="left"
						className="w-[min(90vw,18rem)] border-r-0 p-0 sm:max-w-xs"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Settings</SheetTitle>
							<SheetDescription>
								Navigate between settings sections.
							</SheetDescription>
						</SheetHeader>
						<div className="flex h-full flex-col gap-4 overflow-hidden bg-card p-4">
							<div className="space-y-3">
								<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
									Settings
								</h2>
							</div>
							<div className="-mx-1 flex-1 overflow-y-auto px-1">
								{renderNavigation(() => setMobileSidebarOpen(false))}
							</div>
						</div>
					</SheetContent>
				</Sheet>
			)}
			<div
				className={cn(
					"mx-auto flex min-h-[calc(100svh-5rem-1.5rem)] w-full min-w-0 gap-2 px-1 sm:gap-4 sm:px-0 md:min-h-[calc(100svh-5rem-0.5rem)]",
					settingsQuery.data?.chatWidth === "comfortable"
						? "max-w-7xl"
						: "max-w-5xl",
				)}
			>
				<aside className="relative hidden w-64 shrink-0 md:block">
					<div className="sticky top-20 flex h-[calc(100svh-5rem-1.5rem)] flex-col overflow-hidden border bg-card p-3 shadow-sm sm:p-4 md:h-[calc(100svh-5rem-0.5rem)]">
						<div className="mb-4">
							<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Settings
							</h2>
						</div>
						<div className="-mx-1 flex-1 overflow-y-auto px-1">
							{renderNavigation()}
						</div>
					</div>
				</aside>
				<section className="min-w-0 flex-1 basis-0">
					<div className="sticky top-20 flex h-[calc(100svh-5rem-1.5rem)] max-w-[100vw] flex-col overflow-hidden border bg-card shadow-sm md:h-[calc(100svh-5rem-0.5rem)]">
						<div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
							<Outlet />
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
