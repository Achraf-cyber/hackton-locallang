import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../lib/llm", () => ({
  simplify: vi.fn(async () => "texte simplifié"),
  answerQuestion: vi.fn(async () => "réponse simple"),
  readDocumentImage: vi.fn(async () => "explication"),
}));

vi.mock("../lib/modelService", () => ({
  localize: vi.fn(async () => ({ translated: "TRAD", audioUrl: "http://x/a.wav" })),
  toFrench: vi.fn(async () => ({ textFr: "fr" })),
  transcribe: vi.fn(async () => ({ text: "txt" })),
}));

import { POST } from "../app/api/text/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/text", () => {
  it("200 + clés attendues quand lang est fourni", async () => {
    const res = await POST(makeRequest({ text: "Bonjour", lang: "dyu" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("translated");
    expect(data).toHaveProperty("audioUrl");
    expect(data).toHaveProperty("timings");
  });

  it("400 quand lang est absent", async () => {
    const res = await POST(makeRequest({ text: "Bonjour" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });
});
