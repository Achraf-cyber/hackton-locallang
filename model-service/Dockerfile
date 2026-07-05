FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# TTS_BACKEND_DYU=omnivoice : test de k2-fsa/OmniVoice pour le dioula (Qwen3
# backbone + audio_tokenizer separe, pas de dependance fairseq2/omnilingual-asr
# contrairement a l'ASR -- safe a installer meme dans ce Space translation-only.
RUN pip install --no-cache-dir retrying xxhash omnivoice

COPY . .

ENV TTS_BACKEND_DYU=omnivoice

# Space dedie a la traduction (facebook/nllb-200-3.3B, ~13 Go) + test TTS
# OmniVoice dyu. L'ASR lourd (omnilingual-asr/fairseq2) est gere dans un
# Space separe, voir le prompt de migration. ASR_BACKEND reste sur son
# defaut leger (Settings.local).

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
