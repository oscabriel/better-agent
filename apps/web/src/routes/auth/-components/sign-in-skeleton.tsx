import { ExternalLink } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import {
	GitHubIcon,
	GoogleIcon,
} from "@/web/routes/auth/-components/social-sign-in-icons";

export function SignInShellSkeleton() {
	const emailForm = useAppForm({
		defaultValues: {
			email: "",
		},
	});

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-2 text-center font-bold text-3xl">Welcome ☁️</h1>
			<p className="mb-6 text-center text-muted-foreground">
				Choose a sign in method below.
			</p>
			<emailForm.AppForm>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void emailForm.handleSubmit();
					}}
					className="space-y-4"
				>
					<emailForm.AppField name="email">
						{(field) => (
							<field.FormItem>
								<field.FormLabel>Email</field.FormLabel>
								<field.FormControl>
									<Input type="email" placeholder="you@example.com" />
								</field.FormControl>
								<field.FormMessage />
							</field.FormItem>
						)}
					</emailForm.AppField>

					<emailForm.Subscribe>
						{() => (
							<Button type="submit" className="w-full">
								Send verification code
							</Button>
						)}
					</emailForm.Subscribe>
				</form>
			</emailForm.AppForm>

			<div className="relative my-6">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-gray-300 border-t dark:border-gray-600" />
				</div>
				<div className="relative flex justify-center text-sm">
					<span className="bg-background px-2 text-gray-500 dark:text-gray-400">
						OR
					</span>
				</div>
			</div>

			<div className="space-y-4">
				<Button className="relative flex w-full items-center justify-center space-x-2 border border-gray-300 bg-background text-foreground hover:bg-accent dark:border-gray-600">
					<GoogleIcon className="size-4" />
					<span>Sign in with Google</span>
				</Button>

				<Button className="relative flex w-full items-center justify-center space-x-2 border border-gray-300 bg-background text-foreground hover:bg-accent dark:border-gray-600">
					<GitHubIcon className="size-4" />
					<span>Sign in with GitHub</span>
				</Button>
			</div>

			<div className="mt-8 text-center text-muted-foreground text-sm italic">
				Authentication powered by{" "}
				<a
					href="https://better-auth.com"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-muted-foreground underline hover:text-muted-foreground/80"
				>
					Better Auth
					<ExternalLink className="size-3" />
				</a>
				<br />
				and Cloudflare D1+KV
			</div>
		</div>
	);
}
