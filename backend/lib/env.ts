import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY manquant"),
  LLM_MODEL: z.string().min(1).default("google/gemini-2.5-flash"),
  MODEL_SERVICE_URL: z.string().url("MODEL_SERVICE_URL doit être une URL valide"),
  // Space HF dedie a l'ASR (voir model-service/Dockerfile.asr), separe du
  // Space traduction/TTS (MODEL_SERVICE_URL) pour tenir dans 16 Go de RAM
  // chacun. Optionnel : si absent, /transcribe reste sur MODEL_SERVICE_URL
  // (mode "un seul Space", ex. en local).
  ASR_SERVICE_URL: z.string().url("ASR_SERVICE_URL doit être une URL valide").optional(),
  TELEGRAM_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL manquant"),
  DAILY_FREE_LIMIT: z.coerce.number().int().positive().default(8),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Valide et renvoie les variables d'environnement.
 * Lève une erreur explicite au premier appel si la config est incomplète.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables d'environnement invalides:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
