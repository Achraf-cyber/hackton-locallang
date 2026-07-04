#!/usr/bin/env bash
# Full from-scratch setup of the WSL environment for ASR_BACKEND=omnilingual.
# Only needed once (or again if the WSL distro / venv gets wiped) -- the
# environment already exists as of 2026-07-04, this documents how it was
# built so it's reproducible on another machine or after a reset.
#
# Usage (from Windows, after `wsl --install -d Ubuntu --no-launch`):
#   wsl -d Ubuntu -- bash /mnt/c/Users/User/coding/hackaton/locallang/model-service/setup_wsl_env.sh
set -euo pipefail

apt-get update -qq
apt-get install -y -qq curl ca-certificates ffmpeg build-essential

curl -LsSf https://astral.sh/uv/install.sh | sh
UV=/root/.local/bin/uv

$UV python install 3.11

mkdir -p /root/asr-bench
cd /root/asr-bench
$UV venv --python 3.11 .venv
PY=/root/asr-bench/.venv/bin/python

# fairseq2 only has prebuilt wheels for specific torch versions (2.9.0/2.9.1
# at the time of writing) -- must match EXACTLY or fairseq2n segfaults.
$UV pip install --python "$PY" "torch==2.9.1" "torchaudio==2.9.1" \
    --index-url https://download.pytorch.org/whl/cpu

# fair.pkg.atmeta.com's TLS cert was expired at the time of writing (Meta's
# own infra issue, not ours) -- --allow-insecure-host bypasses verification
# for this specific host only. Remove once Meta fixes their cert.
$UV pip install --python "$PY" "fairseq2" \
    --extra-index-url https://fair.pkg.atmeta.com/fairseq2/whl/pt2.9.1/cpu \
    --allow-insecure-host fair.pkg.atmeta.com \
    --index-strategy unsafe-best-match

# --no-deps: omnilingual-asr's declared torch dependency is unpinned and
# would otherwise pull the CUDA build (~2GB) instead of reusing the CPU one
# just installed above.
$UV pip install --python "$PY" omnilingual-asr --no-deps

# Transitive deps missing from omnilingual-asr's/fairseq2's own metadata.
$UV pip install --python "$PY" retrying xxhash

# Rest of model-service's own requirements (see requirements.txt).
$UV pip install --python "$PY" \
    fastapi "uvicorn[standard]" python-multipart accelerate sentencepiece \
    pydantic-settings python-dotenv soundfile scipy pydub pillow requests \
    huggingface_hub

echo "✅ WSL environment ready at /root/asr-bench/.venv"
