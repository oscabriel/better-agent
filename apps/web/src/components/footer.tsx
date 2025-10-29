import { Link } from "@tanstack/react-router";
import { PORTFOLIO_SITE, SITE_GITHUB } from "@/web/lib/constants";

export function Footer() {
	return (
		<footer className="border-border/40 border-t bg-background/80 backdrop-blur-sm">
			<div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
					{/* Logo Section */}
					<div className="lg:col-span-2">
						<div className="space-y-4">
							<h2 className="font-bold text-2xl sm:text-3xl">
								<div className="flex gap-2">
									<span>Better</span>
									<span className="text-orange-500 italic">Chat</span>
								</div>
							</h2>
							<p className="max-w-xs text-muted-foreground text-sm">
								Through Durable Objects
							</p>
						</div>
					</div>

					{/* Links Grid */}
					<div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
						{/* Product */}
						<div>
							<h3 className="font-semibold text-sm">Product</h3>
							<ul className="mt-4 space-y-3">
								<li>
									<Link
										to="/chat"
										className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										Get Started
									</Link>
								</li>
								<li>
									<Link
										to="/docs"
										className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										Docs
									</Link>
								</li>
							</ul>
						</div>

						{/* Resources */}
						<div>
							<h3 className="font-semibold text-sm">Resources</h3>
							<ul className="mt-4 space-y-3">
								<li>
									<a
										href={SITE_GITHUB}
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										GitHub
									</a>
								</li>
								<li>
									<Link
										to="/privacy"
										className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										Privacy
									</Link>
								</li>
							</ul>
						</div>

						{/* Connect */}
						<div>
							<h3 className="font-semibold text-sm">Connect</h3>
							<ul className="mt-4 space-y-3">
								<li>
									<a
										href={PORTFOLIO_SITE}
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										Portfolio
									</a>
								</li>
							</ul>
						</div>
					</div>
				</div>

				{/* Bottom Bar */}
				<div className="mt-12 border-border/40 border-t pt-8">
					<p className="text-muted-foreground text-sm">© 2025 Oscar Gabriel</p>
				</div>
			</div>
		</footer>
	);
}
