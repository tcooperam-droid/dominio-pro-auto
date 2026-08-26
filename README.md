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
│   └── assistente/          # Adaptadores do agente
├── lib/
│   ├── store.ts             # Fachada de compatibilidade
│   ├── store/               # Implementações por agregado
│   ├── analytics.ts         # Regras analíticas
│   ├── agentV2.ts           # Orquestração do agente
│   └── agentMedia.ts        # Imagem, pesquisa e voz
├── components/              # Componentes reutilizáveis
└── pages/                   # Telas carregadas por rota

api/
├── agent.js                 # Proxy server-side para GitHub Models
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

Para produção, configure os valores no provedor de hospedagem. O segredo do GitHub Models deve ser configurado como `GITHUB_MODELS_TOKEN`, sem o prefixo `VITE_`, para que permaneça no servidor e seja usado por `api/agent.js`.

| Variável | Uso | Onde configurar |
|---|---|---|
| `GITHUB_MODELS_TOKEN` | Token privado usado pelo proxy do agente | Vercel ou outro ambiente server-side |
| `TAVILY_API_KEY` | Token privado da pesquisa web | Vercel ou outro ambiente server-side |
| `VITE_SUPABASE_URL` | URL do projeto Supabase | `.env` local e variáveis do deploy |
| `VITE_SUPABASE_ANON_KEY` | Chave pública anon do Supabase | `.env` local e variáveis do deploy |
| `VITE_GITHUB_TOKEN` | Fallback direto para desenvolvimento local | Somente local; não recomendado em produção |
| `VITE_AGENT_API_URL` | Endpoint customizado opcional do agente | Somente quando necessário |

A chave anon do Supabase pode ser usada no frontend, mas as tabelas precisam estar protegidas por políticas RLS adequadas no projeto Supabase. O código não contém a chave privada do banco.

## Agente de IA

Em produção, o chat, a análise de imagens e o resumo de pesquisas usam `/api/agent`, que encaminha as requisições ao GitHub Models sem expor o token no bundle do navegador. Em desenvolvimento local, o agente usa o endpoint direto apenas quando `VITE_GITHUB_TOKEN` estiver configurado ou quando um token local for salvo nas configurações.

O agente oferece consulta de dados, criação e alteração de agendamentos, criação de clientes, análise de imagens, pesquisa web e síntese de voz pelo navegador. A pesquisa web utiliza `/api/search` e exige `TAVILY_API_KEY` no ambiente server-side.

## Publicação na Vercel

1. Importe o repositório na Vercel.
2. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GITHUB_MODELS_TOKEN` e, se desejar pesquisa web, `TAVILY_API_KEY`.
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
