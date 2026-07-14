#!/bin/sh
# Build frontend — use local build if available, otherwise build in Docker
set -e

WEB_DIR="/web"
DIST_DIR="$WEB_DIR/dist"

# Check if local build exists and is recent
if [ -d "$DIST_DIR" ] && [ -f "$DIST_DIR/index.html" ]; then
    echo "✓ Using local frontend build from $DIST_DIR"
    # Verify the build is recent (within last hour)
    if [ "$(find "$DIST_DIR" -maxdepth 0 -mmin -60 2>/dev/null)" ]; then
        echo "✓ Local build is recent (within last hour)"
        exit 0
    else
        echo "⚠ Local build is older than 1 hour, rebuilding..."
    fi
else
    echo "⚠ No local build found, building frontend..."
fi

# Build frontend
echo "Building frontend..."
cd "$WEB_DIR"
pnpm build
echo "✓ Frontend build complete"
