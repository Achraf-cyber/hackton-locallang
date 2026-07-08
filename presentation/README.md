# Farafina AI — Presentation & assets

This folder holds the non-technical pitch materials for **Farafina AI** (sovereign AI for local languages — Dioula & Mooré, Burkina Faso).

## Contents

| File | What it is |
|------|-----------|
| `Farafina-AI.pptx` | ~20-slide pitch deck (problem → solution), animated with slide transitions. |
| `LINKS.md` | All project links — web app, Telegram bot, GitHub, Hugging Face Spaces. |
| `media/demo-website.mp4` | Short demo/walkthrough video of the product. **Placeholder — replace with a real screen recording of the website when available.** |

## Rebuilding the deck

The deck is generated from code so it can be regenerated/edited consistently.

```bash
npm install pptxgenjs          # one-time
node build_deck.js             # writes Farafina-AI.pptx
python rezip.py Farafina-AI.pptx        # recompress (pptxgenjs writes bloated zips)
python add_transitions.py Farafina-AI.pptx   # add fade slide transitions
```

- `build_deck.js` — deck content & layout (edit here to change slides).
- `rezip.py` — recompresses the .pptx.
- `add_transitions.py` — injects a fade transition on every slide (pptxgenjs can't do this itself).

## Replacing the demo video

`media/demo-website.mp4` is a branded placeholder walkthrough. To swap in a real
screen recording, just overwrite that file (keep the same name so links stay valid).
