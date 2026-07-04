import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../lib/llm", () => ({
  simplify: vi.fn(async () => "texte simplifié"),
  answerQuestion: vi.fn(async () => "réponse simple"),
  readDocumentImage: vi.fn(async () => "explication"),
  translateInputToFrench: vi.fn(async (text: string) => text),
  isRateLimitError: vi.fn(() => false),
}));

vi.mock("../lib/modelService", () => ({
  localize: vi.fn(async () => ({ translated: "TRAD", audioUrl: "http://x/a.wav" })),
  transcribe: vi.fn(async () => ({ text: "txt" })),
}));

const knownUser = {
  id: "user-uuid",
  organizationId: null,
  preferredLang: "mos",
  tier: "free",
  requestsToday: 0,
  quotaResetAt: new Date(),
  paidCreditsLeft: 0,
  createdAt: new Date(),
};

vi.mock("../lib/db", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === "user-uuid") return knownUser;
        return null;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...knownUser,
        ...data,
      })),
    },
    interaction: {
      create: vi.fn(async () => ({ id: "interaction-uuid" })),
      findMany: vi.fn(async () => []),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock("../lib/quota", async () => {
  const actual = await vi.importActual<typeof import("../lib/quota")>("../lib/quota");
  return {
    ...actual,
    checkAndConsumeQuota: vi.fn(async () => ({ allowed: true })),
  };
});

vi.mock("../lib/session", () => ({
  SESSION_COOKIE_NAME: "lldp_session",
  verifySession: vi.fn((token: string) => (token === "valid-token" ? "user-uuid" : null)),
}));

import { POST } from "../app/api/text/route";
import { checkAndConsumeQuota } from "../lib/quota";

function makeRequest(body: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = `lldp_session=${cookie}`;
  return new NextRequest("http://localhost/api/text", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("200 + clés attendues quand lang est fourni (utilisateur anonyme)", async () => {
    const res = await POST(makeRequest({ text: "Bonjour", lang: "dyu" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("translated");
    expect(data).toHaveProperty("audioUrl");
    expect(data).toHaveProperty("timings");
  });

  it("400 + needLanguage quand lang est absent et l'utilisateur est anonyme", async () => {
    const res = await POST(makeRequest({ text: "Bonjour" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ needLanguage: true });
  });

  it("200 quand lang est absent mais la session cookie identifie un utilisateur connu avec preferredLang", async () => {
    const res = await POST(makeRequest({ text: "Bonjour" }, "valid-token"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("translated");
  });

  it("anonyme (pas de cookie) : le quota n'est jamais vérifié", async () => {
    await POST(makeRequest({ text: "Bonjour", lang: "dyu" }));
    expect(checkAndConsumeQuota).not.toHaveBeenCalled();
  });

  it("utilisateur authentifié : le quota est vérifié, 402 si refusé", async () => {
    (checkAndConsumeQuota as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      reason: "quota_reached",
    });

    const res = await POST(makeRequest({ text: "Bonjour" }, "valid-token"));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toBe("quota_reached");
    expect(data.payUrl).toBe("/api/pay");
  });
});
