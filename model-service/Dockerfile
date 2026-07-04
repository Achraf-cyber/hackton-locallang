FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ASR_BACKEND=omnilingual_llm (omniASR-LLM-7B) + TTS_BACKEND_DYU=omnivoice :
# Linux uniquement (fairseq2n n'a aucun wheel Windows, d'ou l'absence de ces
# paquets dans requirements.txt, installe aussi en local sous Windows) --
# safe a installer ici car le Space tourne toujours sous Linux.
# torch/torchaudio doivent matcher EXACTEMENT le wheel fairseq2 prebuild
# (voir requirements-omnilingual.txt) ; --no-deps evite que omnilingual-asr
# ne re-resolve torch en variante CUDA par dessus.
RUN pip install --no-cache-dir "torch==2.9.1" "torchaudio==2.9.1" \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "fairseq2" \
        --extra-index-url https://fair.pkg.atmeta.com/fairseq2/whl/pt2.9.1/cpu \
        --trusted-host fair.pkg.atmeta.com \
    && pip install --no-cache-dir omnilingual-asr --no-deps \
    && pip install --no-cache-dir retrying xxhash omnivoice

COPY . .

ENV ASR_BACKEND=omnilingual_llm
ENV TRANSLATION_BACKEND=afrimt5
ENV TTS_BACKEND_DYU=omnivoice

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
