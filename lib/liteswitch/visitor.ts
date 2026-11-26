// One stable visitor id per browser, so the flag decision and every event
// (lesson_started, lesson_completed, page_bytes) belong to the same identity.
import { VISITOR_COOKIE, readCookie, writeCookie } from "./cookies";

/**
 * Returns the visitor id, or null if this browser won't keep cookies.
 * proxy.ts normally sets the cookie on the first response. If it's missing
 * (cookie raced the first paint), we create one here and read it back.
 * null means "can't track this person consistently" -> they are NOT enrolled.
 */
export function getVisitorId(): string | null {
  const existing = readCookie(VISITOR_COOKIE);
  if (existing) return existing;

  writeCookie(VISITOR_COOKIE, crypto.randomUUID());
  return readCookie(VISITOR_COOKIE); // null if cookies are blocked
}
