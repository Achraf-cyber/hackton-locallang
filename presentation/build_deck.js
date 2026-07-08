/* Farafina AI — pitch deck generator (non-technical: problem + solution). */
const pptx = require("pptxgenjs");
const p = new pptx();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "Farafina AI";
p.title = "Farafina AI — Breaking the language barrier";

const W = 13.33, H = 7.5;

// ---- Palette (Forest / brand green) ----
const C = {
  forest: "0B663E",
  deep: "064026",
  moss: "159B66",
  mint: "1AB578",
  gold: "D97706",
  gold2: "F59E0B",
  bg: "F4F8F6",
  card: "FFFFFF",
  ink: "121E18",
  mut: "4A5C52",
  soft: "E5F6EE",
  white: "FFFFFF",
  line: "D8E7DF",
};
const SANS = "Calibri", SERIF = "Cambria";

// ---- helpers ----
function bgFill(slide, color) {
  slide.background = { color };
}
function circleIcon(slide, x, y, d, glyph, fill, gcolor, gsize) {
  slide.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" } });
  slide.addText(glyph, { x, y, w: d, h: d, align: "center", valign: "middle", fontFace: SANS, fontSize: gsize || 20, bold: true, color: gcolor || C.white });
}
function card(slide, x, y, w, h, fill) {
  slide.addShape(p.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill || C.card }, line: { type: "none" },
    shadow: { type: "outer", color: "0B663E", blur: 9, offset: 3, angle: 90, opacity: 0.12 },
  });
}
function kicker(slide, text, x, y, color) {
  slide.addText(text.toUpperCase(), { x, y, w: 8, h: 0.32, margin: 0, fontFace: SANS, bold: true, fontSize: 12, charSpacing: 3, color: color || C.moss, align: "left" });
}
function pageNum(slide, n) {
  slide.addText(String(n).padStart(2, "0"), { x: W - 1.0, y: H - 0.55, w: 0.6, h: 0.3, margin: 0, align: "right", fontFace: SANS, fontSize: 10, color: C.mut });
  slide.addText("Farafina AI", { x: 0.6, y: H - 0.55, w: 3, h: 0.3, margin: 0, align: "left", fontFace: SANS, fontSize: 10, bold: true, color: C.mut });
}
// subtle repeated motif: a soft ring in a corner
function motif(slide, dark) {
  slide.addShape(p.shapes.OVAL, { x: W - 1.6, y: -1.6, w: 3.2, h: 3.2, fill: { type: "none" }, line: { color: dark ? "1AB578" : "CDEBDD", width: 2, transparency: dark ? 40 : 0 } });
  slide.addShape(p.shapes.OVAL, { x: W - 1.05, y: -1.05, w: 2.1, h: 2.1, fill: { type: "none" }, line: { color: dark ? "159B66" : "E5F6EE", width: 1.5 } });
}

// =====================================================================
// 1 — TITLE (dark)
// =====================================================================
let s = p.addSlide(); bgFill(s, C.deep); motif(s, true);
s.addShape(p.shapes.OVAL, { x: -1.4, y: H - 2.2, w: 4, h: 4, fill: { color: "0B663E", transparency: 55 }, line: { type: "none" } });
circleIcon(s, 0.9, 0.85, 0.9, "◈", C.mint, C.deep, 30);
s.addText("FARAFINA AI", { x: 1.95, y: 0.95, w: 6, h: 0.6, margin: 0, fontFace: SANS, bold: true, fontSize: 18, charSpacing: 4, color: C.white, valign: "middle" });
s.addText("Breaking the\nlanguage barrier.", { x: 0.9, y: 2.5, w: 9.5, h: 2.2, margin: 0, fontFace: SERIF, bold: true, fontSize: 54, color: C.white, lineSpacingMultiple: 0.95 });
s.addText("Sovereign AI that lets everyone use technology in the language they actually speak — Dioula and Mooré.", { x: 0.95, y: 4.75, w: 8.6, h: 1.0, margin: 0, fontFace: SANS, fontSize: 18, color: "CFE9DA", lineSpacingMultiple: 1.1 });
s.addText([
  { text: "Burkina Faso", options: { bold: true } },
  { text: "   ·   Voice-first   ·   Web + Telegram", options: {} },
], { x: 0.95, y: 6.4, w: 10, h: 0.4, margin: 0, fontFace: SANS, fontSize: 14, color: C.mint });

