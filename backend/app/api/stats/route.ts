import { prisma } from "../../../lib/db";

export async function GET() {
  try {
    const total = await prisma.interaction.count();

    const channelGroups = await prisma.interaction.groupBy({
      by: ["channel"],
      _count: {
        _all: true,
      },
    });

    const langGroups = await prisma.interaction.groupBy({
      by: ["lang"],
      _count: {
        _all: true,
      },
    });

    const byChannel: Record<string, number> = {};
    for (const group of channelGroups) {
      byChannel[group.channel] = group._count._all;
    }

    const byLang: Record<string, number> = {};
    for (const group of langGroups) {
      byLang[group.lang] = group._count._all;
    }

    return Response.json({
      byChannel,
      byLang,
      total,
    });
  } catch (err) {
    console.error("Failed to fetch stats:", err);
    return Response.json({ error: "Impossible de récupérer les statistiques." }, { status: 500 });
  }
}
