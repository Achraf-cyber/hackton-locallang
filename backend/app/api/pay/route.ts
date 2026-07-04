// MOCK — à remplacer par une vraie intégration Orange Money / Wave / CinetPay
// avant toute mise en production commerciale. Le schéma Payment et le flux
// de crédit sont réels et prêts pour cette bascule.

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db";

const bodySchema = z.object({
  userId: z.string().min(1, "userId requis"),
  amountFcfa: z.number().int().positive("amountFcfa doit être positif"),
  creditsRequested: z.number().int().positive("creditsRequested doit être positif"),
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

  const { userId, amountFcfa, creditsRequested } = parsed.data;

  const payment = await prisma.payment.create({
    data: {
      userId,
      provider: "mock",
      amountFcfa,
      creditsGranted: creditsRequested,
      status: "pending",
    },
  });

  // Simulation synchrone de la confirmation (pas d'appel réseau réel).
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "confirmed" },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { paidCreditsLeft: { increment: creditsRequested } },
  });

  return Response.json({ status: "confirmed", paidCreditsLeft: user.paidCreditsLeft });
}
