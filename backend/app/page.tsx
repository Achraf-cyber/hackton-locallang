"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  Square,
  FileText,
  Type,
  MessageSquare,
  UploadCloud,
  AlertCircle,
  Loader2,
  CreditCard,
  Send,
  RotateCcw,
  Languages,
  ChevronRight,
  BookOpen,
  HelpCircle,
  Sparkles,
  Volume2,
  User,
  Zap,
} from "lucide-react";
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
  interface UserStats {
    registered: boolean;
    tier?: string;
    requestsToday?: number;
    paidCreditsLeft?: number;
    stats: {
      voiceCount: number;
      photoCount: number;
      textCount: number;
      chatCount: number;
    };
    history: Array<{
      id: string;
      type: string;
      lang: string;
      input: string;
      output: string;
      ts: string;
    }>;
  }

  const [result, setResult] = useState<ApiResult | null>(null);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [payingForCredits, setPayingForCredits] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  // N'apparaît plus automatiquement à la première visite (dialogue intrusif) :
  // uniquement accessible volontairement via le bouton "Suivi Quota". Fixe
  // aussi un mismatch d'hydratation : l'ancien initializer lisait
  // localStorage (absent côté serveur), donc le rendu serveur et le premier
  // rendu client différaient systématiquement.
  const [showEmailModal, setShowEmailModal] = useState(false);
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

  const fetchStats = useCallback(() => {
    fetch("/api/user-stats")
      .then((res) => res.json())
      .then((data) => setUserStats(data as UserStats))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
      fetchStats();
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
      })
      .finally(fetchStats);
  }

  function handleChatVoice() {
    startRecording((blob) => {
      const userMsg: ChatMessage = { id: newId(), role: "user", pending: true, text: "Message vocal" };
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
                return { ...msg, pending: false, text: out.transcript || "Message vocal" };
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
        })
        .finally(fetchStats);
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.blobOne} aria-hidden />
      <div className={styles.blobTwo} aria-hidden />

      {/* Modern High-Grade Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.navContainer}>
          <div className={styles.navLogo}>
            <div className={styles.navLogoIcon}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Farafina AI Logo" style={{ width: "24px", height: "24px", borderRadius: "6px", objectFit: "cover" }} />
            </div>
            <span className={styles.navLogoText}>Farafina <span className={styles.goldText}>AI</span></span>
          </div>
          <div className={styles.navLinks}>
            <a href="#translator" className={styles.navLink}>Traducteur</a>
            <a href="#features" className={styles.navLink}>Fonctionnalités</a>
            <a href="#guide" className={styles.navLink}>Guide</a>
          </div>
          <div className={styles.navActions}>
            <button 
              type="button" 
              className={styles.quotaBadge}
              onClick={() => setShowEmailModal(true)}
            >
              <User size={14} />
              <span>Suivi Quota</span>
            </button>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <div className={styles.brandBadge}>
            <Sparkles size={14} className={styles.brandIcon} />
            <span>L&apos;intelligence artificielle souveraine pour nos langues locales</span>
          </div>
          <h1 className={styles.title}>Brisez les barrières de la langue.</h1>
          <p className={styles.subtitle}>
            Traduisez instantanément et lisez des documents en <strong>Dioula</strong> et <strong>Mooré</strong> grâce à nos modèles de deep learning souverains.
          </p>
        </section>

        {/* Dynamic Language Picker */}
        <div className={styles.langPicker} role="group" aria-label="Choix de la langue">
          <button
            type="button"
            className={lang === "dyu" ? styles.langActive : styles.langButton}
            onClick={() => setLang("dyu")}
          >
            <span className={styles.langDot} />
            <div className={styles.langTextContainer}>
              <span className={styles.langName}>Dioula</span>
              <span className={styles.langSubName}>Julakan (Burkina, Côte d&apos;Ivoire, Mali)</span>
            </div>
          </button>
          <button
            type="button"
            className={lang === "mos" ? styles.langActive : styles.langButton}
            onClick={() => setLang("mos")}
          >
            <span className={styles.langDot} />
            <div className={styles.langTextContainer}>
              <span className={styles.langName}>Mooré</span>
              <span className={styles.langSubName}>Mooré (Burkina Faso)</span>
            </div>
          </button>
        </div>

        {/* Input Mode Navigation Tab bar */}
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
            <Mic size={18} />
            <span>Voix</span>
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
            <FileText size={18} />
            <span>Document</span>
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
            <Type size={18} />
            <span>Texte</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chat"}
            className={tab === "chat" ? styles.tabActive : styles.tab}
            onClick={() => setTab("chat")}
          >
            <MessageSquare size={18} />
            <span>Discuter AI</span>
          </button>
        </nav>

        {/* High-Grade Double-Pane Translator Dashboard */}
        <section id="translator" className={tab === "chat" ? styles.fullChatWrapper : styles.dashboardGrid}>
          
          {/* Left Pane: Interactive inputs based on Tab */}
          <div className={styles.inputPane}>
            <div className={styles.paneHeader}>
              <span className={styles.paneTitle}>Entrée (Français)</span>
            </div>
            
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
                  <span className={styles.micIcon}>
                    {recording ? <Square size={36} className={styles.micIconSvg} fill="currentColor" /> : <Mic size={36} className={styles.micIconSvg} />}
                  </span>
                </button>
                <p className={styles.voiceHint}>
                  {recording ? `Je vous écoute... ${formatSeconds(recordSeconds)}` : "Appuyez sur le micro pour parler"}
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
                    <span className={styles.pdfIcon}>
                      <FileText size={44} className={styles.pdfIconSvg} />
                    </span>
                    <span className={styles.pdfName}>{docName}</span>
                  </div>
                ) : (
                  <label className={styles.dropzone}>
                    <span className={styles.dropzoneIcon}>
                      <UploadCloud size={38} className={styles.dropzoneIconSvg} />
                    </span>
                    <span>Prendre une photo ou choisir un fichier</span>
                    <span className={styles.dropzoneHint}>Image ou document PDF</span>
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
                    <FileText size={18} />
                    <span>Changer de document</span>
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
                  placeholder="Saisissez votre texte en français à traduire..."
                  disabled={loading}
                />
                <button
                  type="submit"
                  className={styles.bigButton}
                  disabled={loading || !textInput.trim()}
                >
                  <Send size={18} />
                  <span>Traduire maintenant</span>
                </button>
              </form>
            )}

            {tab === "chat" && (
              <div className={styles.chatCard}>
                <div className={styles.chatMessages}>
                  {chatMessages.length === 0 && (
                    <div className={styles.chatEmpty}>
                      <Languages size={32} className={styles.chatEmptyIcon} />
                      <p>Commencez à discuter avec l&apos;assistant IA en langue locale.</p>
                    </div>
                  )}
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={msg.role === "user" ? styles.bubbleUser : styles.bubbleAi}
                    >
                      {msg.pending ? (
                        <span className={styles.bubbleSpinner} />
                      ) : msg.error ? (
                        <span className={styles.bubbleError}>
                          <AlertCircle size={14} className={styles.bubbleErrorIcon} />
                          <span>{msg.error}</span>
                        </span>
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
                    <Mic size={18} />
                  </button>
                  <input
                    type="text"
                    className={styles.chatInput}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Écrivez un message en français..."
                  />
                  <button type="submit" className={styles.chatSend} disabled={!chatInput.trim()}>
                    <Send size={18} />
                  </button>
                </form>
              </div>
            )}

            {/* Space Dashboard */}
            {userStats && (
              <div className={styles.tabDashboard}>
                <div className={styles.tabDashboardHeader}>
                  <Zap size={14} className={styles.dashboardIcon} />
                  <span>Tableau de bord de l&apos;espace</span>
                </div>
                
                {tab === "voice" && (
                  <div className={styles.dashboardContent}>
                    <div className={styles.statsRow}>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.voiceCount}</span>
                        <span className={styles.statLabel}>Vocal traduits</span>
                      </div>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.voiceCount * 4}s</span>
                        <span className={styles.statLabel}>Durée estimée</span>
                      </div>
                    </div>
                    {userStats.history.filter(h => h.type === "voice").length > 0 && (
                      <div className={styles.miniHistory}>
                        <span className={styles.historyTitle}>Dernières voix traitées :</span>
                        {userStats.history.filter(h => h.type === "voice").slice(0, 3).map(h => (
                          <div key={h.id} className={styles.historyItem}>
                            <span className={styles.historyInput}>« {h.input ? h.input.slice(0, 40) + (h.input.length > 40 ? "..." : "") : "Audio"} »</span>
                            <span className={styles.historyOutput}>{h.output.slice(0, 40)}{h.output.length > 40 && "..."}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "document" && (
                  <div className={styles.dashboardContent}>
                    <div className={styles.statsRow}>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.photoCount}</span>
                        <span className={styles.statLabel}>Fichiers traités</span>
                      </div>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.photoCount > 0 ? "100%" : "0%"}</span>
                        <span className={styles.statLabel}>Taux de succès OCR</span>
                      </div>
                    </div>
                    {userStats.history.filter(h => h.type === "photo").length > 0 && (
                      <div className={styles.miniHistory}>
                        <span className={styles.historyTitle}>Derniers documents importés :</span>
                        {userStats.history.filter(h => h.type === "photo").slice(0, 3).map(h => (
                          <div key={h.id} className={styles.historyItem}>
                            <span className={styles.historyInput}>Image/PDF scanné</span>
                            <span className={styles.historyOutput}>{h.output.slice(0, 50)}{h.output.length > 50 && "..."}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "text" && (
                  <div className={styles.dashboardContent}>
                    <div className={styles.statsRow}>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.textCount}</span>
                        <span className={styles.statLabel}>Phrases saisies</span>
                      </div>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.textCount * 8}</span>
                        <span className={styles.statLabel}>Mots traduits</span>
                      </div>
                    </div>
                    {userStats.history.filter(h => h.type === "text").length > 0 && (
                      <div className={styles.miniHistory}>
                        <span className={styles.historyTitle}>Historique des traductions :</span>
                        {userStats.history.filter(h => h.type === "text").slice(0, 3).map(h => (
                          <div key={h.id} className={styles.historyItem}>
                            <span className={styles.historyInput}>« {h.input.slice(0, 40)}{h.input.length > 40 && "..."} »</span>
                            <span className={styles.historyOutput}>{h.output.slice(0, 40)}{h.output.length > 40 && "..."}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "chat" && (
                  <div className={styles.dashboardContent}>
                    <div className={styles.statsRow}>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.stats.chatCount}</span>
                        <span className={styles.statLabel}>Messages au Bot</span>
                      </div>
                      <div className={styles.statBox}>
                        <span className={styles.statVal}>{userStats.tier === "premium" ? "Premium" : "Standard"}</span>
                        <span className={styles.statLabel}>Type de compte</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Pane: Split output translations (Not shown in Chat tab since chat is full-width card) */}
          {tab !== "chat" && (
            <div className={styles.outputPane}>
              <div className={styles.paneHeader}>
                <span className={styles.paneTitle}>Traduction ({lang === "dyu" ? "Dioula" : "Mooré"})</span>
              </div>
              
              <div className={styles.outputContent}>
                {loading && (
                  <div className={styles.statusCard}>
                    <span className={styles.spinner} />
                    <p className={styles.status}>{STATUS_MESSAGES[statusIndex]}</p>
                  </div>
                )}

                {result?.error && (
                  <div className={styles.errorBox}>
                    <p className={styles.errorText}>
                      <AlertCircle size={18} className={styles.errorIconSvg} />
                      <span>{result.error === "quota_reached" ? result.message : result.error}</span>
                    </p>
                    {result.error === "quota_reached" ? (
                      <button
                        type="button"
                        className={styles.payButton}
                        disabled={payingForCredits}
                        onClick={handlePayForCredits}
                      >
                        {payingForCredits ? (
                          <>
                            <Loader2 size={16} className={styles.spinnerIcon} />
                            <span>Paiement en cours...</span>
                          </>
                        ) : (
                          <>
                            <CreditCard size={16} />
                            <span>Recharger mon quota (+10 req. / 100 FCFA)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      lastAction && (
                        <button type="button" className={styles.bigButton} onClick={lastAction}>
                          <RotateCcw size={16} />
                          <span>Réessayer la traduction</span>
                        </button>
                      )
                    )}
                  </div>
                )}

                {result && !result.error && (
                  <div className={styles.resultBox}>
                    {result.transcript !== undefined && (
                      <p className={styles.transcript}>
                        <Languages size={16} className={styles.transcriptIconSvg} />
                        <span>Transcription : « {result.transcript} »</span>
                      </p>
                    )}

                    <p className={styles.translated}>{result.translated}</p>

                    {result.audioUrl && (
                      <div className={styles.audioWrapper}>
                        <AudioPlayer src={result.audioUrl} autoPlay label="Écouter la prononciation" />
                      </div>
                    )}

                    <div className={styles.resultActions}>
                      <button type="button" className={styles.linkButton} onClick={reset}>
                        <RotateCcw size={14} />
                        <span>Nouvelle traduction</span>
                      </button>
                    </div>
                  </div>
                )}

                {!loading && !result && (
                  <div className={styles.emptyOutput}>
                    <Volume2 size={40} className={styles.emptyOutputIcon} />
                    <p className={styles.emptyOutputText}>En attente de texte, voix, ou document à traduire...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Premium Features Showcase Grid */}
        <section id="features" className={styles.featuresSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionBadge}>Technologie</span>
            <h2 className={styles.sectionTitle}>Une IA conçue pour nos langues locales</h2>
            <p className={styles.sectionSubtitle}>Farafina AI combine reconnaissance vocale et synthèse de pointe.</p>
          </div>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIconContainer}>
                <Mic size={24} />
              </div>
              <h3 className={styles.featureTitle}>Reconnaissance Vocale (ASR)</h3>
              <p className={styles.featureDesc}>Parlez naturellement en français, notre IA convertit votre voix et traduit vos paroles avec précision.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIconContainer}>
                <FileText size={24} />
              </div>
              <h3 className={styles.featureTitle}>Numérisation OCR</h3>
              <p className={styles.featureDesc}>Importez des images ou des documents PDF administratifs pour les transcrire et les traduire instantanément.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIconContainer}>
                <Zap size={24} />
              </div>
              <h3 className={styles.featureTitle}>Prononciation Audio</h3>
              <p className={styles.featureDesc}>Écoutez la prononciation correcte de chaque phrase traduite grâce à nos voix de synthèse réalistes.</p>
            </div>
          </div>
        </section>

        {/* Collapsible Quick Guide / Examples Panel */}
        <section id="guide" className={styles.guideCard}>
          <button
            type="button"
            className={styles.guideHeader}
            onClick={() => setShowGuide(!showGuide)}
          >
            <div className={styles.guideHeaderTitle}>
              <BookOpen size={18} className={styles.guideIcon} />
              <span>Guide de survie linguistique & exemples</span>
            </div>
            <span className={`${styles.chevron} ${showGuide ? styles.chevronOpen : ""}`}>
              <ChevronRight size={16} />
            </span>
          </button>
          {showGuide && (
            <div className={styles.guideContent}>
              <p className={styles.guideSub}>Phrases courantes en français et leurs traductions :</p>
              <div className={styles.exampleGrid}>
                <div className={styles.exampleCard}>
                  <div className={styles.exampleFr}>
                    <HelpCircle size={14} />
                    <span>Bonjour</span>
                  </div>
                  <div className={styles.exampleLangs}>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelDyu}>Dioula</span>
                      <span className={styles.langVal}>An ni sogoma</span>
                    </div>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelMos}>Mooré</span>
                      <span className={styles.langVal}>Ne yibeogo</span>
                    </div>
                  </div>
                </div>

                <div className={styles.exampleCard}>
                  <div className={styles.exampleFr}>
                    <HelpCircle size={14} />
                    <span>Merci beaucoup</span>
                  </div>
                  <div className={styles.exampleLangs}>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelDyu}>Dioula</span>
                      <span className={styles.langVal}>An ni tche kossobe</span>
                    </div>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelMos}>Mooré</span>
                      <span className={styles.langVal}>Bark wende wusgo</span>
                    </div>
                  </div>
                </div>

                <div className={styles.exampleCard}>
                  <div className={styles.exampleFr}>
                    <HelpCircle size={14} />
                    <span>Comment ça va ?</span>
                  </div>
                  <div className={styles.exampleLangs}>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelDyu}>Dioula</span>
                      <span className={styles.langVal}>Hera be ?</span>
                    </div>
                    <div className={styles.exampleLangItem}>
                      <span className={styles.langLabelMos}>Mooré</span>
                      <span className={styles.langVal}>Laafi be ?</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer Component */}
      <footer className={styles.footer}>
        <div className={styles.footerContainer}>
          <div className={styles.footerBrand}>
            <span className={styles.footerLogoText}>Farafina <span className={styles.goldText}>AI</span></span>
            <p className={styles.footerTagline}>Préserver notre patrimoine linguistique par l&apos;intelligence artificielle.</p>
          </div>
          <div className={styles.footerCopyright}>
            <span>&copy; {new Date().getFullYear()} Farafina AI. Conçu pour le hackathon.</span>
          </div>
        </div>
      </footer>

      {/* Email Registration Modal */}
      {showEmailModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Quotas de traduction gratuits</h3>
            <p className={styles.modalText}>
              Entrez votre adresse email pour sauvegarder votre historique et suivre votre quota gratuit :
            </p>
            <input
              type="email"
              placeholder="nom@exemple.com"
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
                Ignorer
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
                Valider l&apos;email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
