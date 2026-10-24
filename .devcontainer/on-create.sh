#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env-sample .env; fi
npm ci
