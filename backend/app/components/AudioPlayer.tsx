"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AudioPlayer.module.css";

interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  label?: string;
}

export default function AudioPlayer({ src, autoPlay, label }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  useEffect(() => {
    if (autoPlay) {
      audioRef.current?.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  }, [autoPlay, src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  }

  return (
    <div className={styles.player}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className={styles.playButton}
        onClick={toggle}
        aria-label={playing ? "Mettre en pause" : "Écouter"}
      >
        {playing ? "⏸️" : "▶️"}
      </button>
      <div className={styles.body}>
        {label && <span className={styles.label}>{label}</span>}
        <div className={styles.track}>
          {Array.from({ length: 24 }).map((_, i) => {
            const active = i / 24 < progress;
            return (
              <span
                key={i}
                className={`${styles.bar} ${active ? styles.barActive : ""} ${
                  playing ? styles.barAnimated : ""
                }`}
                style={{ animationDelay: `${(i % 8) * 0.08}s` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
