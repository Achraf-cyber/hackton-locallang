/**
 * Cache mémoire pour les audios d'interface (menus, boutons, erreurs...).
 *
 * Ces textes sont FIXES et déjà écrits en dyu/mos (voir lib/messages.ts) :
 * on les synthétise une seule fois par (clé, langue) via speak() (jamais
 * localize(), qui traduirait à tort depuis le français) et on réutilise le
 * même fichier audio pour tous les usagers ensuite — évite de repayer le
 * coût TTS (plusieurs secondes) à chaque affichage d'un menu.
 *
 * Le cache est en mémoire process : il se réinitialise au redémarrage du
 * bot (première utilisation après un redéploiement légèrement plus lente,
 * ensuite instantané), cohérent avec le style "singleton paresseux" déjà
 * utilisé côté model-service.
 */

import type { LocalLang } from "./modelService";
import { speak } from "./modelService";

const cache = new Map<string, Promise<string>>();

/** Renvoie l'URL audio pour (key, lang), en la générant si nécessaire. */
export function getCachedSpeechUrl(
  key: string,
  text: string,
  lang: LocalLang,
): Promise<string> {
  const cacheKey = `${key}:${lang}`;
  let pending = cache.get(cacheKey);
  if (!pending) {
    pending = speak(text, lang).then((r) => r.audioUrl);
    // Un échec ne doit pas rester en cache indéfiniment (ex. service modèles
    // temporairement indisponible) : on retentera au prochain appel.
    pending.catch(() => cache.delete(cacheKey));
    cache.set(cacheKey, pending);
  }
  return pending;
}
