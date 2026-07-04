#!/usr/bin/env bash
# Runs model-service from WSL with ASR_BACKEND=omnilingual, on port 8000.
# WSL2 forwards localhost automatically, so the Next.js backend on Windows
# (MODEL_SERVICE_URL=http://localhost:8000) keeps working unchanged.
#
# IMPORTANT: stop any Windows-hosted uvicorn on :8000 first (only one process
# can bind that port). From PowerShell:
#   Get-NetTCPConnection -LocalPort 8000 -State Listen | Select -Expand OwningProcess
#   Stop-Process -Id <pid> -Force
#
# Usage (from Windows, via PowerShell or Git Bash):
#   wsl -d Ubuntu -- bash /mnt/c/Users/User/coding/hackaton/locallang/model-service/run_omnilingual_wsl.sh
set -euo pipefail

cd /mnt/c/Users/User/coding/hackaton/locallang/model-service

# Override .env's ASR_BACKEND=local for this run only (env var takes
# priority over .env in pydantic-settings). Edit model-service/.env directly
# instead if you want this to stick permanently.
export ASR_BACKEND=omnilingual_ctc

/root/asr-bench/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
