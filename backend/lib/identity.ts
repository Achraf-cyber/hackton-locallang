/**
 * Résolution d'identité — associe un canal (telegram/whatsapp/web/mobile) +
 * une valeur stable (chat id, email, etc.) à un `User` unique en base.
 *
 * Un même humain peut avoir plusieurs `UserIdentity` (une par canal) qui
 * pointent toutes vers le même `User`, ce qui permet de fusionner l'historique
 * et le quota d'un utilisateur qui bascule d'un canal à l'autre (plus tard).
 */

import type { User } from "@prisma/client";
import { prisma } from "./db";
import type { ChatContextMessage } from "./llm";

export type IdentityChannel = "telegram" | "whatsapp" | "web" | "mobile";

/**
 * Retrouve le `User` associé à (channel, value), ou en crée un nouveau
 * (avec son identité) si c'est le premier contact sur ce canal.
 */
export async function resolveUser(channel: IdentityChannel, value: string): Promise<User> {
  const existing = await prisma.userIdentity.findUnique({
    where: { channel_value: { channel, value } },
    include: { user: true },
  });
  if (existing) {
    return existing.user;
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: {} });
    await tx.userIdentity.create({
      data: { userId: user.id, channel, value },
    });
    return user;
  });

  return created;
}

/**
 * Rattache un utilisateur à une Organization.
 *
 * Heuristique simplifiée pour le hackathon : si `organizationSlugOrEmailDomain`
 * ressemble à une adresse email ou à un nom de domaine (contient "."), on
 * l'associe à l'Organization dont `contactEmail` partage le même domaine.
 * Sinon on le traite comme un `Organization.id` direct. Une vraie
 * implémentation utiliserait un slug/code d'invitation dédié plutôt que de
 * deviner à partir du domaine email.
 */
export async function linkOrganization(
  userId: string,
  organizationSlugOrEmailDomain: string,
): Promise<User> {
  const input = organizationSlugOrEmailDomain.trim();
  const looksLikeDomain = input.includes("@") || input.includes(".");

  let organizationId: string | null = null;

  if (looksLikeDomain) {
    const domain = input.includes("@") ? input.split("@")[1] : input;
    const organizations = await prisma.organization.findMany();
    const match = organizations.find((org) => org.contactEmail.split("@")[1] === domain);
    organizationId = match?.id ?? null;
  } else {
    const org = await prisma.organization.findUnique({ where: { id: input } });
    organizationId = org?.id ?? null;
  }

  if (!organizationId) {
    throw new Error(
      `Aucune organisation trouvée pour "${organizationSlugOrEmailDomain}".`,
    );
  }

  return prisma.user.update({
    where: { id: userId },
    data: { organizationId, tier: "organization" },
  });
}

/** Récupère l'historique de conversation récent sous forme de contexte pour Gemini. */
export async function getChatContext(userId: string): Promise<ChatContextMessage[]> {
  if (!userId || userId === "anonymous") return [];

  const interactions = await prisma.interaction.findMany({
    where: { userId },
    orderBy: { ts: "desc" },
    take: 6,
  });

  // Remettre dans l'ordre chronologique
  interactions.reverse();

  const context: ChatContextMessage[] = [];
  for (const item of interactions) {
    if (item.type === "text" || item.type === "voice") {
      context.push({ role: "user", content: item.inputSummary });
      context.push({ role: "assistant", content: item.outputSummary });
    }
  }
  return context;
}
