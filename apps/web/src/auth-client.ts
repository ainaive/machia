import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const INVITE_HEADER = "x-invite-code";

const authClient = createAuthClient({
  plugins: [usernameClient({ displayUsername: false })],
});

export function authErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function unwrap(result: { error: unknown }): void {
  if (result.error) throw new Error(authErrorMessage(result.error));
}

export async function signInWithIdentifier(identifier: string, password: string): Promise<void> {
  const value = identifier.trim();
  const result = value.includes("@")
    ? await authClient.signIn.email({ email: value, password })
    : await authClient.signIn.username({ username: value, password });
  unwrap(result);
}

export async function signUpWithInvite(input: {
  email: string;
  username: string;
  password: string;
  inviteCode: string;
}): Promise<void> {
  const result = await authClient.signUp.email({
    email: input.email,
    password: input.password,
    name: input.username,
    username: input.username,
    fetchOptions: {
      headers: { [INVITE_HEADER]: input.inviteCode },
    },
  });
  unwrap(result);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const result = await authClient.requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}/reset-password`,
  });
  unwrap(result);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const result = await authClient.resetPassword({ token, newPassword });
  unwrap(result);
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
