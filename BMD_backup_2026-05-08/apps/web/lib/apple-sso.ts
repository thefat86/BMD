/**
 * Helpers SSO Apple côté client (équivalent de google-sso.ts).
 */
const STATE_KEY = "bmd_apple_sso_state";

export function rememberAppleState(state: string): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STATE_KEY, state);
  }
}
export function readAppleState(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STATE_KEY);
}
export function clearAppleState(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(STATE_KEY);
  }
}