// =====================================================================
// 2 — ONE LINE (light, big statement)
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); motif(s, false); pageNum(s, 2);
kicker(s, "The idea in one sentence", 0.9, 0.8);
s.addText([
  { text: "Millions of people are locked out of the digital world ", options: { color: C.ink } },
  { text: "not because they can’t use it — but because it doesn’t speak their language.", options: { color: C.forest, bold: true } },
], { x: 0.9, y: 1.5, w: 11.4, h: 3.2, margin: 0, fontFace: SERIF, fontSize: 34, lineSpacingMultiple: 1.15 });
s.addText("Farafina AI removes that barrier for Dioula and Mooré speakers — in text and in voice.", { x: 0.9, y: 5.1, w: 11, h: 0.8, margin: 0, fontFace: SANS, fontSize: 18, color: C.mut });

// =====================================================================
// 3 — THE PROBLEM (context)
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 3);
kicker(s, "The problem", 0.9, 0.7);
s.addText("Technology speaks French. Most people don’t.", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 34, color: C.ink });
const probs = [
  ["\u{1F5E3}", "A spoken-language country", "Daily life in Burkina Faso happens in Dioula and Mooré — at the market, at home, in the community."],
  ["\u{1F4F1}", "A written-French internet", "Apps, forms and official services are almost all in French, a language many people never learned to read."],
  ["\u{1F6AB}", "So people are shut out", "Anything that requires reading French — a form, an app, a document — becomes a wall."],
];
probs.forEach((it, i) => {
  const x = 0.9 + i * 4.03;
  card(s, x, 2.25, 3.75, 4.35);
  circleIcon(s, x + 0.35, 2.65, 0.85, it[0], C.soft, C.forest, 26);
  s.addText(it[1], { x: x + 0.35, y: 3.75, w: 3.1, h: 0.9, margin: 0, fontFace: SANS, bold: true, fontSize: 18, color: C.ink });
  s.addText(it[2], { x: x + 0.35, y: 4.7, w: 3.1, h: 1.7, margin: 0, fontFace: SANS, fontSize: 14.5, color: C.mut, lineSpacingMultiple: 1.12 });
});

// =====================================================================
// 4 — STAT CALLOUTS
// =====================================================================
s = p.addSlide(); bgFill(s, C.forest); motif(s, true); pageNum(s, 4);
kicker(s, "Why it matters", 0.9, 0.7, "9FE3BF");
s.addText("The scale of the gap", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 34, color: C.white });
const stats = [
  ["20M+", "people in Burkina Faso", "mostly speaking local languages every day"],
  ["2", "of the most spoken tongues", "Mooré and Dioula — under-served by modern tech"],
  ["Low", "written-French literacy", "spoken understanding is far higher than reading"],
];
stats.forEach((st, i) => {
  const x = 0.9 + i * 4.03;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.4, w: 3.75, h: 3.7, rectRadius: 0.12, fill: { color: "0E7D4D" }, line: { type: "none" } });
  s.addText(st[0], { x: x + 0.3, y: 2.75, w: 3.15, h: 1.4, margin: 0, fontFace: SERIF, bold: true, fontSize: 60, color: C.mint });
  s.addText(st[1], { x: x + 0.3, y: 4.25, w: 3.15, h: 0.7, margin: 0, fontFace: SANS, bold: true, fontSize: 17, color: C.white });
  s.addText(st[2], { x: x + 0.3, y: 4.95, w: 3.15, h: 1.0, margin: 0, fontFace: SANS, fontSize: 13.5, color: "CFE9DA", lineSpacingMultiple: 1.1 });
});
s.addText("Illustrative figures for context — the point is the gap, not the decimals.", { x: 0.9, y: 6.35, w: 11, h: 0.4, margin: 0, fontFace: SANS, italic: true, fontSize: 12, color: "9FE3BF" });

