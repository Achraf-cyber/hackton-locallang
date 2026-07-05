import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveUser } from "../../../lib/identity";
import { SESSION_COOKIE_NAME, signSession } from "../../../lib/session";

const bodySchema = z.object({
  email: z.string().email("email invalide"),
});

/**
 * Enregistre (ou retrouve) un utilisateur web par email et pose un cookie de
 * session signé (`lldp_session`). Sert de point d'entrée pour donner une
 * identité stable aux utilisateurs anonymes du site (nécessaire pour le
 * suivi de quota et le paiement).
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const user = await resolveUser("web", parsed.data.email);
  const token = signSession(user.id);

  // Secure uniquement en prod : un navigateur ignore silencieusement les
  // cookies Secure sur http://localhost, ce qui casserait la connexion en
  // dev local si on le mettait inconditionnellement.
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";

  const response = Response.json({ userId: user.id });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/${secureFlag}`,
  );
  return response;
}
