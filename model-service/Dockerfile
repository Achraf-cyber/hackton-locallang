FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Space dedie a la traduction (facebook/nllb-200-3.3B, ~13 Go) : l'ASR/TTS
# lourds (omnilingual-asr, omnivoice) sont geres dans un Space separe, voir
# le prompt de migration. ASR_BACKEND/TTS_BACKEND_DYU restent sur leurs
# defauts legers (Settings.local / mms).

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
