import { verifyToken } from "../../../../lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;
    const secret = process.env.SESSION_SECRET ?? "default_secret_please_change_in_production";

    if (sessionToken) {
      const payload = await verifyToken(sessionToken, secret);
      if (payload) {
        return Response.json({ authenticated: true, username: payload.username });
      }
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }

  return Response.json({ authenticated: false }, { status: 401 });
}
