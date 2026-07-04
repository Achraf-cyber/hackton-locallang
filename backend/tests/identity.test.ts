import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1", organizationId: null, preferredLang: null };

vi.mock("../lib/db", () => {
  const userIdentity = {
    findUnique: vi.fn(),
  };
  const user = {
    create: vi.fn(async () => mockUser),
  };
  const userIdentityTx = {
    create: vi.fn(async () => ({ id: "identity-1" })),
  };
  const tx = {
    user: { create: vi.fn(async () => mockUser) },
    userIdentity: userIdentityTx,
  };
  const prisma = {
    userIdentity,
    user,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };
  return { prisma };
});

import { resolveUser } from "../lib/identity";
import { prisma } from "../lib/db";

describe("resolveUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crée un nouvel utilisateur au premier contact (channel+value)", async () => {
    (prisma.userIdentity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const user = await resolveUser("telegram", "12345");

    expect(user).toEqual(mockUser);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("renvoie le même utilisateur au second contact avec la même identité", async () => {
    (prisma.userIdentity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "identity-1",
      userId: "user-1",
      channel: "telegram",
      value: "12345",
      user: mockUser,
    });

    const user = await resolveUser("telegram", "12345");

    expect(user).toEqual(mockUser);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
