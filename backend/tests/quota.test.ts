import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

vi.mock("../lib/env", () => ({
  getEnv: vi.fn(() => ({ DAILY_FREE_LIMIT: 3 })),
}));

vi.mock("../lib/db", () => {
  const user = {
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
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

describe("checkAndConsumeQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloque après DAILY_FREE_LIMIT requêtes pour un utilisateur sans organisation", async () => {
    const user = makeUser({ requestsToday: 3, quotaResetAt: new Date(), paidCreditsLeft: 0 });

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: false, reason: "quota_reached" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("ne bloque jamais un utilisateur rattaché à une organisation, quel que soit requestsToday", async () => {
    const user = makeUser({ organizationId: "org-1", requestsToday: 999 });

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("les crédits payants prolongent l'accès une fois le quota gratuit épuisé", async () => {
    const user = makeUser({ requestsToday: 3, quotaResetAt: new Date(), paidCreditsLeft: 5 });

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ paidCreditsLeft: { decrement: 1 } }),
      }),
    );
  });

  it("autorise et incrémente requestsToday quand le quota gratuit n'est pas épuisé", async () => {
    const user = makeUser({ requestsToday: 1, quotaResetAt: new Date() });

    const result = await checkAndConsumeQuota(user);

    expect(result).toEqual({ allowed: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ requestsToday: 2 }),
      }),
    );
  });
});
