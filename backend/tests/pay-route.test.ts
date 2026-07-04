import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../lib/db", () => {
  const payment = {
    create: vi.fn(async () => ({ id: "payment-1" })),
    update: vi.fn(async () => ({ id: "payment-1", status: "confirmed" })),
  };
  const user = {
    update: vi.fn(async () => ({ id: "user-1", paidCreditsLeft: 10 })),
  };
  return { prisma: { payment, user } };
});

import { POST } from "../app/api/pay/route";
import { prisma } from "../lib/db";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/pay", () => {
  it("incrémente paidCreditsLeft et renvoie le statut confirmé", async () => {
    const res = await POST(
      makeRequest({ userId: "user-1", amountFcfa: 100, creditsRequested: 10 }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "confirmed", paidCreditsLeft: 10 });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          provider: "mock",
          amountFcfa: 100,
          creditsGranted: 10,
          status: "pending",
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { paidCreditsLeft: { increment: 10 } },
      }),
    );
  });

  it("400 si le corps est invalide", async () => {
    const res = await POST(makeRequest({ userId: "user-1" }));
    expect(res.status).toBe(400);
  });
});
