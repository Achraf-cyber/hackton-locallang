import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

vi.mock("../lib/env", () => ({
  getEnv: vi.fn(() => ({ DAILY_FREE_LIMIT: 3 })),
}));

vi.mock("../lib/db", () => {
  const user = {
    updateMany: vi.fn(),
  };
  return { prisma: { user } };
});

import { checkAndConsumeQuota } from "../lib/quota";
import { prisma } from "../lib/db";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    organizationId: null,
    preferredLang: null,
    tier: "free",
    requestsToday: 0,
    quotaResetAt: new Date(),
    paidCreditsLeft: 0,
    createdAt: new Date(),
    ...overrides,
  } as User;
}

/** Configure le mock updateMany pour renvoyer un count donné, dans l'ordre des appels. */
function mockUpdateManyCounts(...counts: number[]): void {
  const updateMany = prisma.user.updateMany as ReturnType<typeof vi.fn>;
  for (const count of counts) {
    updateMany.mockResolvedValueOnce({ count });
  }
}

describe("checkAndConsumeQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloque après DAILY_FREE_LIMIT requêtes pour un utilisateur sans organisation", async () => {
    const user = makeUser({ requestsToday: 3, quotaResetAt: new Date(), paidCreditsLeft: 0 });
    // updateMany conditionnel (requestsToday < limite) ne touche aucune ligne, puis
    // updateMany conditionnel (paidCreditsLeft > 0) non plus.
    mockUpdateManyCounts(0, 0);

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: false, reason: "quota_reached" });
  });

  it("ne bloque jamais un utilisateur rattaché à une organisation, quel que soit requestsToday", async () => {
    const user = makeUser({ organizationId: "org-1", requestsToday: 999 });

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("les crédits payants prolongent l'accès une fois le quota gratuit épuisé", async () => {
    const user = makeUser({ requestsToday: 3, quotaResetAt: new Date(), paidCreditsLeft: 5 });
    mockUpdateManyCounts(0, 1); // quota gratuit épuisé (0 ligne), crédit payant consommé (1 ligne)

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "user-1", paidCreditsLeft: { gt: 0 } },
        data: { paidCreditsLeft: { decrement: 1 } },
      }),
    );
  });

  it("autorise et incrémente requestsToday quand le quota gratuit n'est pas épuisé", async () => {
    const user = makeUser({ requestsToday: 1, quotaResetAt: new Date() });
    mockUpdateManyCounts(1); // increment conditionnel réussi

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", requestsToday: { lt: 3 } },
        data: { requestsToday: { increment: 1 } },
      }),
    );
  });

  it("réinitialise requestsToday de façon conditionnelle quand quotaResetAt date d'avant minuit UTC", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const user = makeUser({ requestsToday: 3, quotaResetAt: yesterday });
    mockUpdateManyCounts(0, 1); // reset (count ignoré), puis increment réussi

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    const updateMany = prisma.user.updateMany as ReturnType<typeof vi.fn>;
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "user-1", quotaResetAt: { lt: expect.any(Date) } },
      data: { requestsToday: 0 },
    });
  });
});
