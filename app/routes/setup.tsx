import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Setup — Agentic Inbox" }];
}

export default function SetupRoute() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isChecking, setIsChecking] = useState(true);

	// Redirect to /login if setup is already complete
	useEffect(() => {
		fetch("/api/v1/auth/setup-status")
			.then((r) => r.json() as Promise<{ needsSetup: boolean }>)
			.then(({ needsSetup }) => {
				if (!needsSetup) navigate("/login", { replace: true });
				else setIsChecking(false);
			})
			.catch(() => setIsChecking(false));
	}, [navigate]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}

		setIsLoading(true);
		try {
			const res = await fetch("/api/v1/auth/setup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, name }),
			});
			if (!res.ok) {
				const body = await res.json() as { error?: string };
				setError(body.error || "Setup failed");
				return;
			}
			// Session cookie is set by the server response — sign in to confirm
			await authClient.signIn.email({ email, password });
			navigate("/");
		} catch {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	if (isChecking) {
		return (
			<div className="min-h-screen bg-kumo-recessed flex items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-kumo-brand border-t-transparent" />
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-kumo-recessed flex items-center justify-center p-4">
			<div className="w-full max-w-sm">
				<div className="rounded-xl border border-kumo-line bg-kumo-base p-8">
					<h1 className="text-xl font-bold text-kumo-default mb-2">Create admin account</h1>
					<p className="text-sm text-kumo-subtle mb-6">
						This is the first-time setup. You'll become the admin.
					</p>

					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<Text variant="error" size="sm">
								{error}
							</Text>
						)}
						<Input
							label="Name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
						<Input
							label="Email"
							type="email"
							placeholder="admin@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoComplete="email"
						/>
						<Input
							label="Password"
							type="password"
							placeholder="Min 8 characters"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete="new-password"
						/>
						<Input
							label="Confirm Password"
							type="password"
							placeholder="Repeat password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							required
							autoComplete="new-password"
						/>
						<Button
							type="submit"
							variant="primary"
							className="w-full"
							loading={isLoading}
						>
							Create Admin Account
						</Button>
					</form>
				</div>
			</div>
		</div>
	);
}
