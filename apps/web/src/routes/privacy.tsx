import { createFileRoute } from "@tanstack/react-router";
import { DocumentSkeleton } from "@/web/components/skeletons/document-skeleton";

const subtleLinkClass =
	"relative inline-block text-current no-underline after:absolute after:left-0 after:bottom-0 after:h-px after:w-0 after:bg-current after:transition-[width] after:duration-200 after:ease-out after:content-[''] hover:after:w-full focus-visible:after:w-full focus-visible:outline-none";

export const Route = createFileRoute("/privacy")({
	component: PrivacyRoute,
	pendingComponent: DocumentSkeleton,
});

function PrivacyRoute() {
	return (
		<div className="min-h-screen">
			<div className="mx-auto max-w-4xl px-8 py-32">
				<header className="mb-24">
					<h1 className="font-normal text-xl uppercase tracking-wide">
						PRIVACY POLICY
					</h1>
					<p className="mt-1 text-sm italic opacity-80">
						LAST UPDATED: OCTOBER 2025
					</p>
				</header>

				<div className="space-y-12 text-base leading-snug">
					<section>
						<h2 className="mb-4 font-normal uppercase">Introduction</h2>
						<div className="space-y-4 opacity-90">
							<p>
								We value your privacy and are committed to safeguarding your
								personal data. This privacy policy explains how Better Chat
								collects, uses, stores, and protects your information when you
								use our AI chat application, as well as your privacy rights and
								how they are protected by law.
							</p>
							<p>
								Better Chat is built with privacy-first architecture that
								provides per-user data isolation and secure storage.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Data We Collect</h2>
						<div className="space-y-4 opacity-90">
							<div>
								<p className="mb-2 font-normal">Authentication Data</p>
								<ul className="ml-4 space-y-1">
									<li>→ Email address (required for account creation)</li>
									<li>→ Name (from OAuth providers or user input)</li>
									<li>→ Profile image (optional, from OAuth providers)</li>
									<li>→ Email verification status</li>
									<li>
										→ OAuth tokens (when using Google or GitHub sign-in, stored
										securely)
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Session & Security Data</p>
								<ul className="ml-4 space-y-1">
									<li>→ Session tokens (stored in Cloudflare KV)</li>
									<li>→ IP address (for security and rate limiting)</li>
									<li>→ User agent (browser/device information)</li>
									<li>→ Rate limiting metadata</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">User Content & Activity</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ Chat conversations and messages (stored in your isolated
										Durable Object)
									</li>
									<li>→ Conversation titles and timestamps</li>
									<li>
										→ Usage statistics (message counts, token usage per model,
										daily/monthly aggregates)
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Settings & Preferences</p>
								<ul className="ml-4 space-y-1">
									<li>→ Selected AI model and enabled models</li>
									<li>→ Enabled MCP (Model Context Protocol) servers</li>
									<li>→ Theme preference (light/dark/system)</li>
									<li>→ Chat interface width preference</li>
									<li>→ Web search enabled status</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">
									API Keys (BYOK - Bring Your Own Key)
								</p>
								<ul className="ml-4 space-y-1">
									<li>→ API keys for AI providers</li>
									<li>
										→ Encrypted at rest using industry-standard encryption
									</li>
									<li>→ Never shared with third parties or other users</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Custom MCP Servers</p>
								<ul className="ml-4 space-y-1">
									<li>→ Server URLs and connection details</li>
									<li>→ Custom headers (if configured)</li>
									<li>→ Server names and descriptions</li>
								</ul>
							</div>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							How We Store Your Data
						</h2>
						<div className="space-y-4 opacity-90">
							<p>
								Better Chat uses secure cloud infrastructure designed for
								privacy, security, and performance:
							</p>

							<div>
								<p className="mb-2 font-normal">Account Data</p>
								<ul className="ml-4 space-y-1">
									<li>→ Authentication and account information</li>
									<li>→ User settings and preferences</li>
									<li>→ Usage tracking and quotas</li>
									<li>→ Custom server configurations</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">
									Chat Data (Per-User Isolated Storage)
								</p>
								<ul className="ml-4 space-y-1">
									<li>→ Your chat conversations and messages</li>
									<li>→ Each user has their own isolated storage instance</li>
									<li>→ Strong data isolation preventing cross-user access</li>
									<li>→ Distributed processing close to your location</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Session Management</p>
								<ul className="ml-4 space-y-1">
									<li>→ Session tokens with automatic expiration</li>
									<li>→ Rate limiting for security</li>
									<li>→ Distributed storage for performance</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Security Measures</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ API keys encrypted using industry-standard encryption
									</li>
									<li>→ User-specific encryption keys for isolation</li>
									<li>→ All data transmitted over secure HTTPS connections</li>
									<li>→ Secure, HTTP-only cookies with modern protections</li>
								</ul>
							</div>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">How We Use Your Data</h2>
						<div className="space-y-4 opacity-90">
							<p>We use your data solely to provide and improve our service:</p>
							<ul className="ml-4 space-y-1">
								<li>→ Authenticate and maintain your account</li>
								<li>→ Store and retrieve your chat conversations</li>
								<li>→ Process AI requests using your selected models</li>
								<li>→ Track usage for quota management and fair use</li>
								<li>→ Connect to MCP servers for documentation access</li>
								<li>→ Maintain your preferences and settings</li>
								<li>→ Secure your account and prevent abuse</li>
							</ul>
							<p>
								We do not use your data for advertising, marketing, or any
								purpose beyond operating the Better Chat service.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							Sharing & Third Parties
						</h2>
						<div className="space-y-4 opacity-90">
							<p>
								We do not sell, lease, or trade your personal information. We
								share data only with essential service providers:
							</p>

							<div>
								<p className="mb-2 font-normal">Infrastructure Providers</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ Cloud hosting and database services for storing and
										processing your data
									</li>
									<li>→ Edge network providers for global performance</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Authentication Services</p>
								<ul className="ml-4 space-y-1">
									<li>→ Email verification services</li>
									<li>→ Social login providers (if you choose to use them)</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Email Delivery</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ Email service providers for sending verification codes
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">AI & Documentation Services</p>
								<ul className="ml-4 space-y-1">
									<li>→ AI model providers for processing chat requests</li>
									<li>
										→ When using your own API keys, your keys connect directly
										to your chosen providers
									</li>
									<li>
										→ Documentation servers (only when you enable them in
										settings)
									</li>
									<li>
										→ Conversation context is sent to AI providers only to
										generate responses
									</li>
								</ul>
							</div>

							<p>
								All third-party providers are selected for their strong privacy
								practices and compliance with applicable data protection laws.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Your Privacy Rights</h2>
						<div className="space-y-4 opacity-90">
							<p>
								You have the following rights concerning your personal data:
							</p>

							<div>
								<p className="mb-2 font-normal">Access</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ View all your conversations, settings, and usage data
										through the app
									</li>
									<li>→ Request a copy of your data by contacting us</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Correction</p>
								<ul className="ml-4 space-y-1">
									<li>→ Update your profile information in account settings</li>
									<li>
										→ Modify your preferences and enabled services anytime
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">
									Deletion (Right to be Forgotten)
								</p>
								<ul className="ml-4 space-y-1">
									<li>
										→ Delete individual conversations from your chat history
									</li>
									<li>
										→ Delete your entire account using the "Delete Account"
										button in profile settings
									</li>
									<li>
										→ Account deletion removes all associated data including
										conversations, settings, and usage history
									</li>
									<li>
										→ Sessions are automatically deleted upon logout or
										expiration
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Data Portability</p>
								<ul className="ml-4 space-y-1">
									<li>→ Export your chat history (feature in development)</li>
									<li>
										→ Request data export in machine-readable format by
										contacting us
									</li>
								</ul>
							</div>

							<div>
								<p className="mb-2 font-normal">Withdrawal of Consent</p>
								<ul className="ml-4 space-y-1">
									<li>→ Revoke OAuth provider access anytime</li>
									<li>→ Remove stored API keys from settings</li>
									<li>→ Disable MCP servers or specific AI models</li>
									<li>→ Delete your account to withdraw all consent</li>
								</ul>
							</div>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							Data Retention & Deletion
						</h2>
						<div className="space-y-4 opacity-90">
							<ul className="ml-4 space-y-1">
								<li>
									→ Active accounts: Data retained as long as your account is
									active
								</li>
								<li>
									→ Account deletion: All data permanently deleted within 30
									days
								</li>
								<li>
									→ Sessions: Automatically expire and are deleted after 30 days
								</li>
								<li>
									→ Verification codes: Deleted immediately after use or
									expiration
								</li>
								<li>
									→ Usage limits reset: Daily at 00:00 UTC, monthly on the 1st
								</li>
								<li>
									→ User data isolated and deleted when account is removed
								</li>
							</ul>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Cookies & Tracking</h2>
						<div className="space-y-4 opacity-90">
							<p>
								Better Chat uses only essential cookies necessary for
								authentication and session management:
							</p>
							<ul className="ml-4 space-y-1">
								<li>→ Session cookies (authentication and login state)</li>
								<li>→ Security cookies (CSRF protection)</li>
								<li>→ Preference cookies (theme, locale)</li>
							</ul>
							<p>
								All cookies are secure, HTTP-only, and use SameSite protection.
								We do not use cookies for advertising, analytics, or tracking
								across websites.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							International Data Transfers
						</h2>
						<div className="space-y-4 opacity-90">
							<p>
								Better Chat is deployed on a global network infrastructure. Your
								data may be processed in data centers close to your geographic
								location for optimal performance. Our infrastructure providers
								comply with GDPR, CCPA, and other international data protection
								regulations.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Children's Privacy</h2>
						<div className="space-y-4 opacity-90">
							<p>
								Better Chat is not intended for users under 13 years of age. We
								do not knowingly collect personal data from children. If you
								believe we have collected data from a child, please contact us
								immediately.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">
							Changes to This Policy
						</h2>
						<div className="space-y-4 opacity-90">
							<p>
								We may update this privacy policy from time to time to reflect
								changes in our practices or for legal reasons. Any changes will
								be posted on this page with an updated "Last Updated" date.
								Continued use of Better Chat after changes indicates acceptance
								of the updated policy.
							</p>
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-normal uppercase">Contact Us</h2>
						<div className="space-y-4 opacity-90">
							<p>
								If you have questions, concerns, or requests regarding this
								privacy policy or your personal data:
							</p>
							<ul className="ml-4 space-y-1">
								<li>
									→ Email:{" "}
									<a
										href="mailto:privacy@better-cloud.dev"
										className={subtleLinkClass}
									>
										privacy@better-cloud.dev
									</a>
								</li>
								<li>
									→ GitHub:{" "}
									<a
										href="https://github.com/better-chat/better-chat/issues"
										className={subtleLinkClass}
										target="_blank"
										rel="noreferrer"
									>
										Report an issue
									</a>
								</li>
							</ul>
						</div>
					</section>

					<section className="mt-16 border-current/10 border-t pt-12">
						<div className="text-sm italic opacity-70">
							<p>
								By using Better Chat, you acknowledge that you have read and
								understood this Privacy Policy and agree to its terms.
							</p>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
