import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY manquant"),
  LLM_MODEL: z.string().min(1).default("google/gemini-2.5-flash"),
  MODEL_SERVICE_URL: z.string().url("MODEL_SERVICE_URL doit être une URL valide"),
  TELEGRAM_TOKEN: z.string().optional(),
  // DATABASE_URL : ajouté au Jour 4 seulement
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
