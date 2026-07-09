# Farafina AI — Liens du Projet

Tous les liens associés au projet Farafina AI (IA souveraine pour les langues locales — Dioula & Mooré, Burkina Faso).

## Produit

| Quoi | Lien |
|------|------|
| Application Web (traducteur) | https://hackton-locallang.vercel.app |
| Démo des services gouvernementaux (e-casier) | https://hackton-locallang.vercel.app/demo |
| Bot Telegram | https://t.me/Africalangbot  (@Africalangbot) |

## Code source

| Quoi | Lien |
|------|------|
| Dépôt GitHub | https://github.com/Achraf-cyber/hackton-locallang |

## Services de modèles (Hugging Face Spaces)

L'IA fonctionne sur des espaces Hugging Face séparés (chacun d'environ 16 Go) pour rester dans les limites de mémoire.

| Service | Espace | Point de terminaison (Endpoint) |
|---------|-------|----------|
| Traduction (NLLB-200-3.3B ou stack GO AI selon `MODEL_STACK`) | https://huggingface.co/spaces/AchrafCyber/model-service | https://achrafcyber-model-service.hf.space |
| Reconnaissance vocale / ASR (Omnilingual ASR) | https://huggingface.co/spaces/AchrafCyber/asr-service | https://achrafcyber-asr-service.hf.space |
| Synthèse vocale / TTS (MMS-TTS, dioula + mooré) | https://huggingface.co/spaces/AchrafCyber/tts-service | https://achrafcyber-tts-service.hf.space |
| Automatisation de formulaires (Playwright) — **non déployé actuellement** | à créer sur huggingface.co/new-space | — |

## Notes

- L'identifiant du bot Telegram est `@Africalangbot`.
- L'application web est déployée sur Vercel ; les services de modèles sur Hugging Face.
- Remplacez/confirmez toute URL ci-dessus si un espace ou un déploiement est renommé.
- Le Space d'automatisation Playwright existe dans le code (`automation-service/`)
  mais n'est pas encore déployé : le workflow cible un nom de Space placeholder
  (`AchrafCyber/automation-service-disabled`) tant que ce Space n'a pas été créé
  manuellement.
- OmniVoice a été testé pour le TTS dioula puis abandonné (articulation
  incorrecte de certains mots) ; le backend actif est `facebook/mms-tts-dyu`.

_Dernière mise à jour : 09-07-2026_
