# Modularização do Domínio Pro

## Resultado

O aplicativo foi reorganizado de forma incremental e validada. A primeira etapa separou o armazenamento monolítico; esta etapa concluiu a migração das dependências, corrigiu os contratos TypeScript, adicionou testes automatizados e criou um proxy server-side para o agente de IA em produção.

## Estrutura final

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
│   ├── relatorios/          # API pública das análises
│   └── assistente/          # Seleção do endpoint do agente
├── lib/
│   ├── store.ts             # Fachada de compatibilidade
│   ├── store/               # Agregados e persistência por domínio
│   ├── analytics.ts         # Cálculos derivados
│   ├── agentV2.ts           # Orquestração do agente
│   └── agentMedia.ts        # Imagem, pesquisa e voz
├── components/              # Componentes compartilhados
└── pages/                   # Telas lazy-loaded

api/
├── agent.js                 # Proxy server-side para GitHub Models
└── search.js                # Proxy server-side para Tavily
```

## Alterações concluídas

| Área | Resultado |
|---|---|
| Armazenamento | O `src/lib/store.ts` foi dividido em tipos, comissão, infraestrutura, funcionários, serviços, clientes, agenda, caixa, auditoria e bootstrap. |
| Fronteiras de domínio | As telas, a memória do agente e o agente principal usam APIs públicas em `src/features/`; não há mais imports de produção diretamente da fachada antiga. |
| Contratos | Todos os erros TypeScript existentes foram corrigidos, incluindo `commissionMode`, tipos de despesas, JSX, Google Maps e Capacitor. |
| Performance | As páginas são carregadas com `React.lazy` e `Suspense`, gerando chunks independentes por rota. |
| Segurança | Em produção, chat, visão e resumo usam `/api/agent`; o token fica em `GITHUB_MODELS_TOKEN` no ambiente server-side. |
| Ciclo de vida | O listener nativo opcional do Capacitor agora é removido corretamente no cleanup do hook. |
| Testes | Foram incluídos testes para comissão e identificação de bloqueios de agenda. |
| Compatibilidade | `src/lib/store.ts` continua exportando a API antiga para integrações externas ou migrações futuras. |

## Validação executada

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Aprovado, sem erros |
| `npm test` | Aprovado: 2 arquivos e 6 testes |
| `npm run build` | Aprovado |
| Verificação das funções serverless | `api/agent.js` e `api/search.js` incluídos no pacote |
| Verificação do pacote final | ZIP íntegro, sem `node_modules` e sem `dist` |

## Configuração de produção

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente de build. Configure `GITHUB_MODELS_TOKEN` e, caso utilize pesquisa web, `TAVILY_API_KEY` no ambiente server-side da Vercel. Não coloque tokens privados com prefixo `VITE_` em produção.

A chave anon do Supabase é destinada ao frontend, mas o acesso aos dados depende das políticas RLS configuradas no próprio projeto Supabase. Essa parte precisa ser conferida no painel do banco, pois não é possível validar as políticas apenas a partir do código frontend enviado.

## Uso do pacote

```bash
npm install
cp .env.example .env
npm run typecheck
npm test
npm run build
npm run dev
```

Para publicação na Vercel, importe o repositório, configure as variáveis de ambiente indicadas, mantenha o `vercel.json` e publique o projeto. As rotas da SPA serão direcionadas para `index.html` e as funções em `api/` serão disponibilizadas como endpoints serverless.