// =====================================================================
// 5 — WHO IS AFFECTED (personas)
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 5);
kicker(s, "Who this is for", 0.9, 0.7);
s.addText("Real people, everyday needs", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 34, color: C.ink });
const people = [
  ["\u{1F469}‍\u{1F33E}", "The trader", "Wants to understand a letter from the bank or a government notice — without finding someone to translate."],
  ["\u{1F468}‍\u{1F9B3}", "The elder", "Speaks Mooré fluently, never learned to read French. Needs to hear information, not read it."],
  ["\u{1F9D1}‍\u{1F393}", "The young parent", "Needs an official document but can’t navigate a French-only government website."],
];
people.forEach((it, i) => {
  const x = 0.9 + i * 4.03;
  card(s, x, 2.2, 3.75, 4.4);
  circleIcon(s, x + 0.35, 2.6, 0.95, it[0], C.soft, C.forest, 30);
  s.addText(it[1], { x: x + 0.35, y: 3.75, w: 3.1, h: 0.6, margin: 0, fontFace: SANS, bold: true, fontSize: 19, color: C.forest });
  s.addText(it[2], { x: x + 0.35, y: 4.4, w: 3.1, h: 2.0, margin: 0, fontFace: SANS, fontSize: 15, color: C.mut, lineSpacingMultiple: 1.15 });
});

// =====================================================================
// 6 — THE BARRIER IN DAILY LIFE
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 6);
kicker(s, "The barrier, concretely", 0.9, 0.7);
s.addText("What “locked out” looks like", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 34, color: C.ink });
card(s, 0.9, 2.2, 11.5, 4.35, C.card);
const rows = [
  ["\u{1F4C4}", "A document arrives", "It’s in French. You can’t read it, so you don’t know if it’s urgent, a bill, or a scam."],
  ["\u{1F3DB}️", "A service is needed", "Getting an official paper means a French website and forms — impossible to do alone."],
  ["\u{1F9CD}", "So you wait — and pay", "You depend on someone else’s time, money and goodwill for things others do in seconds."],
];
rows.forEach((r, i) => {
  const y = 2.6 + i * 1.28;
  circleIcon(s, 1.3, y, 0.8, r[0], C.soft, C.forest, 24);
  s.addText(r[1], { x: 2.35, y: y + 0.02, w: 3.6, h: 0.78, margin: 0, fontFace: SANS, bold: true, fontSize: 18, color: C.ink, valign: "middle" });
  s.addText(r[2], { x: 6.05, y: y + 0.02, w: 6.0, h: 0.78, margin: 0, fontFace: SANS, fontSize: 14.5, color: C.mut, valign: "middle", lineSpacingMultiple: 1.05 });
  if (i < 2) s.addShape(p.shapes.LINE, { x: 2.35, y: y + 1.02, w: 9.7, h: 0, line: { color: C.line, width: 1 } });
});

// =====================================================================
// 7 — WHY EXISTING TOOLS FAIL
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 7);
kicker(s, "Why nothing already fixes this", 0.9, 0.7);
s.addText("The usual tools don’t reach these languages", { x: 0.9, y: 1.05, w: 11.6, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.ink });
const fails = [
  ["Mainstream translators", "Barely support Dioula and Mooré — quality is poor or the language simply isn’t there."],
  ["Everything assumes reading", "Chatbots and apps expect you to read and type. That excludes non-readers entirely."],
  ["Built elsewhere, for elsewhere", "Global products aren’t designed for local realities, voices, or data sovereignty."],
];
fails.forEach((f, i) => {
  const y = 2.25 + i * 1.45;
  card(s, 0.9, y, 11.5, 1.25);
  circleIcon(s, 1.15, y + 0.28, 0.7, "✕", "FDECEA", "B4341F", 20);
  s.addText(f[0], { x: 2.1, y: y + 0.02, w: 3.9, h: 1.2, margin: 0, valign: "middle", fontFace: SANS, bold: true, fontSize: 18, color: C.ink });
  s.addText(f[1], { x: 6.1, y: y + 0.02, w: 6.0, h: 1.2, margin: 0, valign: "middle", fontFace: SANS, fontSize: 15, color: C.mut, lineSpacingMultiple: 1.1 });
});

