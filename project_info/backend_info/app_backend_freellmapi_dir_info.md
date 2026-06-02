# ⚠️ EXTERNAL REPOSITORY INTEGRATION

**IMPORTANT NOTE**: This folder (`backend/freellmapi`) is an **external, third-party open-source repository** imported from the internet. This is **NOT** part of SecureGuard Pro's core development and was integrated by a group member to provide free LLM API access. The original repository is maintained separately and this entire folder is planned for removal in future versions.

**Source**: [FreeLLMAPI GitHub Repository](https://github.com/tashfeenahmed/freellmapi)  
**License**: MIT  
**Original Author**: tashfeenahmed and contributors  
**Status**: Temporary integration — to be removed later  

---

## What is FreeLLMAPI?

FreeLLMAPI is an open-source proxy server that aggregates free LLM (Large Language Model) tiers from 12+ AI providers behind a single OpenAI-compatible API endpoint. Instead of managing separate API keys and SDKs for Google, Groq, Mistral, Cerebras, and others, you point an OpenAI client at this local proxy and it handles routing, failover, and rate limiting automatically.

**Key Stats**:
- 12+ supported providers aggregated
- ~1.3 billion tokens per month of free inference capacity
- Single `/v1/chat/completions` OpenAI-compatible endpoint
- Automatic fallover when providers rate-limit
- Per-provider rate tracking (RPM, RPD, TPM, TPD)
- Admin dashboard for key management and analytics

---

## Directory Structure

```
backend/freellmapi/
├── server/              # Node.js/TypeScript backend server
│   ├── src/
│   │   ├── providers/   # Provider adapter implementations (Google, Groq, etc.)
│   │   ├── services/    # Core services: router, rate-limiter, health checker
│   │   ├── db/          # Database schema and seeding
│   │   └── __tests__/   # Test suite
│   ├── package.json
│   ├── tsconfig.json
│   └── dist/            # Compiled JavaScript (production builds)
│
├── client/              # React + Vite dashboard UI
│   ├── src/
│   │   ├── components/  # React components (Keys, Playground, Analytics)
│   │   └── pages/
│   ├── package.json
│   ├── vite.config.ts   # Vite build configuration
│   └── index.html
│
├── shared/              # Shared TypeScript types between server & client
├── docs/                # Documentation
├── .env.example         # Environment variables template
├── .env                 # Local environment configuration (git-ignored)
├── README.md            # Original project README (21.5 KB)
├── LICENSE              # MIT License
├── package.json         # Workspace root package.json
└── package-lock.json
```

---

## How It Works (Architecture)

### Request Flow
```
┌──────────────────────────────┐
│ Your App (Python/JavaScript) │
│ (OpenAI SDK or curl)         │
└──────────────┬───────────────┘
               │ Bearer freellmapi-…
               ▼
┌──────────────────────────────────────┐
│ FreeLLMAPI Express Proxy (:3001)     │
│ /v1/chat/completions endpoint        │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │ Router Service           │
    │ 1. Pick best model       │
    │    (healthy + under rate │
    │     limits)              │
    │ 2. Decrypt provider key  │
    │ 3. Call provider API     │
    │ 4. On error: retry next  │
    └──────────────┬───────────┘
               │
        ┌──────┴───────────────┬──────────────┬──────────────┐
        ▼        ▼      ▼              ▼             ▼         ▼
      Google   Groq   Mistral   OpenRouter    Cerebras   SambaNova
                       (and 6+ more providers)
```

### Core Components

#### 1. Router (`server/src/services/router.ts`)
- Selects which provider/model to use for each request
- Algorithm: Prioritize models that are:
  - Healthy (last health check passed)
  - Under all rate limits (RPM, RPD, TPM, TPD not exceeded)
  - Higher priority (configured in fallback chain)
- On 429 (rate limited) or 5xx error: Puts key on cooldown, retries with next model (up to 20 attempts)

#### 2. Rate-Limit Ledger (`server/src/services/ratelimit.ts`)
- Tracks per-key counters: RPM (requests per minute), RPD (requests per day), TPM (tokens per minute), TPD (tokens per day)
- In-memory counters backed by SQLite for persistence
- Prevents exceeding free tier caps (e.g., Google's Gemini has different caps than Groq)
- Implements cooldown on 429 responses

#### 3. Provider Adapters (`server/src/providers/*.ts`)
- One adapter file per provider (google.ts, groq.ts, mistral.ts, etc.)
- Each implements the Provider base class with methods:
  - `chatCompletion()` — non-streaming chat completions
  - `streamChatCompletion()` — streaming Server-Sent Events
- Handles provider-specific request/response translation
- Example: Gemini uses different tool calling format than OpenAI; adapter translates between them

#### 4. Health Service (`server/src/services/health.ts`)
- Periodic background probes test each provider key
- Marks keys as: `healthy`, `rate_limited`, `invalid`, `error`
- Router skips unhealthy keys automatically
- Prevents wasting requests on broken credentials

#### 5. Database (`server/src/db/index.ts`)
- SQLite database with `better-sqlite3` driver
- Tables: API keys (encrypted), rate limit ledger, health status, request logs
- Keys encrypted with AES-256-GCM at rest
- Decryption happens in-memory just before API call

#### 6. Admin Dashboard (`client/`)
- React + Vite + shadcn/ui single-page application
- Pages:
  - **Keys** — Add/remove provider credentials, reorder fallback chain, view unified API key
  - **Playground** — Test prompts, see which provider served each response
  - **Analytics** — Request volume, success rate, token usage, latency, per-provider breakdowns (24h/7d/30d)

---

## Supported Providers

| Provider | Models | Free Tier Capacity |
|----------|--------|-------------------|
| **Google** | Gemini 2.5 Flash, Gemini 3 | Limited |
| **Groq** | Llama 3.3, Llama 4, Qwen 3 | High RPM/TPM |
| **Cerebras** | Qwen 3 235B | Limited |
| **SambaNova** | DeepSeek V3, Llama 4, Gemma 3 | Limited |
| **Mistral** | Large 3, Medium 3.5, Codestral | Limited |
| **OpenRouter** | 21 free-tier models | Limited |
| **GitHub Models** | GPT-4.1, GPT-4o | Limited |
| **Cloudflare** | Kimi K2, GLM-4.7, Granite 4 | Limited |
| **Cohere** | Command R+, Command-A | Trial tier |
| **Z.ai (Zhipu)** | GLM-4.5, GLM-4.7 Flash | Limited |
| **NVIDIA** | NIM models | Limited (disabled by default) |
| **HuggingFace** | DeepSeek V4, Kimi K2.6, Qwen 3 | Limited |

**Total**: ~1.3 billion tokens per month across all providers combined (varies by day/cap).

---

## Features Implemented

✅ **OpenAI-Compatible** — `POST /v1/chat/completions` and `GET /v1/models` work with official OpenAI SDKs, LangChain, LlamaIndex, Continue, etc.

✅ **Streaming & Non-Streaming** — Server-Sent Events for `stream: true`, JSON response otherwise

✅ **Tool Calling** — OpenAI-style `tools` and `tool_choice` pass through; `tool_calls` round-trip properly

✅ **Automatic Failover** — 429/5xx triggers cooldown + retry on next model (up to 20 attempts)

✅ **Per-Key Rate Tracking** — RPM, RPD, TPM, TPD counters prevent exceeding free tier caps

✅ **Sticky Sessions** — Multi-turn conversations stay on same model for 30 minutes to avoid hallucination spikes from mid-conversation switches

✅ **Encrypted Key Storage** — AES-256-GCM encryption; keys never exposed to client apps

✅ **Unified API Key** — Single `freellmapi-…` bearer token; upstream keys never exposed

✅ **Health Checks** — Periodic probes mark keys as healthy/rate-limited/invalid/error

✅ **Admin Dashboard** — React + Vite UI for key management, fallback chain reordering, analytics, playground

✅ **Analytics** — Per-request logging with latency, token counts, success rate, provider breakdowns

✅ **Runs Anywhere** — Windows, macOS, Linux, ARM SBC (Raspberry Pi); ~40 MB RSS at idle

---

## Features NOT Implemented

❌ **Embeddings** (`/v1/embeddings`)  
❌ **Image Generation** (`/v1/images/*`)  
❌ **Audio/Speech** (`/v1/audio/*`)  
❌ **Vision/Multimodal** — Text-only messages (no images in prompts)  
❌ **Legacy Completions** (`/v1/completions`) — Chat endpoint only  
❌ **Moderation** (`/v1/moderations`)  
❌ **Multiple Completions** (`n > 1`)  
❌ **Multi-Tenant Auth** — Single-user by design  

---

## Quick Start (from README)

### Prerequisites
- Node.js 20+
- npm

### Installation
```bash
cd backend/freellmapi
npm install

# Generate encryption key
cp .env.example .env
echo "ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

# Start server + dashboard
npm run dev
# Server on http://localhost:3001
# Dashboard on http://localhost:5173
```

### Using the Proxy (from Your App)

**Python (with OpenAI SDK)**:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-your-unified-key",  # Grab from dashboard
)

response = client.chat.completions.create(
    model="auto",  # Let router pick, or specify exact model
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
print("Routed via:", response.headers.get("x-routed-via"))
```

**curl**:
```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer freellmapi-your-unified-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "hi"}]
  }'
