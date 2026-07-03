"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type Lang = "dyu" | "mos";
type Tab = "voice" | "photo" | "text";

interface ApiResult {
  translated?: string;
  audioUrl?: string;
  transcript?: string;
  timings?: Record<string, number>;
  error?: string;
}

const STEP_LABELS: Record<string, string> = {
  transcribe: "🎧 Écoute",
  toFrench: "🔁 Traduction → français",
  answer: "🧠 Réponse",
  simplify: "🧠 Simplification",
  readImage: "👁️ Lecture du document",
  localize: "🌍 Traduction + voix",
};

const STATUS_MESSAGES = [
  "On écoute...",
  "On traduit...",
  "On prépare la réponse...",
  "On génère la voix...",
];

async function postJson(url: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult;
}

async function postForm(url: string, form: FormData): Promise<ApiResult> {
  const res = await fetch(url, { method: "POST", body: form });
  return (await res.json()) as ApiResult;
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
  const [textInput, setTextInput] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
    setPhotoPreview(null);
    setTextInput("");
  }

  function startRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const form = new FormData();
          form.append("file", blob, "question.webm");
          form.append("lang", lang);
          run(() => postForm("/api/voice", form));
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

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
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

  const showResultArea = loading || result;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <span className={styles.badge}>🗣️ Accessibilité services publics</span>
          <h1 className={styles.title}>Posez votre question</h1>
          <p className={styles.subtitle}>
            En Dioula ou en Mooré : parlez, montrez un document, ou écrivez.
          </p>
        </header>

        <div className={styles.langPicker} role="group" aria-label="Choix de la langue">
          <button
            type="button"
            className={lang === "dyu" ? styles.langActive : styles.langButton}
            onClick={() => setLang("dyu")}
          >
            <span className={styles.langDot} data-lang="dyu" />
            Dioula
          </button>
          <button
            type="button"
            className={lang === "mos" ? styles.langActive : styles.langButton}
            onClick={() => setLang("mos")}
          >
            <span className={styles.langDot} data-lang="mos" />
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
            🎤 Voix
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "photo"}
            className={tab === "photo" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("photo");
              reset();
            }}
          >
            📷 Photo
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
            ⌨️ Texte
          </button>
        </nav>

        <section className={styles.card}>
          {tab === "voice" && (
            <div className={styles.voicePanel}>
              <button
                type="button"
                className={recording ? styles.micButtonActive : styles.micButton}
                disabled={loading}
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? "Arrêter l'enregistrement" : "Commencer à parler"}
              >
                {recording && <span className={styles.pulseRing} />}
                <span className={styles.micIcon}>{recording ? "⏹️" : "🎤"}</span>
              </button>
              <p className={styles.voiceHint}>
                {recording ? `Enregistrement... ${formatSeconds(recordSeconds)}` : "Appuyez pour parler"}
              </p>
            </div>
          )}

          {tab === "photo" && (
            <div className={styles.photoPanel}>
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not optimizable
                <img src={photoPreview} alt="Aperçu du document" className={styles.photoPreview} />
              ) : (
                <label className={styles.dropzone}>
                  <span className={styles.dropzoneIcon}>📷</span>
                  <span>Prendre ou choisir une photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    disabled={loading}
                    onChange={handlePhoto}
                  />
                </label>
              )}
              {photoPreview && (
                <label className={styles.bigButton}>
                  📷 Changer de photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    disabled={loading}
                    onChange={handlePhoto}
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
                <p>⚠️ {result.error}</p>
                {lastAction && (
                  <button type="button" className={styles.bigButton} onClick={lastAction}>
                    Réessayer
                  </button>
                )}
              </div>
            )}

            {result && !result.error && (
              <div className={styles.resultBox}>
                <span className={styles.resultTag}>
                  Réponse en {lang === "dyu" ? "Dioula" : "Mooré"}
                </span>

                {result.transcript !== undefined && (
                  <p className={styles.transcript}>Vous avez dit : « {result.transcript} »</p>
                )}

                <p className={styles.translated}>{result.translated}</p>

                {result.audioUrl && (
                  <audio controls autoPlay src={result.audioUrl} className={styles.audio} />
                )}

                <div className={styles.resultActions}>
                  <button type="button" className={styles.linkButton} onClick={reset}>
                    ↺ Nouvelle question
                  </button>
                </div>

                {result.timings && (
                  <details className={styles.details}>
                    <summary>Détails techniques</summary>
                    <ul className={styles.timingList}>
                      {Object.entries(result.timings).map(([step, ms]) => (
                        <li key={step} className={styles.timingItem}>
                          <span>{STEP_LABELS[step] ?? step}</span>
                          <span className={styles.timingMs}>{ms} ms</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
