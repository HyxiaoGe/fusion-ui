#!/usr/bin/env bash
set -euo pipefail
exec npx vitest run src/scripts/buildAndDeployWorkflow.test.ts