```

**Streaming**:
```python
stream = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Write a poem"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

---

## How SecureGuard Uses FreeLLMAPI

In the SecureGuard codebase:
- `backend/app/services/scans/ai_scanner.py` uses FreeLLMAPI to analyze C/C++ code for security vulnerabilities
- Calls `/v1/chat/completions` on the FreeLLMAPI proxy (endpoint configured in `FREELLMAPI_URL`)
- Sends code snippets with CWE definitions; receives vulnerability analysis
- Integrated via group member contribution for cost-effective AI scanning

---

## Limitations & Tradeoffs

⚠️ **No Frontier Models** — Free tiers top out at Llama 3.3 70B, GPT-4o, Gemini 2.5 Pro. No GPT-5 or Claude Opus class reasoning.

⚠️ **Intelligence Degrades Over Day** — Your best models (Gemini 2.5, GPT-4o) have the lowest daily caps. Once exhausted, router falls to smaller models, reducing quality.

⚠️ **Variable Latency** — Cerebras & Groq are fast; others slower. Depends on which provider is available.

⚠️ **Free Tiers Can Change** — Providers adjust limits without notice. When it happens, you see 429/auth errors until catalog is updated.

⚠️ **No SLA** — No service guarantee. For production reliability, use paid providers.

⚠️ **Local-First Design** — No multi-tenant auth. This runs for yourself; don't expose to internet without auth layer.

