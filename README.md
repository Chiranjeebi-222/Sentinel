# Sentinel — AI Agent Observability Platform

Sentinel is an end-to-end AI-agent observability system.

## Runtime flow

User prompt → Agent Service → OpenAI Responses API → telemetry events → NestJS API → SQLite → React dashboard

The agent service owns the LLM/tool execution and emits normalized telemetry. The API persists telemetry and broadcasts live events over Socket.IO. The React app visualizes executions, workflow steps, errors, tokens, duration and estimated cost.

## Requirements
- Node.js 20+
- npm 10+
- An OpenAI API key with API billing/credits

## Run
1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open http://localhost:5173.

The API runs on port 3001 and the agent service on 3002.

## Important
The OpenAI key must never be placed in the React frontend. It belongs only in the agent service environment.

See `docs.md` for the actual user prompt flow, telemetry events, and dashboard metric definitions.
