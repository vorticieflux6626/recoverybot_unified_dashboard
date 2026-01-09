#!/bin/bash
# Start Unified Dashboard (production mode)
# Serves built frontend + backend on single process

set -e

cd "$(dirname "$0")"

echo "=== Starting Unified Dashboard (Production) ==="

# Build if needed
if [ ! -d "dist" ]; then
    echo "Building frontend..."
    npm run build
fi

# Start production server
echo "Starting server on port 3100..."
npm run server
