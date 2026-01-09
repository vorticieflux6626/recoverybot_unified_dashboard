#!/bin/bash
# Start Unified Dashboard (development mode)
# Port 3100: Frontend (Vite)
# Port 3101: Backend (Express)

set -e

cd "$(dirname "$0")"

echo "=== Starting Unified Dashboard ==="
echo "Frontend: http://localhost:3100"
echo "Backend:  http://localhost:3101"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start both frontend and backend
npm run start