// =====================================================================
// 8 — INTRODUCING (dark pivot)
// =====================================================================
s = p.addSlide(); bgFill(s, C.deep); motif(s, true); pageNum(s, 8);
s.addShape(p.shapes.OVAL, { x: -1.5, y: H - 2.4, w: 4.2, h: 4.2, fill: { color: "0B663E", transparency: 55 }, line: { type: "none" } });
kicker(s, "The solution", 0.9, 1.1, "9FE3BF");
s.addText("Meet Farafina AI", { x: 0.9, y: 1.55, w: 11, h: 1.0, margin: 0, fontFace: SERIF, bold: true, fontSize: 46, color: C.white });
s.addText([
  { text: "An assistant you talk to in your own language.", options: { bold: true, color: C.white, breakLine: true } },
  { text: "Translate, understand documents, and get things done — by typing or just by speaking.", options: { color: "CFE9DA" } },
], { x: 0.9, y: 2.9, w: 10.5, h: 1.6, margin: 0, fontFace: SANS, fontSize: 22, lineSpacingMultiple: 1.2 });
const tags = ["Dioula", "Mooré", "Voice in, voice out", "Sovereign & local"];
tags.forEach((tg, i) => {
  const x = 0.9 + i * 2.75;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 5.1, w: 2.5, h: 0.75, rectRadius: 0.37, fill: { color: "0E7D4D" }, line: { type: "none" } });
  s.addText(tg, { x, y: 5.1, w: 2.5, h: 0.75, margin: 0, align: "center", valign: "middle", fontFace: SANS, bold: true, fontSize: 14, color: C.white });
});

// =====================================================================
// 9 — THREE PILLARS
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 9);
kicker(s, "What it does", 0.9, 0.7);
s.addText("Three things, one simple assistant", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 32, color: C.ink });
const pillars = [
  ["\u{1F504}", "Translate", "French ↔ Dioula and Mooré, instantly — the words people actually need."],
  ["\u{1F4D6}", "Understand", "Send a photo or a PDF and get a clear explanation of what it says and means."],
  ["\u{1F50A}", "Speak & listen", "Ask by voice, get answers as a voice note — no reading or typing required."],
];
pillars.forEach((it, i) => {
  const x = 0.9 + i * 4.03;
  card(s, x, 2.2, 3.75, 4.4);
  circleIcon(s, x + 0.35, 2.6, 0.95, it[0], C.forest, C.white, 30);
  s.addText(it[1], { x: x + 0.35, y: 3.8, w: 3.1, h: 0.6, margin: 0, fontFace: SANS, bold: true, fontSize: 21, color: C.forest });
  s.addText(it[2], { x: x + 0.35, y: 4.5, w: 3.1, h: 1.9, margin: 0, fontFace: SANS, fontSize: 15.5, color: C.mut, lineSpacingMultiple: 1.18 });
});

