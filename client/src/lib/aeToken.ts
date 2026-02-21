/**
 * AE session token helpers.
 * The token is stored in localStorage and sent as the X-AE-Token header
 * on every tRPC request, avoiding cross-origin cookie issues in production.
 *
 * Kept in a separate file to prevent circular imports between main.tsx
 * and components that need these helpers.
 */

const AE_TOKEN_KEY = "ae_token";

export function getAeToken(): string | null {
  return localStorage.getItem(AE_TOKEN_KEY);
}

export function setAeToken(token: string): void {
  localStorage.setItem(AE_TOKEN_KEY, token);
}

export function clearAeToken(): void {
  localStorage.removeItem(AE_TOKEN_KEY);
}
