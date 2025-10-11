import type { QuickPrompt } from "@/web/types/chat";

/**
 * Application-wide constants
 */

export const SITE_NAME = "better-chat";
export const SITE_DESCRIPTION = "better chat through durable objects";
export const SITE_URL = "https://chat.oscargabriel.dev";
export const SITE_GITHUB = "https://github.com/oscargabriel/better-chat";

export const SOCIAL_PROVIDERS = {
	GOOGLE: "google",
	GITHUB: "github",
} as const;

export type SocialProvider =
	(typeof SOCIAL_PROVIDERS)[keyof typeof SOCIAL_PROVIDERS];

export const SIGN_IN_FORM = {
	OTP_LENGTH: 6,
	VALIDATION_MESSAGES: {
		EMAIL_INVALID: "Invalid email address",
		OTP_INVALID: "OTP must be at least 6 characters",
	},
	SUCCESS_MESSAGES: {
		OTP_SENT: "Verification code sent to your email",
		SIGN_IN_SUCCESS: "Sign in successful",
	},
	LOADING_MESSAGES: {
		SENDING_OTP: "Sending code...",
		VERIFYING_OTP: "Verifying...",
	},
} as const;

/**
 * Chat-related constants used across the application
 */

export const MAX_TEXT_LENGTH = 32_000;
export const MAX_MESSAGE_BATCH = 100;

export const QUICK_PROMPTS: QuickPrompt[] = [
	{
		id: "prompt-tanstack-router",
		label: "Learn TanStack Router patterns",
		text: "Using Tanstack Router, show me how to implement nested routes with loaders.",
	},
	{
		id: "prompt-alchemy",
		label: "Create resources with Alchemy",
		text: "Alchemy is an Infrastructure as Code library for Cloudflare and other cloud providers. Read the Alchemy docs for the Cloudflare provider. How do I create a Durable Object resource, and how do I bind it to a Worker resource?",
	},
	{
		id: "prompt-hono",
		label: "Build API routes with Hono",
		text: "Read the Hono docs. Build a REST API with middleware for authentication, rate limiting, and CORS handling.",
	},
	{
		id: "prompt-better-auth",
		label: "Send magic links with Better Auth",
		text: "How do I use better-auth to authenticate users with magic links?",
	},
];

export const SETTINGS_NAV_ITEMS = [
	{
		to: "/settings/profile",
		label: "Profile",
		description: "View session details",
	},
	{
		to: "/settings/usage",
		label: "Usage",
		description: "Limit & token insights",
	},
	{
		to: "/settings/providers",
		label: "Providers",
		description: "Manage provider API Keys",
	},
	{
		to: "/settings/models",
		label: "Models",
		description: "Enable preferred models",
	},
	{
		to: "/settings/tools",
		label: "Tools",
		description: "Manage tool integrations",
	},
	{
		to: "/settings/appearance",
		label: "Appearance",
		description: "Change theme & UI density",
	},
] as const;

export type TechStackItem = {
	name: string;
	href: string;
	suffix?: string;
};

export type TechStackSection = {
	title: string;
	items: TechStackItem[];
};

export const TECH_STACK_SECTIONS: TechStackSection[] = [
	{
		title: "Frontend",
		items: [
			{
				name: "Vite",
				href: "https://vite.dev/guide",
				suffix: " with React 19",
			},
			{
				name: "TanStack Router",
				href: "https://tanstack.com/router/latest/docs/framework/react/overview",
				suffix: " for file-based routing",
			},
			{
				name: "TanStack Query",
				href: "https://tanstack.com/query/latest/docs/framework/react/overview",
				suffix: " for data fetching and caching",
			},
			{
				name: "oRPC",
				href: "https://github.com/unnoq/orpc",
				suffix: " for type-safe API calls",
			},
			{
				name: "Tailwind CSS 4",
				href: "https://tailwindcss.com/docs/installation/using-vite",
				suffix: " for styling",
			},
			{
				name: "shadcn/ui",
				href: "https://ui.shadcn.com/docs",
				suffix: " for UI components",
			},
			{
				name: "Server Mono",
				href: "https://servermono.com",
				suffix: " font from internet.dev",
			},
			{
				name: "Vercel AI SDK",
				href: "https://ai-sdk.dev/docs/introduction",
				suffix: " for streaming AI responses",
			},
			{
				name: "React Markdown",
				href: "https://remarkjs.github.io/react-markdown/",
				suffix: " for markdown rendering",
			},
			{
				name: "Shiki",
				href: "https://shiki.style/guide",
				suffix: " for syntax highlighting",
			},
		],
	},
	{
		title: "Backend",
		items: [
			{
				name: "Cloudflare Workers",
				href: "https://developers.cloudflare.com/workers/",
				suffix: " for serverless compute",
			},
			{
				name: "Hono",
				href: "https://hono.dev/docs",
				suffix: " for HTTP routing",
			},
			{
				name: "oRPC",
				href: "https://github.com/unnoq/orpc",
				suffix: " for type-safe RPC",
			},
			{
				name: "Drizzle ORM",
				href: "https://orm.drizzle.team/docs/overview",
				suffix: " for database operations",
			},
			{
				name: "Better Auth",
				href: "https://better-auth.com/docs/introduction",
				suffix: " for authentication",
			},
			{
				name: "Vercel AI SDK",
				href: "https://ai-sdk.dev/docs/introduction",
				suffix: " for AI provider integration",
			},
			{
				name: "Resend",
				href: "https://resend.com/docs/introduction",
				suffix: " for email delivery (production)",
			},
		],
	},
	{
		title: "Infrastructure",
		items: [
			{
				name: "Cloudflare D1",
				href: "https://developers.cloudflare.com/d1/",
				suffix: ": Central SQLite database",
			},
			{
				name: "Cloudflare Durable Objects",
				href: "https://developers.cloudflare.com/durable-objects/",
				suffix: ": Per-user stateful storage",
			},
			{
				name: "Cloudflare KV",
				href: "https://developers.cloudflare.com/kv/",
				suffix: ": Session and cache storage",
			},
			{
				name: "Alchemy",
				href: "https://alchemy.run/getting-started",
				suffix: ": Multi-stage deployment and resource management",
			},
			{
				name: "Better-T-Stack",
				href: "https://better-t-stack.dev",
				suffix: ": Project scaffold",
			},
		],
	},
];
