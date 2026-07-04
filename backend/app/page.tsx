"use client";

import { useEffect, useRef, useState } from "react";
import AudioPlayer from "./components/AudioPlayer";
import styles from "./page.module.css";

type Lang = "dyu" | "mos";
type Tab = "voice" | "document" | "text" | "chat";

interface ApiResult {
  translated?: string;
  audioUrl?: string;
  transcript?: string;
  error?: string;
  message?: string;
  payUrl?: string;
}

const STATUS_MESSAGES = [
  "On écoute...",
  "On traduit...",
  "On prépare la réponse...",
  "On génère la voix...",
];

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text?: string;
  audioUrl?: string;
  pending?: boolean;
  error?: string;
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function postJson(url: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return (await res.json()) as ApiResult;
}

async function postForm(url: string, form: FormData): Promise<ApiResult> {
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
  return (await res.json()) as ApiResult;
}

const WEB_USER_ID_STORAGE_KEY = "lldp_web_user_id";

/**
 * Enregistre l'utilisateur web par email (pose un cookie de session signé
 * côté serveur) afin de donner une identité stable pour le suivi de quota et
 * le paiement. Sans cet enregistrement, l'usager reste anonyme et son quota
 * n'est pas suivi (voir commentaire dans app/api/text/route.ts). L'userId
 * renvoyé est aussi gardé en localStorage pour pouvoir appeler /api/pay
 * (qui a besoin d'un userId explicite, indépendamment du cookie).
 */
