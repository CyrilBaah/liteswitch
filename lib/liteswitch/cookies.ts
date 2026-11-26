// Cookie names and tiny helpers shared by proxy.ts (server) and the browser code.

/** Stable visitor id. Used as the Flagsmith identity for flags AND events. */
export const VISITOR_COOKIE = "ls_vid";

/** "1" while the current request carried `Save-Data: on` (session cookie). */
export const SAVE_DATA_COOKIE = "ls_sd";

export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Browser only: read one cookie value, or null if it isn't there. */
export function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Browser only: write a long-lived cookie with the same attributes proxy.ts uses. */
export function writeCookie(name: string, value: string): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
