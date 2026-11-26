// Runs on the server before each page request (Next.js 16 calls this "Proxy";
// older versions called it "Middleware"). Two small jobs:
//   1. Give every browser a stable visitor id cookie (ls_vid).
//   2. Mirror the Save-Data request header into a cookie (ls_sd), because
//      browser JavaScript can't read request headers.
import { NextResponse, type NextRequest } from "next/server";
import { ONE_YEAR_SECONDS, SAVE_DATA_COOKIE, VISITOR_COOKIE } from "./lib/liteswitch/cookies";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const secure = request.nextUrl.protocol === "https:";

  // 1. Visitor id. NOT httpOnly: the browser code must read it to identify with Flagsmith.
  if (!request.cookies.get(VISITOR_COOKIE)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      httpOnly: false,
      sameSite: "lax",
      secure,
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
    });
  }

  // 2. Save-Data. A session cookie that always reflects the CURRENT request:
  //    switch Data Saver off and the next request deletes it.
  if (request.headers.get("save-data")?.toLowerCase() === "on") {
    response.cookies.set(SAVE_DATA_COOKIE, "1", { httpOnly: false, sameSite: "lax", secure, path: "/" });
  } else if (request.cookies.get(SAVE_DATA_COOKIE)) {
    response.cookies.delete(SAVE_DATA_COOKIE);
  }

  return response;
}

// Only run for pages, not for static files (media, fonts, JS bundles).
export const config = {
  matcher: ["/((?!_next/|media/|fonts/|favicon.ico).*)"],
};
