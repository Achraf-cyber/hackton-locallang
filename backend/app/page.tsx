"use client";

import { useRef, useState } from "react";
import styles from "./page.module.css";

type Lang = "dyu" | "mos";

interface ApiResult {
  translated?: string;
  audioUrl?: string;
  transcript?: string;
  timings?: Record<string, number>;
  error?: string;
}

type Mode = "voice" | "photo" | "text";

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

export default function Home() {
  const [lang, setLang] = useState<Lang>("dyu");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [textInput, setTextInput] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function run(mode: Mode, action: () => Promise<ApiResult>) {
    setLoading(true);
    setResult(null);
    setLastAction(() => () => run(mode, action));
    try {
      const out = await action();
      setResult(out);
    } catch (err) {
      setResult({ error: (err as Error).message || "Erreur inconnue." });
    } finally {
      setLoading(false);
    }
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
          run("voice", () => postForm("/api/voice", form));
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
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
    const form = new FormData();
    form.append("file", file);
    form.append("lang", lang);
    run("photo", () => postForm("/api/photo", form));
    e.target.value = "";
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    run("text", () => postJson("/api/text", { text: textInput, lang, mode: "answer" }));
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>🗣️ Assistant Services Publics — Dioula &amp; Mooré</h1>

        <div className={styles.langPicker} role="group" aria-label="Choix de la langue">
          <button
            type="button"
            className={lang === "dyu" ? styles.langActive : styles.langButton}
            onClick={() => setLang("dyu")}
          >
            Dioula
          </button>
          <button
            type="button"
            className={lang === "mos" ? styles.langActive : styles.langButton}
            onClick={() => setLang("mos")}
          >
            Mooré
          </button>
        </div>

        <section className={styles.card}>
          <h2>🎤 Poser une question</h2>
          <button
            type="button"
            className={recording ? styles.recording : styles.bigButton}
            disabled={loading}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? "⏹️ Arrêter" : "🎤 Parler"}
          </button>
        </section>

        <section className={styles.card}>
          <h2>📷 Montrer un document</h2>
          <label className={styles.bigButton}>
            📷 Prendre une photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={loading}
              onChange={handlePhoto}
            />
          </label>
        </section>

        <section className={styles.card}>
          <h2>⌨️ Écrire (optionnel)</h2>
          <form onSubmit={handleTextSubmit} className={styles.textForm}>
            <textarea
              className={styles.textarea}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Écrivez votre question en français..."
              disabled={loading}
            />
            <button type="submit" className={styles.bigButton} disabled={loading}>
              Envoyer
            </button>
          </form>
        </section>

        {loading && <p className={styles.status}>⏳ Traitement en cours...</p>}

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
            {result.transcript !== undefined && (
              <p className={styles.transcript}>Vous avez dit : « {result.transcript} »</p>
            )}
            <p className={styles.translated}>{result.translated}</p>
            {result.audioUrl && (
              <audio controls autoPlay src={result.audioUrl} className={styles.audio} />
            )}
            {result.timings && (
              <details className={styles.details}>
                <summary>Détails techniques</summary>
                <ul>
                  {Object.entries(result.timings).map(([step, ms]) => (
                    <li key={step}>
                      {step} : {ms} ms
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
