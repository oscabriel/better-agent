import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TECH_STACK_SECTIONS } from "@/web/lib/constants";

const subtleLinkClass =
	"relative inline-block text-current no-underline after:absolute after:left-0 after:bottom-0 after:h-px after:w-0 after:bg-current after:transition-[width] after:duration-200 after:ease-out after:content-[''] hover:after:w-full focus-visible:after:w-full focus-visible:outline-none";

type TechLinkProps = {
	href: string;
	children: ReactNode;
};

function TechLink({ href, children }: TechLinkProps) {
	return (
		<a href={href} className={subtleLinkClass} target="_blank" rel="noreferrer">
			{children}
		</a>
	);
}

export const Route = createFileRoute("/docs")({
	component: DocsRoute,
});

function DocsRoute() {
	return (
		<div className="min-h-screen">
			<div className="mx-auto max-w-4xl px-8 py-32">
				<header className="mb-24">
					<h1 className="font-normal text-xl uppercase tracking-wide">
						BETTER CHAT
					</h1>
					<p className="mt-1 text-sm italic opacity-80">
						THROUGH DURABLE OBJECTS
					</p>
				</header>

				<div className="space-y-12 text-base leading-snug">
					<section>
						<p className="mb-6">
							Better Chat is a new but familiar AI chat app built specifically
							for chatting with technical documentation. We provide one-click
							access to several docs MCP servers from major platforms, with
							multi-model support, reasoning output, and per-user data isolation
							using Cloudflare Durable Objects.
						</p>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							Technical Documentation via MCP Servers
						</h2>
						<div className="space-y-4 opacity-90">
							<p>
								The primary purpose of Better Chat is to enable seamless
								conversations with technical documentation. We've optimized our
								system prompt specifically for this task, providing easy, quick
								access to up-to-date documentation from leading platforms.
							</p>
							<div>
								<p className="mb-2">
									Built-in Documentation Servers (One-Click Setup):
								</p>
								<ul className="ml-4 space-y-1">
									<li>→ Context7</li>
									<li>→ Cloudflare Docs</li>
									<li>→ Microsoft Learn</li>
									<li>→ AWS Knowledge</li>
									<li>→ Better Auth</li>
									<li>→ Custom MCP server support</li>
								</ul>
							</div>
							<p>
								Each MCP server can be enabled or disabled with a single click,
								and their tools are automatically exposed to AI models during
								conversations. Visual tool call rendering shows exactly what
								documentation is being accessed in real-time.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Multi-Model Support</h2>
						<div className="space-y-4 opacity-90">
							<p>
								Free Models: GPT-4o mini, GPT-4.1 mini/nano, Gemini 2.5 Flash
								Lite
							</p>
							<div>
								<p className="mb-2">BYOK (Bring Your Own Key) Models:</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ OpenAI: GPT-4o, GPT-4.1, GPT-5, o3/o4-mini, o3, o3-pro
									</li>
									<li>
										→ Anthropic: Claude Opus 4, Sonnet 4.5/4/3.7, Haiku 3.5
									</li>
									<li>→ Google: Gemini 2.5 Flash/Pro</li>
								</ul>
							</div>
							<p>
								Advanced AI Capabilities: Streaming responses, extended
								thinking/reasoning mode, tool calling, and more coming soon
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Architecture</h2>
						<div className="space-y-4 opacity-90">
							<div>
								<p className="mb-2">Dual-Database Design:</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ D1 (SQLite): Centralized data (auth, settings, usage)
									</li>
									<li>
										→ Durable Objects: Per-user isolated storage (conversations,
										messages)
									</li>
								</ul>
							</div>
							<p>Cloudflare Workers: Edge-native serverless runtime</p>
							<p>Better Auth: Email OTP and social OAuth (Google, GitHub)</p>
							<p>KV Sessions: Distributed session cache with rate limiting</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">User Features</h2>
						<ul className="space-y-2 opacity-90">
							<li>
								→ Chat Management: Create, view, and manage conversations with
								quick access via your own DO instance
							</li>
							<li>
								→ API Key Management: Securely store encrypted API keys for BYOK
								AI models
							</li>
							<li>
								→ Usage Tracking: Monitor token usage and daily/monthly limits
								across models
							</li>
							<li>
								→ Customizable Settings: Configure providers, models, and MCP
								servers
							</li>
							<li>
								→ Profile Management: Account settings, session management, and
								account deletion
							</li>
						</ul>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Tech Stack</h2>
						<div className="space-y-6 opacity-90">
							{TECH_STACK_SECTIONS.map((section) => (
								<div key={section.title}>
									<p className="mb-2 font-normal">{section.title}</p>
									<ul className="ml-4 space-y-1">
										{section.items.map((item) => (
											<li key={`${section.title}-${item.name}`}>
												→ <TechLink href={item.href}>{item.name}</TechLink>
												{item.suffix ? <span>{item.suffix}</span> : null}
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
