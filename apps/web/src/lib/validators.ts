import { z } from "zod";

export const signInEmailSchema = z.object({
	email: z.email("Please enter a valid email address"),
});

export const signInOtpSchema = z.object({
	email: z.email("Please enter a valid email address"),
	otp: z
		.string()
		.min(6, "Verification code must be 6 digits")
		.max(6, "Verification code must be 6 digits"),
});
