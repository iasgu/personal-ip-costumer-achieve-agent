# Douyin IP Agent Backend Deployment

This service is the backend for the Douyin mini app. It handles DeepSeek reply generation, Douyin OAuth token exchange, video ID conversion, video data query, comment listing, and comment reply.

## Local Start

```powershell
cd prototype/douyin-comment-reply-agent
npm start
```

Default health check:

```text
GET /api/health
```

## Docker Deployment

If the Git repository root is this backend folder, use:

```text
Dockerfile
```

If the Git repository root is the whole project folder, use:

```text
prototype/douyin-comment-reply-agent/Dockerfile
```

The container listens on:

```text
PORT=8893
HOST=0.0.0.0
```

## Cloud Function / Template Deployment

If the platform deploys this folder as a Node service package, keep a root `run.sh` and `server.js` in the package root.

Expected startup script:

```sh
#!/bin/sh
set -e

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8893}"

exec node server.js
```

## Required Environment Variables

```text
HOST=0.0.0.0
PORT=8893
DOUYIN_OPENAPI_BASE=https://open.douyin.com
DOUYIN_APP_TYPE=mini
DOUYIN_APP_ID=<Douyin mini app id>
DOUYIN_APP_SECRET=<Douyin app secret>
COMMENT_ADAPTER=mock
DEEPSEEK_API_KEY=<DeepSeek api key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
LLM_PROVIDER=deepseek
LLM_TIMEOUT_MS=20000
REPLY_REQUIRE_MANUAL_APPROVAL=true
```

Set `COMMENT_ADAPTER=douyin-openapi` only after OAuth and comment permissions are confirmed.

## Optional Environment Variables

```text
DOUYIN_ACCESS_TOKEN=<temporary debug token>
DOUYIN_REFRESH_TOKEN=<temporary debug refresh token>
DOUYIN_OPEN_ID=<authorized user open id>
DOUYIN_ITEM_ID=<default test item id>
```

For normal mini app flow, do not hard-code user tokens. They are saved by `/api/douyin/auth/exchange` after mini app authorization.

## Main API Endpoints

```text
GET  /api/health
GET  /api/douyin/auth/status
POST /api/douyin/auth/exchange
POST /api/douyin/auth/manual-token
POST /api/douyin/auth/clear
POST /api/douyin/video/convert
POST /api/douyin/video/query
GET  /api/comments?itemId=...
POST /api/comments/:id/suggestions
POST /api/comments/:id/reply
GET  /api/strategy/current
```

## Test Order

1. Deploy backend and verify `/api/health`.
2. Save backend API URL in the mini app Profile page.
3. Trigger Douyin authorization in the mini app.
4. Check `/api/douyin/auth/status`.
5. Test `video_id` to `item_id` conversion.
6. Test video data query.
7. Switch `COMMENT_ADAPTER` from `mock` to `douyin-openapi`.
8. Test comment list.
9. Test manual comment reply first, then auto mode.

## Notes

- The mini app must not store `AppSecret`, `access_token`, or `refresh_token`.
- Real comment reply can only operate on videos under the authorized Douyin account.
- Video publish is a front-end JSAPI flow and must be triggered by the user.
