/**
 * Helpers SSO Google côté client.
 *
 * Le state CSRF est généré par le backend, redonné au front, puis stocké
 * en sessionStorage avant la redirection vers Google. Quand Google redirige
 * vers /auth/google/callback, on compare avec ce qu'on a stocké.
 */

const STATE_KEY = "bmd_google_sso_state";

export function rememberGoogleState(state: string): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STATE_KEY, state);
  }
}

export function readGoogleState(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STATE_KEY);
}

export function clearGoogleState(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(STATE_KEY);
  }
}
