import { getRuntimeConfigStatus } from "@tools/integrations";

export function GET() {
  return Response.json(getRuntimeConfigStatus());
}
