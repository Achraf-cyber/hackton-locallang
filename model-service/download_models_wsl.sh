#!/usr/bin/env bash
# Run from WSL (Ubuntu) to download NLLB + TTS-dyu + TTS-mos into the WSL
# environment's own HF cache (separate from Windows' cache). The Omnilingual
# ASR model is already cached from earlier setup; pre_download.py will skip
# it if already present via HF's own resume/cache-check logic.
#
# Usage (from Windows, via PowerShell or Git Bash):
#   wsl -d Ubuntu -- bash /mnt/c/Users/User/coding/hackaton/locallang/model-service/download_models_wsl.sh
set -euo pipefail

cd /mnt/c/Users/User/coding/hackaton/locallang
/root/asr-bench/.venv/bin/python pre_download.py
