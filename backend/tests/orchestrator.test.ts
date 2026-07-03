import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/llm", () => ({
  simplify: vi.fn(async () => "texte simplifié"),
  answerQuestion: vi.fn(async () => "réponse simple"),
  readDocumentImage: vi.fn(async () => "explication du document"),
}));

vi.mock("../lib/modelService", () => ({
  localize: vi.fn(async () => ({ translated: "TRAD", audioUrl: "http://x/a.wav" })),
  toFrench: vi.fn(async () => ({ textFr: "texte français" })),
  transcribe: vi.fn(async () => ({ text: "texte transcrit" })),
}));

import * as llm from "../lib/llm";
import * as modelService from "../lib/modelService";
import { explainDocument, voiceToVoice } from "../lib/orchestrator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orchestrator.explainDocument", () => {
  it("appelle simplify PUIS localize, dans cet ordre", async () => {
    const out = await explainDocument("Texte administratif complexe.", "dyu");

    expect(llm.simplify).toHaveBeenCalledOnce();
    expect(modelService.localize).toHaveBeenCalledWith("texte simplifié", "dyu");

    const simplifyOrder = (llm.simplify as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const localizeOrder = (modelService.localize as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(simplifyOrder).toBeLessThan(localizeOrder);

    expect(out.result.translated).toBe("TRAD");
    expect(out.result.audioUrl).toBe("http://x/a.wav");
  });
});

describe("orchestrator.voiceToVoice", () => {
  it("enchaîne transcribe -> toFrench -> answer -> localize", async () => {
    const out = await voiceToVoice(Buffer.from([1, 2, 3]), "a.webm", "mos");

    expect(modelService.transcribe).toHaveBeenCalledOnce();
    expect(modelService.toFrench).toHaveBeenCalledWith("texte transcrit", "mos");
    expect(llm.answerQuestion).toHaveBeenCalledWith("texte français");
    expect(out.result.transcript).toBe("texte transcrit");
  });
});
