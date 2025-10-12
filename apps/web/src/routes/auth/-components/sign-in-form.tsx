import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/web/components/ui/input-otp";
import { useAppForm } from "@/web/components/ui/tanstack-form";
import { authClient } from "@/web/lib/auth-client";
import { useAuth } from "@/web/lib/auth-context";
import { SIGN_IN_FORM, SOCIAL_PROVIDERS } from "@/web/lib/constants";
import { signInEmailSchema, signInOtpSchema } from "@/web/lib/validators";
import { GitHubIcon, GoogleIcon } from "./social-sign-in-icons";

interface SignInFormProps {
	redirectPath: string;
}

export function SignInForm({ redirectPath }: SignInFormProps) {
	const navigate = useNavigate();
	const auth = useAuth();
	const [isOtpSent, setIsOtpSent] = useState(false);
	const [email, setEmail] = useState("");

	useEffect(() => {
		if (auth.session?.user && auth.status === "authenticated") {
			navigate({
				to: redirectPath,
				replace: true,
			});
		}
	}, [auth.session?.user, auth.status, navigate, redirectPath]);

	const sendOtpMutation = useMutation({
		mutationFn: async (email: string) => {
			return authClient.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
		},
		onSuccess: () => {
			setIsOtpSent(true);
			toast.success(SIGN_IN_FORM.SUCCESS_MESSAGES.OTP_SENT);
		},
		onError: (error: { error?: { message?: string } }) => {
			toast.error(error.error?.message || "Failed to send verification code");
		},
	});

	const verifyOtpMutation = useMutation({
		mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
			return authClient.signIn.emailOtp({ email, otp });
		},
		onSuccess: () => {
			toast.success(SIGN_IN_FORM.SUCCESS_MESSAGES.SIGN_IN_SUCCESS);
		},
		onError: (error: { error?: { message?: string } }) => {
			toast.error(error.error?.message || "Failed to verify code");
		},
	});

	const socialSignInMutation = useMutation({
		mutationFn: async ({
			provider,
		}: {
			provider: keyof typeof SOCIAL_PROVIDERS;
		}) => {
			const baseUrl =
				import.meta.env.VITE_WEB_URL ??
				(typeof window !== "undefined" ? window.location.origin : "");
			const callbackURL = `${baseUrl}${redirectPath}`;

			return authClient.signIn.social({
				provider: SOCIAL_PROVIDERS[provider],
				callbackURL,
			});
		},
		onSuccess: (_, variables) => {
			toast.success(
				`Successfully signed in with ${SOCIAL_PROVIDERS[variables.provider]}`,
			);
		},
		onError: (error: { error?: { message?: string } }, variables) => {
			toast.error(
				error.error?.message ||
					`Failed to sign in with ${SOCIAL_PROVIDERS[variables.provider]}`,
			);
		},
	});

	const emailForm = useAppForm({
		defaultValues: {
			email: "",
		},
		validators: {
			onChange: signInEmailSchema,
		},
		onSubmit: async ({ value }) => {
			setEmail(value.email);
			sendOtpMutation.mutate(value.email);
		},
	});

	const otpForm = useAppForm({
		defaultValues: {
			otp: "",
		},
		validators: {
			onChange: signInOtpSchema.pick({ otp: true }),
		},
		onSubmit: async ({ value }) => {
			verifyOtpMutation.mutate({ email, otp: value.otp });
		},
	});

	const handleGoogleLogin = () => {
		socialSignInMutation.mutate({ provider: "GOOGLE" });
	};

	const handleGithubLogin = () => {
		socialSignInMutation.mutate({ provider: "GITHUB" });
	};

	if (verifyOtpMutation.isError) {
		otpForm.setFieldValue("otp", "");
		verifyOtpMutation.reset();
	}

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-2 text-center font-bold text-3xl">Welcome 👋</h1>
			<p className="mb-6 text-center text-muted-foreground">
				Choose a sign in method below.
			</p>

			{!isOtpSent && (
				<>
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
											<Input
												type="email"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												disabled={sendOtpMutation.isPending}
												placeholder="you@example.com"
											/>
										</field.FormControl>
										<field.FormMessage />
									</field.FormItem>
								)}
							</emailForm.AppField>

							<emailForm.Subscribe>
								{(state) => (
									<Button
										type="submit"
										className="w-full text-base"
										disabled={
											!state.canSubmit ||
											state.isSubmitting ||
											sendOtpMutation.isPending
										}
									>
										{sendOtpMutation.isPending
											? SIGN_IN_FORM.LOADING_MESSAGES.SENDING_OTP
											: "Send verification code"}
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
						<Button
							className="relative flex w-full items-center justify-center space-x-2 border border-gray-300 bg-background text-base text-foreground hover:bg-accent dark:border-gray-600"
							onClick={handleGoogleLogin}
							disabled={socialSignInMutation.isPending}
						>
							<GoogleIcon className="size-4" />
							<span>Sign in with Google</span>
						</Button>

						<Button
							className="relative flex w-full items-center justify-center space-x-2 border border-gray-300 bg-background text-base text-foreground hover:bg-accent dark:border-gray-600"
							onClick={handleGithubLogin}
							disabled={socialSignInMutation.isPending}
						>
							<GitHubIcon className="size-4" />
							<span>Sign in with GitHub</span>
						</Button>
					</div>
				</>
			)}

			{isOtpSent && (
				<otpForm.AppForm>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void otpForm.handleSubmit();
						}}
						className="space-y-4"
					>
						<p className="mb-4 text-center text-gray-600 text-sm">
							We've sent a verification code to{" "}
							<span className="font-medium">{email}</span>.
						</p>
						<otpForm.AppField name="otp">
							{(field) => (
								<field.FormItem>
									<field.FormLabel>Verification Code</field.FormLabel>
									<field.FormControl>
										<InputOTP
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={field.handleChange}
											onBlur={field.handleBlur}
											disabled={auth.status === "loading"}
											autoComplete="one-time-code"
											maxLength={SIGN_IN_FORM.OTP_LENGTH}
											className="w-full"
										>
											<InputOTPGroup className="w-full justify-between gap-2">
												{Array.from(
													{ length: SIGN_IN_FORM.OTP_LENGTH },
													(_, index) => (
														<InputOTPSlot
															// biome-ignore lint/suspicious/noArrayIndexKey: Index is stable for OTP slots
															key={`otp-slot-${index}`}
															index={index}
															className="h-12 flex-1 border border-input text-xl"
														/>
													),
												)}
											</InputOTPGroup>
										</InputOTP>
									</field.FormControl>
									<field.FormMessage />
								</field.FormItem>
							)}
						</otpForm.AppField>

						<otpForm.Subscribe>
							{(state) => (
								<Button
									type="submit"
									className="w-full text-base"
									disabled={
										!state.canSubmit ||
										state.isSubmitting ||
										verifyOtpMutation.isPending
									}
								>
									{verifyOtpMutation.isPending
										? SIGN_IN_FORM.LOADING_MESSAGES.VERIFYING_OTP
										: "Verify & Sign In"}
								</Button>
							)}
						</otpForm.Subscribe>

						<Button
							variant="link"
							className="w-full text-base"
							onClick={() => {
								setIsOtpSent(false);
								otpForm.setFieldValue("otp", "");
							}}
							disabled={verifyOtpMutation.isPending}
						>
							Back to Email
						</Button>
					</form>
				</otpForm.AppForm>
			)}

			<div className="mt-8 text-center text-muted-foreground text-sm italic">
				Authentication powered by{" "}
				<a
					href="https://better-auth.com"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-muted-foreground underline hover:text-muted-foreground/80"
				>
					Better Auth
					<ExternalLink className="h-3 w-3" />
				</a>
				<br />
				and Cloudflare D1+KV
			</div>
		</div>
	);
}
