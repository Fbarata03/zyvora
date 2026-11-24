# ZYVORA — Plataforma SaaS de automação empresarial com IA

Monorepo inicial com frontend React/Vite e backend Node.js/Express, Prisma, PostgreSQL, Redis e BullMQ.

## Estrutura

- `src/`: aplicação frontend Atlas (português, light/dark).
- `src/api.js`: cliente HTTP com access token em memória e refresh cookie HttpOnly.
- `server/src/routes`: autenticação, workspaces, IA, workflows, agentes, execuções, integrações, equipa, analytics, billing e settings.
- `server/src/services/ai.js`: adaptador OpenAI-compatible para chat e geração de planos; modo fallback sem chave.
- `server/src/workers/worker.js`: worker BullMQ. Nesta fase executa apenas simulação segura; não dispara ações externas.
- `server/prisma/schema.prisma`: modelo multi-tenant com memberships, RBAC, conversas, planos, workflows, agentes, execuções e logs.

## Requisitos

- Node.js 20+
- Docker Desktop + Docker Compose (recomendado)

## Arranque completo com Docker

1. Criar a configuração do backend:
   ```bash
   cp server/.env.example server/.env
   ```
2. Definir `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` com segredos aleatórios fortes. Para ativar IA, preencher `AI_API_KEY` e ajustar `AI_MODEL` / `AI_BASE_URL`.
3. Na raiz do projeto:
   ```bash
   docker compose up --build
   ```
4. Abrir frontend `http://localhost:5173`, API `http://localhost:4000` e health `http://localhost:4000/health`.

O Compose inicializa PostgreSQL, Redis, API, worker e frontend. A API executa `prisma db push` no arranque para ambiente local. Em produção, usar migrations versionadas (`npm run db:migrate` em desenvolvimento e `npm run db:deploy` no deploy).

## Arranque manual

### Infraestrutura
```bash
docker compose up -d postgres redis
```

### Backend
```bash
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```
Noutro terminal:
```bash
cd server
npm run worker
```

### Frontend
```bash
# na raiz
npm install
npm run dev
```

## Autenticação de demonstração

O registo e login por email/palavra-passe estão ligados à API. O registo cria um utilizador, workspace e membership OWNER. O frontend mantém o access token em memória; o refresh token é colocado num cookie HttpOnly.

## API principal

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/PATCH /api/workspaces/:workspaceId`
- `POST /api/ai/conversations`, `GET /api/ai/conversations`, `POST /api/ai/conversations/:id/messages`
- `POST /api/ai/plans`, `GET /api/ai/plans`, `POST /api/ai/plans/:id/approve`
- `GET/POST/PATCH /api/workflows`
- `GET/POST/PATCH /api/agents`
- `POST/GET /api/executions`, `GET /api/activity`
- `GET /api/integrations`, `POST /api/integrations/:provider/connect|disconnect`
- `GET/POST /api/team`, `PATCH /api/team/:membershipId/role`
- `GET /api/analytics/summary`, `GET /api/billing/subscription`, `GET/PATCH /api/settings`

A maioria dos endpoints operacionais recebe `workspaceId` na query ou body; as rotas de workspace usam-no no path. A autorização multi-tenant valida a membership no servidor em cada pedido.

### Papéis

| Papel | Pode |
| --- | --- |
| `VIEWER` | Apenas ler. |
| `MEMBER` | Criar e editar rascunhos de workflows e agentes, conversar com a IA, gerar planos e lançar execuções. Os agentes que cria ficam em pausa. |
| `ADMIN` / `OWNER` | Tudo o anterior, mais aprovar planos, ativar workflows e agentes, alterar workflows e agentes ativos, gerir integrações e equipa. |

Os pedidos à IA (mensagens e planos) estão limitados por utilizador: `AI_RATE_LIMIT_PER_MINUTE` (20) e `AI_RATE_LIMIT_PER_DAY` (500). O limite é guardado em memória, por processo; com várias instâncias da API, usar um store Redis.

## Estado real vs. por configurar

- **Implementado:** autenticação local, hash de password, refresh tokens rotativos, RBAC por workspace, persistência PostgreSQL, filas Redis/BullMQ, chat com fornecedor compatível com OpenAI, geração de plano e aprovação que cria workflow, logs e analytics básicos.
- **Simulado de forma segura:** o worker conclui uma execução em modo `safe-simulation`; não executa emails, pagamentos, CRM nem chamadas externas.
- **Ainda requer credenciais/adaptadores:** OAuth real para Slack/HubSpot/Google/etc., envio de convites, billing Stripe, MFA, verificação de email, streaming de chat e execução real de cada conector. Os endpoints não fingem que estas integrações estão ligadas.

## Segurança antes de produção

Usar HTTPS, segredos geridos por secret manager, backups, migrations, política de retenção, monitorização, proteção CSRF adequada à estratégia de cookies, verificação de email, MFA, testes de autorização multi-tenant, auditoria e revisão dos scopes OAuth. Nunca guardar tokens de integração no frontend. Não expor `AI_API_KEY` ao Vite.
