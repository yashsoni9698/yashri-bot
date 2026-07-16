import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  checkAppPassword,
  createSessionToken,
  isAuthEnabled,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      ok: true,
      authRequired: false,
    });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (!checkAppPassword(password)) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401 }
    );
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Auth is misconfigured" },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
