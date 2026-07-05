FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Space dedie a la traduction (facebook/nllb-200-3.3B, ~13 Go). OmniVoice
# (k2-fsa/OmniVoice) a ete deplace dans son propre Space (voir
# Dockerfile.omnivoice) : le charger ici en plus de NLLB-3.3B faisait
# depasser les 16 Go de RAM du Space et le faisait crasher (OOM). L'ASR
# lourd (omnilingual-asr/fairseq2) est lui aussi dans un Space separe (voir
# Dockerfile.asr). ASR_BACKEND/TTS_BACKEND_DYU restent sur leurs defauts
# legers (Settings.local / mms).

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
