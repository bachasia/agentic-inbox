import { Button, Input, Text } from "@cloudflare/kumo";
import { EnvelopeIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Sign In — Agentic Inbox" }];
}

export default function LoginRoute() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (!isPending && session) navigate("/", { replace: true });
	}, [session, isPending, navigate]);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);
		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(result.error.message || "Invalid email or password");
				return;
			}
			navigate("/");
		} catch {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-kumo-recessed flex items-center justify-center p-4">
			<div className="w-full max-w-sm">
				{/* Brand */}
				<div className="flex items-center justify-center gap-2.5 mb-8">
					<div
						className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
						style={{ background: "var(--home-indigo)" }}
					>
						<EnvelopeIcon size={18} />
					</div>
					<span className="text-lg font-semibold tracking-tight text-kumo-default">DTC Inbox</span>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-8">
					<h1 className="text-xl font-bold text-kumo-default mb-2">Sign in</h1>
					<p className="text-sm text-kumo-subtle mb-6">
						Welcome back to Agentic Inbox
					</p>

					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<Text variant="error" size="sm">
								{error}
							</Text>
						)}
						<Input
							label="Email"
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
						/>
						<Input
							label="Password"
							type="password"
							placeholder="••••••••"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete="current-password"
						/>
						<Button
							type="submit"
							variant="primary"
							className="w-full"
							loading={isLoading}
							>
							Sign in
						</Button>
					</form>

					<p className="text-xs text-kumo-subtle mt-4 text-center">
						First time?{" "}
						<RouterLink to="/setup" style={{ color: "var(--home-indigo)" }} className="hover:underline">
							Create admin account
						</RouterLink>
					</p>
				</div>
			</div>
		</div>
	);
}
