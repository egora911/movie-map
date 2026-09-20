# Movie Map Agent v1

Read-only AI agent for the Movie Map.

## Runtime
- Frontend: existing static Movie Map.
- Backend: Vercel serverless function `api/chat.js`.
- Model: OpenAI Responses API, default `gpt-5.6-luna`.
- Tools: `search_movies`, `get_movie`, `get_catalog_stats`.
- Data source: `movies.json`.
- Agent cannot modify data.

## Required environment variables on Vercel
- `OPENAI_API_KEY` — required.
- `OPENAI_MODEL` — optional, defaults to `gpt-5.6-luna`.

Never commit the API key to GitHub.

Preview branch: `agent/read-only-v1`.
