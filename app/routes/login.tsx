import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Sign In — Agentic Inbox" }];
}

export default function LoginRoute() {
	const navigate = useNavigate();
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
						<RouterLink to="/setup" className="text-kumo-brand hover:underline">
							Create admin account
						</RouterLink>
					</p>
				</div>
			</div>
		</div>
	);
}
