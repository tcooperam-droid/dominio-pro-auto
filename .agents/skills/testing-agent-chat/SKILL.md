# Testing the Domínio Pro AI Agent

## Overview
The AI agent is a chat-based assistant (bottom-right pink Brain FAB) that uses GitHub Models API (GPT-4o-mini) to handle salon management queries: scheduling, client search, financial reports, and learning rules.

## Local Dev Setup

```bash
# Install dependencies
npm install

# Create .env.local with actual token value (Vite does NOT expand shell variables like ${VAR})
echo 'VITE_SUPABASE_URL=https://placeholder.supabase.co' > .env.local
echo 'VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>' >> .env.local
echo 'VITE_GITHUB_TOKEN=<your-github-pat-token>' >> .env.local

# Start dev server
npx vite --host --port 3001
```

**Important**: Vite `.env.local` files must contain literal values, not shell variable references like `${VAR_NAME}`. If you see the agent returning "Agente não configurado", check that the token value is actually present (not a variable reference).

## Token Configuration

- **Localhost**: Agent reads `VITE_GITHUB_TOKEN` from env var (injected by Vite at build time) or `github_token` from localStorage
- **Vercel**: Agent uses `"proxy"` sentinel value → requests go to `/api/llm` serverless function which reads `NEXT_PUBLIC_GITHUB_TOKEN` env var
- The token must be a GitHub PAT with access to GitHub Models API

## Key Architecture

- `client/src/lib/agentV2.ts` — Main agent module (LLM-first architecture)
- `client/src/lib/agentMemory.ts` — Learning system (preferences, rules, feedback)
- `client/src/components/AgentChat.tsx` — Chat UI component
- `client/src/lib/store.ts` — Supabase data stores (clients, appointments, services, etc.)
- `api/llm.ts` — Vercel serverless proxy for LLM calls

## Known Issues & Workarounds

### Supabase Placeholder Credentials
The project might use placeholder Supabase credentials (`placeholder.supabase.co`). When this happens:
- All store operations fail with `ERR_NAME_NOT_RESOLVED`
- Console shows many red network errors and `[agentV2] Busca Supabase falhou:` warnings
- The agent should still respond via LLM with empty data context
- If the agent shows "Não consegui processar agora", it likely means unhandled throws from store operations — check that all `clientsStore.count()`, `clientsStore.search()`, and similar calls are wrapped in try-catch

### window.prompt Blocking
If the app shows a `window.prompt()` dialog asking for a GitHub token on page load, it means the old token initialization code is active. The fix is to read from env vars silently instead.

### Port Conflicts
If port 3001 is busy, kill the old process: `fuser -k 3001/tcp`

## Testing Checklist

1. **No blocking dialogs** — Page loads without window.prompt or config messages
2. **Agent chat opens** — Click pink Brain FAB → chat panel with welcome message
3. **LLM responds** — Send "Oi" → coherent Portuguese response (not "Agente não configurado")
4. **Quick actions work** — Test all 4: Agenda hoje, Agendar, Buscar cliente, Faturamento
5. **Scheduling intelligence** — Ask to schedule with a client name → agent resolves name, handles missing clients
6. **Rule learning** — Say "Lembra que [rule]" → agent confirms learning
7. **Console errors** — Check for unhandled exceptions (Supabase network errors are expected with placeholder credentials)

## Build & Type Check

```bash
npm run build        # vite build + esbuild server
npx tsc --noEmit     # TypeScript check
```

## Devin Secrets Needed

- `GITHUB_MODELS_TOKEN` — GitHub PAT with access to GitHub Models API (used as `VITE_GITHUB_TOKEN` locally)