// =====================================================================
// 10 — HOW IT WORKS (3-step flow)
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 10);
kicker(s, "How it works for you", 0.9, 0.7);
s.addText("As easy as sending a message", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 32, color: C.ink });
const steps = [
  ["1", "Choose your language", "Pick Dioula or Mooré once. The assistant remembers."],
  ["2", "Ask your way", "Type, record a voice note, or send a photo / document."],
  ["3", "Get a clear answer", "Back in your language — as text and as audio you can play."],
];
steps.forEach((st, i) => {
  const x = 0.9 + i * 4.03;
  card(s, x, 2.3, 3.75, 3.6);
  s.addShape(p.shapes.OVAL, { x: x + 0.35, y: 2.65, w: 0.95, h: 0.95, fill: { color: C.gold }, line: { type: "none" } });
  s.addText(st[0], { x: x + 0.35, y: 2.65, w: 0.95, h: 0.95, margin: 0, align: "center", valign: "middle", fontFace: SERIF, bold: true, fontSize: 30, color: C.white });
  s.addText(st[1], { x: x + 0.35, y: 3.8, w: 3.1, h: 0.6, margin: 0, fontFace: SANS, bold: true, fontSize: 18, color: C.ink });
  s.addText(st[2], { x: x + 0.35, y: 4.45, w: 3.1, h: 1.3, margin: 0, fontFace: SANS, fontSize: 14.5, color: C.mut, lineSpacingMultiple: 1.15 });
});
// arrows drawn last so the following card never covers them
[0, 1].forEach((i) => {
  const gx = 0.9 + i * 4.03 + 3.75;
  s.addText("→", { x: gx - 0.15, y: 3.55, w: 0.6, h: 0.6, margin: 0, align: "center", valign: "middle", fontFace: SANS, bold: true, fontSize: 22, color: C.moss });
});
s.addText("No manuals. No French. Nothing new to learn.", { x: 0.9, y: 6.25, w: 11, h: 0.5, margin: 0, fontFace: SANS, italic: true, fontSize: 16, color: C.forest });

// =====================================================================
// 11 — CHANNELS (web + telegram)
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 11);
kicker(s, "Where you use it", 0.9, 0.7);
s.addText("We meet people where they already are", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.ink });
const chans = [
  ["\u{1F310}", "On the web", "A clean, mobile-friendly site to translate and read documents — nothing to install."],
  ["✈️", "On Telegram", "The same assistant inside a chat app people already have — voice notes included."],
];
chans.forEach((it, i) => {
  const x = 0.9 + i * 5.85;
  card(s, x, 2.25, 5.55, 4.2);
  circleIcon(s, x + 0.45, 2.7, 1.05, it[0], C.forest, C.white, 32);
  s.addText(it[1], { x: x + 1.75, y: 2.85, w: 3.6, h: 0.8, margin: 0, valign: "middle", fontFace: SANS, bold: true, fontSize: 24, color: C.forest });
  s.addText(it[2], { x: x + 0.45, y: 4.1, w: 4.7, h: 2.0, margin: 0, fontFace: SANS, fontSize: 16.5, color: C.mut, lineSpacingMultiple: 1.2 });
});

// =====================================================================
// 12 — VOICE-FIRST
// =====================================================================
s = p.addSlide(); bgFill(s, C.forest); motif(s, true); pageNum(s, 12);
kicker(s, "The part that changes everything", 0.9, 0.75, "9FE3BF");
s.addText("Built for people who don’t read", { x: 0.9, y: 1.2, w: 11, h: 1.0, margin: 0, fontFace: SERIF, bold: true, fontSize: 36, color: C.white });
s.addText("Every menu, every button and every answer can be heard as a voice note — so you never need to read a single word to use it.", { x: 0.9, y: 2.5, w: 7.4, h: 1.6, margin: 0, fontFace: SANS, fontSize: 20, color: "CFE9DA", lineSpacingMultiple: 1.25 });
const vf = ["Spoken menus that name each option", "Ask by voice, answer by voice", "Numbered buttons matched to the audio"];
vf.forEach((t, i) => {
  const y = 4.35 + i * 0.82;
  circleIcon(s, 0.9, y, 0.55, "✓", C.mint, C.deep, 18);
  s.addText(t, { x: 1.65, y, w: 7.0, h: 0.55, margin: 0, valign: "middle", fontFace: SANS, fontSize: 17, color: C.white });
});
s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 9.1, y: 2.5, w: 3.3, h: 3.9, rectRadius: 0.14, fill: { color: "0E7D4D" }, line: { type: "none" } });
s.addText("\u{1F50A}", { x: 9.1, y: 2.9, w: 3.3, h: 1.4, margin: 0, align: "center", fontFace: SANS, fontSize: 54 });
s.addText("“Press 1 to explain a document, press 2 to request an official paper…”", { x: 9.4, y: 4.2, w: 2.7, h: 2.0, margin: 0, align: "center", fontFace: SANS, italic: true, fontSize: 15, color: "EAF7F0", lineSpacingMultiple: 1.2 });

