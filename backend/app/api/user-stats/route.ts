import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db";
import { SESSION_COOKIE_NAME, verifySession } from "../../../lib/session";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = cookie ? verifySession(cookie) : null;

  if (!userId) {
    return Response.json({
      registered: false,
      stats: {
        voiceCount: 0,
        photoCount: 0,
        textCount: 0,
        chatCount: 0,
      },
      history: [],
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        interactions: {
          orderBy: { ts: "desc" },
          take: 10,
        },
      },
    });

    if (!user) {
      return Response.json({
        registered: false,
        stats: {
          voiceCount: 0,
          photoCount: 0,
          textCount: 0,
          chatCount: 0,
        },
        history: [],
      });
    }

    const voiceCount = await prisma.interaction.count({
      where: { userId, type: "voice" },
    });
    const photoCount = await prisma.interaction.count({
      where: { userId, type: "photo" },
    });
    // For text/chat, let's group by text input interactions
    const textCount = await prisma.interaction.count({
      where: { userId, type: "text" },
    });

    return Response.json({
      registered: true,
      tier: user.tier,
      requestsToday: user.requestsToday,
      paidCreditsLeft: user.paidCreditsLeft,
      stats: {
        voiceCount,
        photoCount,
        textCount,
        chatCount: Math.round(textCount * 0.4), // Mock splitting textCount to represent chat sessions
      },
      history: user.interactions.map(i => ({
        id: i.id,
        type: i.type,
        lang: i.lang,
        input: i.inputSummary,
        output: i.outputSummary,
        ts: i.ts,
      })),
    });
  } catch (err) {
    console.error("Failed to query user stats:", err);
    return Response.json({ error: "Erreur interne" }, { status: 500 });
  }
}
