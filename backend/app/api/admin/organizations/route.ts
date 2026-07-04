// À protéger avant tout usage réel avec une authentification appropriée
// (pas d'auth pour l'instant, endpoint interne pour le hackathon).

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db";

const bodySchema = z.object({
  name: z.string().min(1, "name requis"),
  contactEmail: z.string().email("contactEmail invalide"),
  plan: z.string().min(1).default("standard"),
});

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

  const org = await prisma.organization.create({ data: parsed.data });
  return Response.json({ id: org.id });
}

export async function GET() {
  const organizations = await prisma.organization.findMany({
    include: { _count: { select: { users: true } } },
  });
  return Response.json(organizations);
}
