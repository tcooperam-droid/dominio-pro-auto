# Agente pessoal — avaliação e arquitetura

## Resultado da avaliação

O protótipo enviado já tinha uma boa direção de produto: conversa em português, histórico, resumo e fatos persistentes. Porém, ele ainda era um módulo de chat acoplado ao aplicativo e não uma IA pessoal completa. Os principais riscos encontrados foram:

| Área | Situação do protótipo | Tratamento nesta versão |
|---|---|---|
| Identidade | Prompt fixo para um único usuário | Escopo de memória separado por perfil local |
| Memória | Tabelas novas, sem integração efetiva e com usuário fixo | Memória local estruturada para fatos, instruções, objetivos e feedback |
| Capacidade | Apenas chamada direta ao Gemini | Agente de propósito geral usando o mesmo gateway server-side do app |
| Agenda | Nenhuma integração | Ponte tipada para o `agentV2`, preservando confirmação, conflitos e validações |
| Aprendizado | Extração de fatos por prompt, sem controle operacional | Comandos explícitos, avaliação por 👍/👎 e contexto recuperado a cada chamada |
| Segurança | RLS desativado e risco de segredo no fluxo | Nenhum token novo no frontend; módulo reutiliza `/api/agent` |
| Evolução | A integração estava descrita como futura | Contrato `SchedulerBridge` pronto para trocar o adaptador sem reescrever o agente |

## O que foi implementado

O módulo vive em `src/features/agente-pessoal` e é acessível pela rota `/agente-pessoal`. Ele foi mantido separado do `agentV2` para que cada componente tenha uma responsabilidade clara:

- **Agente pessoal:** conversa geral, planejamento, escrita, explicações, objetivos, fatos, instruções e feedback.
- **Agente de agendamento:** operações transacionais da agenda e do cadastro, com suas confirmações e validações atuais.
- **Ponte:** classifica pedidos relacionados ao salão e encaminha a mensagem ao agente de agendamento, sem permitir que o agente pessoal simule uma alteração de banco.

A memória da primeira fase é local ao navegador e separada por perfil. Ela pode armazenar fatos confirmados, instruções ensinadas, objetivos ativos/concluídos, resumos e feedback. O botão **Limpar memória e conversa** apaga o contexto desse perfil.

## O que “treinar” significa aqui

Esta versão implementa **aprendizado operacional por memória e feedback**, não ajuste de pesos de um modelo. Isso é deliberado: treinar pesos exigiria uma coleta de dados consentida, anonimização, avaliação, pipeline de dataset, provedor de treinamento e uma forma de reverter versões. Para um agente pessoal, memória recuperável e instruções explícitas são mais rápidas de corrigir e mais transparentes para o usuário.

Um futuro treinamento pode usar os feedbacks exportados como dataset, mas não deve enviar automaticamente conversas privadas para um provedor. O caminho recomendado é: exportar, revisar, remover dados sensíveis, rotular exemplos, avaliar em conjunto de teste e somente então considerar fine-tuning ou um modelo especializado.

## Alternativas de evolução

| Abordagem | Trade-offs | Custo | Complexidade de configuração |
|---|---|---:|---:|
| Memória local + gateway atual (implementada) | Começa imediatamente, é reversível e não exige nova infraestrutura; não sincroniza automaticamente entre dispositivos | Uso normal do modelo e hospedagem existente | Baixa |
| Memória persistente no Supabase | Sincroniza entre dispositivos e permite relatórios; exige identidade real, RLS por usuário e migração cuidadosa | Banco e chamadas do modelo | Média |
| Serviço pessoal separado 24/7 | Permite tarefas de fundo, webhooks e integrações externas; exige hospedagem, observabilidade e gestão de segredos | Infraestrutura contínua + modelo | Alta |
| Fine-tuning de modelo | Pode especializar estilo ou tarefa; não substitui memória nem garante fatos atuais e é mais difícil de corrigir | Dataset, treinamento e inferência | Muito alta |

A alternativa mais leve seria manter somente o chat local; ela não foi escolhida porque o objetivo já inclui comunicação futura com o agente de agendamento. A solução implementada preserva esse caminho sem tornar o app dependente de um serviço sempre ligado.

## Como usar

1. Entre no app como proprietário ou gerente e abra **Agente pessoal**.
2. Converse livremente sobre temas pessoais ou de negócio.
3. Ensine uma preferência com frases como `Lembra que prefiro respostas objetivas` ou `Regra: sempre mostre os riscos antes da recomendação`.
4. Registre um objetivo com `Meu objetivo é estudar marketing`.
5. Para operações do app, use mensagens como `Quais agendamentos temos hoje?` ou `Agendar Maria para corte amanhã às 14h`; elas serão encaminhadas ao agente de agendamento.
6. Use os botões de feedback e limpe a memória quando quiser remover o contexto salvo no navegador.

## Próxima fase recomendada

Antes de transformar a memória em dados sincronizados, é necessário substituir o perfil local por um identificador de usuário autenticado e ativar RLS no banco. Depois disso, a ponte pode evoluir para um contrato de eventos, por exemplo `personal_agent.requested_schedule_action`, para que o agente pessoal não precise conhecer detalhes internos de agenda. Só após essa separação vale adicionar tarefas de fundo, notificações ou integrações externas.

## Validação

Os comandos esperados para validar o módulo são:

```bash
npm run typecheck
npm test
npm run build
```

O módulo não cria uma nova chave de API. Em produção, ele utiliza o proxy server-side `/api/agent`, `LLM_API_KEY` e opcionalmente `LLM_API_URL`. O GitHub Models foi aposentado e sua API retorna HTTP 410; por isso o projeto não depende mais desse serviço.