---

## Environment Variables

```
# Encryption key for at-rest key storage (REQUIRED)
ENCRYPTION_KEY=<32-byte hex string>

# Server
NODE_ENV=development|production
DEV_MODE=true (dev-only fallback key usage)

# Dashboard (Vite)
VITE_API_URL=http://localhost:3001

# Runtime flags
LOG_LEVEL=debug|info|warn|error
```

---

## Tech Stack

**Backend**:
- TypeScript
- Node.js 20+
- Express.js
- SQLite (better-sqlite3)
- Crypto (AES-256-GCM encryption)
- Vitest (testing)

**Frontend/Dashboard**:
- React
- Vite
- shadcn/ui (components)
- TypeScript

**Provider SDKs**:
- @google/generative-ai
- groq (Groq API)
- @mistralai/mistralai
- openai (OpenAI-compatible)
- etc. (one per provider)

---

## File Structure Summary

| Path | Purpose |
|------|---------|
| `server/src/providers/` | Provider adapters (Google, Groq, Mistral, etc.) |
| `server/src/services/router.ts` | Request routing & model selection logic |
| `server/src/services/ratelimit.ts` | Rate-limit tracking & enforcement |
| `server/src/services/health.ts` | Background health check probes |
| `server/src/db/` | SQLite schema, seed scripts, migrations |
| `server/src/__tests__/` | Vitest unit & integration tests |
| `client/src/` | React dashboard components & pages |
| `shared/` | Shared TypeScript types |
| `README.md` | Original upstream README (21.5 KB) |

---

## For More Information

- **Original Repository**: https://github.com/tashfeenahmed/freellmapi
- **Issues & PRs**: Contribute upstream; this is a temporary integration
- **License**: MIT

---

## Summary

FreeLLMAPI is a powerful open-source tool for aggregating free LLM capacity. In SecureGuard Pro, it's used to provide cost-effective AI-powered code scanning without relying on expensive commercial APIs. However, since this is an external integration planned for removal, **do not modify this folder directly**. Any changes should be contributed upstream to the original repository or the integration should be replaced with a paid provider in future versions.

---

**Status**: ⏳ Temporary integration — planned for removal in future releases  
**Maintainability**: Low (external dependency)  
**Update Frequency**: As needed by upstream repository
