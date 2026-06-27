#!/bin/sh
set -e

cd /opt/application
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8893}"

exec node prototype/douyin-comment-reply-agent/server.js