async function registerEmail(email: string): Promise<string | null> {
  const res = await fetch("/api/register-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  const data = (await res.json()) as { userId?: string };
  if (data.userId) {
    localStorage.setItem(WEB_USER_ID_STORAGE_KEY, data.userId);
    return data.userId;
  }
  return null;
}

/** MOCK — voir app/api/pay/route.ts. Achète 10 requêtes de plus pour 100 FCFA. */
async function payForCredits(): Promise<{ status: string; paidCreditsLeft: number } | null> {
  const userId = localStorage.getItem(WEB_USER_ID_STORAGE_KEY);
  if (!userId) return null;
  const res = await fetch("/api/pay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, amountFcfa: 100, creditsRequested: 10 }),
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as { status: string; paidCreditsLeft: number };
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("dyu");
  const [tab, setTab] = useState<Tab>("voice");
  const [loading, setLoading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [payingForCredits, setPayingForCredits] = useState(false);
  // Lazy initializer (pas un effect) : simple lecture synchrone du
  // localStorage, aucun abonnement externe requis.
  const [showEmailModal, setShowEmailModal] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem(WEB_USER_ID_STORAGE_KEY),
  );
  const [emailInput, setEmailInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [docIsPdf, setDocIsPdf] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handlePayForCredits() {
    setPayingForCredits(true);
    try {
      const res = await payForCredits();
      if (res?.status === "confirmed") {
        setResult(null);
        if (lastAction) lastAction();
      }
    } finally {
      setPayingForCredits(false);
    }
  }

  async function run(action: () => Promise<ApiResult>) {
    setStatusIndex(0);
    setLoading(true);
    setResult(null);
    setLastAction(() => () => run(action));
    try {
      const out = await action();
      setResult(out);
    } catch (err) {
      setResult({ error: (err as Error).message || "Erreur inconnue." });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setDocPreview(null);
    setDocName(null);
    setDocIsPdf(false);
    setTextInput("");
  }

  function startRecording(onStop: (blob: Blob) => void) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          onStop(new Blob(chunksRef.current, { type: "audio/webm" }));
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setRecordSeconds(0);
        setRecording(true);
      })
      .catch(() => {
        setResult({ error: "Impossible d'accéder au microphone." });
      });
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function handleVoiceSubmit() {
    startRecording((blob) => {
      const form = new FormData();
      form.append("file", blob, "question.webm");
      form.append("lang", lang);
      run(() => postForm("/api/voice", form));
    });
  }

  function handleDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocName(file.name);
    setDocIsPdf(file.type === "application/pdf");
    setDocPreview(file.type === "application/pdf" ? null : URL.createObjectURL(file));
    const form = new FormData();
    form.append("file", file);
    form.append("lang", lang);
    run(() => postForm("/api/photo", form));
    e.target.value = "";
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    run(() => postJson("/api/text", { text: textInput, lang, mode: "answer" }));
  }

  function handleChatTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    const userMsg: ChatMessage = { id: newId(), role: "user", text };
    const aiMsg: ChatMessage = { id: newId(), role: "ai", pending: true };
    setChatMessages((m) => [...m, userMsg, aiMsg]);

    postJson("/api/text", { text, lang, mode: "answer" })
      .then((out) => {
        setChatMessages((m) =>
          m.map((msg) =>
            msg.id === aiMsg.id
              ? { ...msg, pending: false, text: out.translated, audioUrl: out.audioUrl, error: out.error }
              : msg,
          ),
        );
      })
      .catch((err) => {
        setChatMessages((m) =>
          m.map((msg) =>
            msg.id === aiMsg.id ? { ...msg, pending: false, error: (err as Error).message } : msg,
          ),
        );
      });
  }

  function handleChatVoice() {
    startRecording((blob) => {
      const userMsg: ChatMessage = { id: newId(), role: "user", pending: true, text: "🎤 message vocal" };
      const aiMsg: ChatMessage = { id: newId(), role: "ai", pending: true };
      setChatMessages((m) => [...m, userMsg, aiMsg]);

      const form = new FormData();
      form.append("file", blob, "question.webm");
      form.append("lang", lang);

      postForm("/api/voice", form)
        .then((out) => {
          setChatMessages((m) =>
            m.map((msg) => {
              if (msg.id === userMsg.id) {
                return { ...msg, pending: false, text: out.transcript || "🎤 message vocal" };
              }
              if (msg.id === aiMsg.id) {
                return { ...msg, pending: false, text: out.translated, audioUrl: out.audioUrl, error: out.error };
              }
              return msg;
            }),
          );
        })
        .catch((err) => {
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsg.id ? { ...msg, pending: false, error: (err as Error).message } : msg,
            ),
          );
        });
    });
  }

  const showResultArea = tab !== "chat" && (loading || result);

  return (
    <div className={styles.page}>
      <div className={styles.blobOne} aria-hidden />
      <div className={styles.blobTwo} aria-hidden />

      <main className={styles.main}>
        <header className={styles.header}>
          <span className={styles.mascot} aria-hidden>
            🗣️
          </span>
          <h1 className={styles.title}>Comment puis-je vous aider ?</h1>
          <p className={styles.subtitle}>Parlez, montrez un document, ou écrivez.</p>
        </header>

        <div className={styles.langPicker} role="group" aria-label="Choix de la langue">
          <button
            type="button"
            className={lang === "dyu" ? styles.langActive : styles.langButton}
            onClick={() => setLang("dyu")}
          >
            <span className={styles.langDot} />
            Dioula
          </button>
          <button
            type="button"
            className={lang === "mos" ? styles.langActive : styles.langButton}
            onClick={() => setLang("mos")}
          >
            <span className={styles.langDot} />
            Mooré
          </button>
        </div>

        <nav className={styles.tabs} role="tablist" aria-label="Mode de saisie">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "voice"}
            className={tab === "voice" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("voice");
              reset();
            }}
          >
            🎤<span>Voix</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "document"}
            className={tab === "document" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("document");
              reset();
            }}
          >
            📄<span>Document</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "text"}
            className={tab === "text" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("text");
              reset();
            }}
          >
            ⌨️<span>Texte</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chat"}
            className={tab === "chat" ? styles.tabActive : styles.tab}
            onClick={() => setTab("chat")}
          >
            💬<span>Discuter</span>
          </button>
        </nav>

        {tab !== "chat" && (
          <section className={styles.card}>
            {tab === "voice" && (
              <div className={styles.voicePanel}>
                <button
                  type="button"
                  className={recording ? styles.micButtonActive : styles.micButton}
                  disabled={loading}
                  onClick={recording ? stopRecording : handleVoiceSubmit}
                  aria-label={recording ? "Arrêter l'enregistrement" : "Commencer à parler"}
                >
                  {recording && <span className={styles.pulseRing} />}
                  <span className={styles.micIcon}>{recording ? "⏹️" : "🎤"}</span>
                </button>
                <p className={styles.voiceHint}>
                  {recording ? `Je vous écoute... ${formatSeconds(recordSeconds)}` : "Appuyez pour parler"}
                </p>
              </div>
            )}

            {tab === "document" && (
              <div className={styles.photoPanel}>
                {docPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not optimizable
                  <img src={docPreview} alt="Aperçu du document" className={styles.photoPreview} />
                ) : docIsPdf ? (
                  <div className={styles.pdfPreview}>
                    <span className={styles.pdfIcon}>📕</span>
                    <span className={styles.pdfName}>{docName}</span>
                  </div>
                ) : (
                  <label className={styles.dropzone}>
                    <span className={styles.dropzoneIcon}>📄</span>
                    <span>Prendre une photo ou choisir un fichier</span>
                    <span className={styles.dropzoneHint}>Image ou PDF</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      hidden
                      disabled={loading}
                      onChange={handleDocument}
                    />
                  </label>
                )}
                {(docPreview || docIsPdf) && (
                  <label className={styles.bigButton}>
                    📄 Changer de document
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      hidden
                      disabled={loading}
                      onChange={handleDocument}
                    />
                  </label>
                )}
              </div>
            )}

            {tab === "text" && (
              <form onSubmit={handleTextSubmit} className={styles.textForm}>
                <textarea
                  className={styles.textarea}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Écrivez votre question en français..."
                  disabled={loading}
                />
                <button
                  type="submit"
                  className={styles.bigButton}
                  disabled={loading || !textInput.trim()}
                >
                  Envoyer →
                </button>
              </form>
            )}
          </section>
        )}

        {showResultArea && (
          <section className={styles.resultArea}>
            {loading && (
              <div className={styles.statusCard}>
                <span className={styles.spinner} />
                <p className={styles.status}>{STATUS_MESSAGES[statusIndex]}</p>
              </div>
            )}

            {result?.error && (
              <div className={styles.errorBox}>
                <p>😕 {result.error === "quota_reached" ? result.message : result.error}</p>
                {result.error === "quota_reached" ? (
                  <button
                    type="button"
                    className={styles.payButton}
                    disabled={payingForCredits}
                    onClick={handlePayForCredits}
                  >
                    {payingForCredits ? "⏳ Paiement en cours..." : "💳 Payer 100 FCFA pour 10 requêtes de plus"}
                  </button>
                ) : (
                  lastAction && (
                    <button type="button" className={styles.bigButton} onClick={lastAction}>
                      Réessayer
                    </button>
                  )
                )}
              </div>
            )}

            {result && !result.error && (
              <div className={styles.resultBox}>
                {result.transcript !== undefined && (
                  <p className={styles.transcript}>🗣️ « {result.transcript} »</p>
                )}

                <p className={styles.translated}>{result.translated}</p>

                {result.audioUrl && <AudioPlayer src={result.audioUrl} autoPlay label="Écouter" />}

                <div className={styles.resultActions}>
                  <button type="button" className={styles.linkButton} onClick={reset}>
                    ↺ Nouvelle question
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "chat" && (
          <section className={styles.chatCard}>
            <div className={styles.chatMessages}>
              {chatMessages.length === 0 && (
                <p className={styles.chatEmpty}>👋 Posez votre première question ci-dessous.</p>
              )}
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === "user" ? styles.bubbleUser : styles.bubbleAi}
                >
                  {msg.pending ? (
                    <span className={styles.bubbleSpinner} />
                  ) : msg.error ? (
                    <span>😕 {msg.error}</span>
                  ) : (
                    <>
                      {msg.text && <p>{msg.text}</p>}
                      {msg.audioUrl && (
                        <AudioPlayer src={msg.audioUrl} autoPlay={msg.role === "ai"} />
                      )}
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChatTextSubmit} className={styles.chatInputRow}>
              <button
                type="button"
                className={recording ? styles.chatMicActive : styles.chatMic}
                onClick={recording ? stopRecording : handleChatVoice}
                aria-label="Message vocal"
              >
                🎤
              </button>
              <input
                type="text"
                className={styles.chatInput}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Écrivez un message..."
              />
              <button type="submit" className={styles.chatSend} disabled={!chatInput.trim()}>
                ➤
              </button>
            </form>
          </section>
        )}
      </main>

      {showEmailModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Quotas gratuits</h3>
            <p className={styles.modalText}>
              Entrez votre email pour suivre votre quota gratuit (optionnel, laissez vide pour rester anonyme) :
            </p>
            <input
              type="email"
              placeholder="votre@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className={styles.modalInput}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setShowEmailModal(false);
                  localStorage.setItem(WEB_USER_ID_STORAGE_KEY, "anonymous_declined");
                }}
                className={styles.modalCancel}
              >
                Passer
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailModal(false);
                  if (emailInput && emailInput.includes("@")) {
                    registerEmail(emailInput).catch(() => {});
                  } else {
                    localStorage.setItem(WEB_USER_ID_STORAGE_KEY, "anonymous_declined");
                  }
                }}
                className={styles.modalSubmit}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