// =====================================================================
// 13 — USE CASE: understand a document
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 13);
kicker(s, "Use case 1", 0.9, 0.7);
s.addText("“What does this paper say?”", { x: 0.9, y: 1.05, w: 11, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 32, color: C.ink });
const uc1 = [
  ["\u{1F4F7}", "Snap it", "Take a photo of the letter or forward the PDF."],
  ["\u{1F9E0}", "AI reads it", "Farafina understands the document, whatever the layout."],
  ["\u{1F5E3}️", "Hear it explained", "Get a plain-language summary in Dioula or Mooré — spoken."],
];
uc1.forEach((it, i) => {
  const x = 0.9 + i * 4.03;
  card(s, x, 2.3, 3.75, 3.9);
  circleIcon(s, x + 0.35, 2.7, 0.9, it[0], C.soft, C.forest, 28);
  s.addText(it[1], { x: x + 0.35, y: 3.8, w: 3.1, h: 0.6, margin: 0, fontFace: SANS, bold: true, fontSize: 19, color: C.forest });
  s.addText(it[2], { x: x + 0.35, y: 4.45, w: 3.1, h: 1.6, margin: 0, fontFace: SANS, fontSize: 15, color: C.mut, lineSpacingMultiple: 1.15 });
});

// =====================================================================
// 14 — USE CASE: government document end-to-end
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 14);
kicker(s, "Use case 2", 0.9, 0.7);
s.addText("Getting an official document — by chat", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.ink });
s.addText("Example: requesting a criminal-record certificate (casier judiciaire), start to finish, without ever touching a French form.", { x: 0.9, y: 1.95, w: 11.4, h: 0.7, margin: 0, fontFace: SANS, fontSize: 16, color: C.mut });
const flow = [
  ["\u{1F4CE}", "Send your papers", "Photograph your ID documents in the chat."],
  ["\u{1F9E9}", "AI fills the gaps", "It reads what it can and only asks for what’s missing — in your language."],
  ["⚙️", "It does the paperwork", "The request is completed on the service for you."],
  ["\u{1F4C4}", "Receive the result", "Your official récépissé comes back to you in the chat."],
];
flow.forEach((it, i) => {
  const x = 0.9 + i * 2.98;
  card(s, x, 2.85, 2.75, 3.55);
  circleIcon(s, x + 0.9, 3.15, 0.95, it[0], C.forest, C.white, 28);
  s.addText(it[1], { x: x + 0.2, y: 4.25, w: 2.35, h: 0.75, margin: 0, align: "center", fontFace: SANS, bold: true, fontSize: 15.5, color: C.ink });
  s.addText(it[2], { x: x + 0.2, y: 5.0, w: 2.35, h: 1.3, margin: 0, align: "center", fontFace: SANS, fontSize: 13, color: C.mut, lineSpacingMultiple: 1.12 });
  if (i < 3) s.addText("→", { x: x + 2.72, y: 3.9, w: 0.35, h: 0.5, margin: 0, align: "center", valign: "middle", fontFace: SANS, bold: true, fontSize: 22, color: C.moss });
});

// =====================================================================
// 15 — LANGUAGES + growth
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 15);
kicker(s, "Languages", 0.9, 0.7);
s.addText("Starting with two — designed to grow", { x: 0.9, y: 1.05, w: 11.5, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.ink });
const langs = [
  ["Dioula", "Julakan", "Spoken across Burkina Faso, Côte d’Ivoire and Mali."],
  ["Mooré", "Mòoré", "The most widely spoken language in Burkina Faso."],
];
langs.forEach((l, i) => {
  const x = 0.9 + i * 5.85;
  card(s, x, 2.25, 5.55, 2.7);
  s.addText(l[0], { x: x + 0.45, y: 2.55, w: 4.6, h: 0.75, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.forest });
  s.addText(l[1], { x: x + 0.45, y: 3.35, w: 4.6, h: 0.5, margin: 0, fontFace: SANS, bold: true, fontSize: 15, color: C.gold });
  s.addText(l[2], { x: x + 0.45, y: 3.85, w: 4.6, h: 0.9, margin: 0, fontFace: SANS, fontSize: 15, color: C.mut, lineSpacingMultiple: 1.15 });
});
s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: 5.25, w: 11.5, h: 1.35, rectRadius: 0.12, fill: { color: C.soft }, line: { type: "none" } });
s.addText([
  { text: "Next: ", options: { bold: true, color: C.forest } },
  { text: "the same approach extends to more of West Africa’s languages — the hard part (voice + local models) is already built.", options: { color: C.mut } },
], { x: 1.25, y: 5.25, w: 10.8, h: 1.35, margin: 0, valign: "middle", fontFace: SANS, fontSize: 16, lineSpacingMultiple: 1.15 });

