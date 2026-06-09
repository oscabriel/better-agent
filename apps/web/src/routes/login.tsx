import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

const RouteComponent = () => {
	const [showSignUp, setShowSignUp] = useState(false);

	return showSignUp ? (
		<SignUpForm onSwitchToSignIn={() => setShowSignUp(false)} />
	) : (
		<SignInForm onSwitchToSignUp={() => setShowSignUp(true)} />
	);
};

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});
