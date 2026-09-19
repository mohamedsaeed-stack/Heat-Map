#!/usr/bin/env bash
# Re-run the website sweep until it finishes.
#
# Node itself crashes on some hosts: an AssertionError raised INSIDE undici's
# HTTP parser when a TLS socket ends mid-response. It is not throwable from our
# code and cannot be caught - it takes the process down.
#
# The sweep is resumable (keyed by hostname, checkpointed every 20), so the fix
# is simply to start it again. Each crash costs at most 20 records.
export PATH="/c/Users/Mohamed/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.19.0-win-x64:$PATH"
cd "$(dirname "$0")/.."
for i in $(seq 1 60); do
  echo "=== attempt $i ==="
  node scripts/locate-by-website.js && { echo "=== COMPLETED on attempt $i ==="; exit 0; }
  echo "--- crashed, restarting (progress is saved) ---"
  sleep 2
done
echo "=== gave up after 60 attempts ==="
