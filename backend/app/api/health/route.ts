import { getEnv } from "../../../lib/env";

export async function GET() {
  let modelService: "ok" | "down" = "down";
  try {
    const url = getEnv().MODEL_SERVICE_URL.replace(/\/$/, "");
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) modelService = "ok";
  } catch {
    modelService = "down";
  }

  return Response.json({ status: "ok", modelService });
}
