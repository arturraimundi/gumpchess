# Rep: app de organização de repúblicas

App React Native (Expo + expo-router + TypeScript) com backend Supabase (Postgres + Auth + RLS).

## Comandos
- `npm test`: testes da lógica de negócio (`src/domain/*.test.ts`, Node test runner, sem dependências)
- `npm run test:db`: aplica as migrations num Postgres temporário e roda `supabase/tests/db_test.sql`
- `npm run typecheck`: TypeScript do app inteiro (precisa de `npm install`)
- `npm start`: Expo (precisa de `.env`, veja `.env.example`)

## Arquitetura
- `src/domain/`: regras puras e testadas (divisão de contas, código de convite, relatórios, dinheiro).
  Não importe React, Supabase nem nada de runtime aqui. Imports internos só `import type ... from './x.ts'`.
- `src/lib/api.ts`: único lugar que fala com o Supabase. Telas não chamam `supabase` direto.
- `src/context/`: sessão (AuthContext) e república atual, membros e categorias (RepublicContext).
- `app/`: telas (expo-router). `(tabs)` = Resumo, Contas, Moradores, Ajustes.
- `supabase/migrations/`: schema, RLS e RPCs. Nunca edite uma migration já aplicada em produção; crie outra.

## Regras de negócio
- Dinheiro sempre em centavos inteiros (`bigint` no banco, `number` inteiro no app). Nunca float.
- Divisão padrão: igual entre todos os moradores ativos. Centavos que sobram vão para os primeiros da lista.
  A soma das partes tem que ser exatamente o total (o banco recusa se não for).
- Mês de competência (`reference_month`) é sempre o dia 1 do mês.
- Código de convite: 7 dígitos, gerado no servidor com `gen_random_bytes`, só um ativo por república,
  validade de 5 min a 7 dias, limite de 10 tentativas erradas por hora por usuário.
- Quem sai da república não é apagado (`left_at`): o histórico de gastos continua correto.
- Escritas sensíveis passam por RPC `security definer` que valida permissão; tabelas protegidas por RLS.

## Ao implementar algo
1. Regra nova de negócio → função em `src/domain` + teste antes.
2. Mudança no banco → nova migration + caso em `supabase/tests/db_test.sql` (inclua o caso de acesso negado).
3. Rode `npm test` (e `npm run test:db` se mexeu no banco). Uma tarefa só termina com tudo passando.
4. Textos da interface em português do Brasil.
