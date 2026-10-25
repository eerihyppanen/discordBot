#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -e .env ]; then
  cp .env-sample .env
fi
npm ci --no-audit --no-fund
