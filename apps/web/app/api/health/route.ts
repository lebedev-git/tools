// Lightweight liveness endpoint for the Docker healthcheck. Excluded from auth
// in middleware.ts. Must stay dependency-free and fast.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok" });
}