// =====================================================================
// 16 — SOVEREIGN AI
// =====================================================================
s = p.addSlide(); bgFill(s, C.deep); motif(s, true); pageNum(s, 16);
kicker(s, "Why sovereign", 0.9, 0.75, "9FE3BF");
s.addText("Made for us, run by us", { x: 0.9, y: 1.2, w: 11, h: 1.0, margin: 0, fontFace: SERIF, bold: true, fontSize: 38, color: C.white });
const sov = [
  ["\u{1F91D}", "Built around local languages", "Not a bolt-on to a foreign product — these languages come first."],
  ["\u{1F510}", "Data that stays close", "Designed so people’s words and documents aren’t handed to distant platforms."],
  ["\u{1F331}", "Local capability", "Know-how and infrastructure that belong to the region, not rented from elsewhere."],
];
sov.forEach((it, i) => {
  const y = 2.6 + i * 1.3;
  circleIcon(s, 0.9, y, 0.85, it[0], "0E7D4D", C.mint, 26);
  s.addText(it[1], { x: 2.0, y: y - 0.02, w: 4.4, h: 0.9, margin: 0, valign: "middle", fontFace: SANS, bold: true, fontSize: 19, color: C.white });
  s.addText(it[2], { x: 6.5, y: y - 0.02, w: 6.0, h: 0.9, margin: 0, valign: "middle", fontFace: SANS, fontSize: 15, color: "CFE9DA", lineSpacingMultiple: 1.1 });
});

// =====================================================================
// 17 — IMPACT grid
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 17);
kicker(s, "The impact", 0.9, 0.7);
s.addText("What changes when the barrier is gone", { x: 0.9, y: 1.05, w: 11.6, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 30, color: C.ink });
const imp = [
  ["\u{1F4C8}", "Independence", "People handle their own documents and services — no middleman."],
  ["⚖️", "Fairer access", "Public services become reachable for everyone, not only French readers."],
  ["⏱️", "Time & money saved", "Minutes instead of trips, favors and fees."],
  ["\u{1F5FA}️", "Dignity & inclusion", "Your language is treated as first-class in the digital world."],
];
imp.forEach((it, i) => {
  const x = 0.9 + (i % 2) * 5.85;
  const y = 2.2 + Math.floor(i / 2) * 2.2;
  card(s, x, y, 5.55, 1.95);
  circleIcon(s, x + 0.35, y + 0.5, 0.9, it[0], C.soft, C.forest, 26);
  s.addText(it[1], { x: x + 1.5, y: y + 0.25, w: 3.8, h: 0.55, margin: 0, fontFace: SANS, bold: true, fontSize: 19, color: C.forest });
  s.addText(it[2], { x: x + 1.5, y: y + 0.82, w: 3.85, h: 0.95, margin: 0, fontFace: SANS, fontSize: 14.5, color: C.mut, lineSpacingMultiple: 1.12 });
});

