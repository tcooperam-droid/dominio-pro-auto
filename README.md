# Domínio Pro

Sistema de gestão para salões de beleza e barbearias, com agenda, clientes, funcionários, serviços, caixa, despesas, relatórios e agente de IA.

## Stack

O projeto é uma SPA construída com React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Wouter, Supabase e GitHub Models. O deploy pode ser feito na Vercel ou em outra hospedagem compatível com Vite. Quando o agente seguro e a pesquisa web estiverem habilitados, as funções serverless do diretório `api/` também devem ser publicadas.

## Arquitetura modular

```text
src/
├── app/
│   ├── AppRoutes.tsx        # Rotas e carregamento sob demanda
│   ├── AppShell.tsx         # Providers e bootstrap da aplicação
│   └── agentBootstrap.ts    # Inicialização do agente
├── features/
│   ├── agenda/              # API pública da agenda
│   ├── clientes/            # API pública de clientes
│   ├── funcionarios/        # API pública de funcionários
│   ├── servicos/            # API pública de serviços
│   ├── financeiro/          # API pública financeira e auditoria
│   ├── relatorios/          # API pública de consultas e análises
│   ├── assistente/          # Adaptadores do agente de agendamento
│   └── agente-pessoal/      # IA geral, memória, objetivos e ponte
├── lib/
│   ├── store.ts             # Fachada de compatibilidade
│   ├── store/               # Implementações por agregado
│   ├── analytics.ts         # Regras analíticas
│   ├── agentV2.ts           # Orquestração do agente
│   ├── agentMedia.ts        # Imagem, pesquisa e voz
│   └── agentSchedule.ts      # Regras determinísticas de data e horário
├── components/              # Componentes reutilizáveis
└── pages/                   # Telas carregadas por rota

O agente pessoal fica em `src/features/agente-pessoal/`. Ele é uma camada de propósito geral, com memória, objetivos e feedback, e encaminha operações da agenda para o `agentV2` por meio de uma ponte tipada. A avaliação detalhada e os limites de treinamento estão em [`docs/AGENTE-PESSOAL.md`](docs/AGENTE-PESSOAL.md).

api/
├── agent.js                 # Proxy server-side para um provedor OpenAI-compatible
└── search.js                # Proxy server-side para Tavily
```

As páginas e componentes usam as APIs em `features/`. O arquivo `src/lib/store.ts` permanece apenas como fachada para compatibilidade com integrações antigas.

## Instalação local

```bash
npm install
cp .env.example .env
npm run typecheck
npm test
npm run build
npm run dev
```

O servidor local fica disponível em `http://localhost:5173`.

## Variáveis de ambiente

Para produção, configure os valores no provedor de hospedagem. A chave do provedor compatível com OpenAI deve ser configurada como `LLM_API_KEY`, sem o prefixo `VITE_`, para que permaneça no servidor e seja usada por `api/agent.js`. O endpoint padrão é o da OpenAI; para Azure, OpenRouter ou outro provedor compatível, configure também `LLM_API_URL`.

| Variável | Uso | Onde configurar |
|---|---|---|
| `LLM_API_KEY` | Chave privada usada pelo proxy do agente | Vercel ou outro ambiente server-side |
| `LLM_API_URL` | Endpoint opcional `.../chat/completions` do provedor | Vercel ou outro ambiente server-side |
| `LLM_MODEL` | Modelo opcional do provedor, como `gemini-3.8-flash` | Vercel ou outro ambiente server-side |
| `TAVILY_API_KEY` | Token privado da pesquisa web | Vercel ou outro ambiente server-side |
| `VITE_SUPABASE_URL` | URL do projeto Supabase | `.env` local e variáveis do deploy |
| `VITE_SUPABASE_ANON_KEY` | Chave pública anon do Supabase | `.env` local e variáveis do deploy |
| `VITE_LLM_API_KEY` | Chave para desenvolvimento local | Somente local; não recomendado em produção |
| `VITE_LLM_API_URL` | Endpoint OpenAI-compatible para desenvolvimento local | Somente local |
| `VITE_AGENT_API_URL` | Endpoint customizado opcional do agente | Somente quando necessário |

A chave anon do Supabase pode ser usada no frontend, mas as tabelas precisam estar protegidas por políticas RLS adequadas no projeto Supabase. O código não contém a chave privada do banco.

## Agente de IA

Em produção, o chat, a análise de imagens e o resumo de pesquisas usam `/api/agent`, que encaminha as requisições ao provedor configurado sem expor a chave no bundle do navegador. Em desenvolvimento local, o agente usa o endpoint direto apenas quando `VITE_LLM_API_KEY` estiver configurado ou quando uma chave local for salva nas configurações.

O agente oferece consulta de dados, criação e alteração de agendamentos, criação de clientes, análise de imagens, pesquisa web e síntese de voz pelo navegador. A pesquisa web utiliza `/api/search` e exige `TAVILY_API_KEY` no ambiente server-side.

## Publicação na Vercel

1. Importe o repositório na Vercel.
2. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `LLM_API_KEY` e, se desejar, `LLM_API_URL` e `TAVILY_API_KEY`.
3. Execute o build `npm run build`.
4. Publique o projeto. O `vercel.json` direciona as rotas da SPA para `index.html`, enquanto as funções em `api/` permanecem acessíveis.
5. Confirme no Supabase se as políticas RLS permitem as operações esperadas pelo usuário anônimo ou autenticado usado pelo aplicativo.

## Validação

| Comando | Finalidade |
|---|---|
| `npm run typecheck` | Verificação estrita de TypeScript |
| `npm test` | Testes unitários das regras críticas |
| `npm run build` | Build de produção e code splitting por rota |

## Licença

Proprietário. Uso interno.