// =====================================================================
// 18 — VISION / roadmap
// =====================================================================
s = p.addSlide(); bgFill(s, C.bg); pageNum(s, 18);
kicker(s, "Where we’re going", 0.9, 0.7);
s.addText("From a translator to a companion for daily life", { x: 0.9, y: 1.05, w: 11.8, h: 0.9, margin: 0, fontFace: SERIF, bold: true, fontSize: 28, color: C.ink });
const road = [
  ["Today", "Translate, understand documents, and request a first official document — by text or voice."],
  ["Next", "More official services and more languages, same simple voice-first experience."],
  ["The vision", "A trusted assistant that helps anyone access information, rights and services in their own tongue."],
];
road.forEach((r, i) => {
  const y = 2.35 + i * 1.4;
  s.addShape(p.shapes.OVAL, { x: 1.0, y: y + 0.1, w: 0.34, h: 0.34, fill: { color: i === 2 ? C.gold : C.forest }, line: { type: "none" } });
  if (i < 2) s.addShape(p.shapes.LINE, { x: 1.17, y: y + 0.44, w: 0, h: 1.06, line: { color: C.line, width: 2 } });
  s.addText(r[0], { x: 1.7, y: y - 0.05, w: 2.5, h: 0.5, margin: 0, fontFace: SANS, bold: true, fontSize: 20, color: i === 2 ? C.gold : C.forest });
  s.addText(r[1], { x: 4.4, y: y - 0.05, w: 8.0, h: 1.0, margin: 0, fontFace: SANS, fontSize: 16, color: C.mut, lineSpacingMultiple: 1.15 });
});

// =====================================================================
// 19 — TRY IT NOW (links)
// =====================================================================
s = p.addSlide(); bgFill(s, C.forest); motif(s, true); pageNum(s, 19);
kicker(s, "Try it", 0.9, 0.75, "9FE3BF");
s.addText("See it for yourself", { x: 0.9, y: 1.2, w: 11, h: 1.0, margin: 0, fontFace: SERIF, bold: true, fontSize: 40, color: C.white });
const links = [
  ["\u{1F310}", "Web app", "hackton-locallang.vercel.app"],
  ["✈️", "Telegram bot", "@Africalangbot"],
  ["\u{1F4BB}", "Source code", "github.com/Achraf-cyber/hackton-locallang"],
];
links.forEach((l, i) => {
  const y = 2.75 + i * 1.2;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.9, y, w: 8.2, h: 1.0, rectRadius: 0.12, fill: { color: "0E7D4D" }, line: { type: "none" } });
  circleIcon(s, 1.15, y + 0.18, 0.64, l[0], C.mint, C.deep, 20);
  s.addText(l[1], { x: 2.05, y: y + 0.12, w: 3.0, h: 0.76, margin: 0, valign: "middle", fontFace: SANS, bold: true, fontSize: 17, color: C.white });
  s.addText(l[2], { x: 4.9, y: y + 0.12, w: 4.05, h: 0.76, margin: 0, valign: "middle", fontFace: SANS, fontSize: 15, color: "CFE9DA" });
});
s.addText("Full link list in LINKS.md", { x: 9.5, y: 5.6, w: 3.2, h: 0.4, margin: 0, align: "center", fontFace: SANS, italic: true, fontSize: 12, color: "9FE3BF" });

// =====================================================================
// 20 — CLOSING
// =====================================================================
s = p.addSlide(); bgFill(s, C.deep); motif(s, true);
s.addShape(p.shapes.OVAL, { x: -1.4, y: H - 2.2, w: 4, h: 4, fill: { color: "0B663E", transparency: 55 }, line: { type: "none" } });
circleIcon(s, 0.9, 0.9, 0.9, "◈", C.mint, C.deep, 30);
s.addText("Everyone deserves technology\nthat speaks their language.", { x: 0.9, y: 2.6, w: 11.3, h: 2.0, margin: 0, fontFace: SERIF, bold: true, fontSize: 40, color: C.white, lineSpacingMultiple: 1.05 });
s.addText("Farafina AI — Dioula & Mooré, by voice and by text.", { x: 0.95, y: 4.85, w: 10, h: 0.6, margin: 0, fontFace: SANS, fontSize: 19, color: "CFE9DA" });
s.addText("Thank you.", { x: 0.95, y: 5.7, w: 6, h: 0.7, margin: 0, fontFace: SANS, bold: true, fontSize: 22, color: C.mint });

p.writeFile({ fileName: "Farafina-AI.pptx" }).then((f) => console.log("WROTE", f)).catch((e) => { console.error(e); process.exit(1); });
