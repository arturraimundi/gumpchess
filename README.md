# Rep: organização de repúblicas

App mobile (React Native + Expo) para dividir as contas da república sem planilha.

## Funcionalidades
- **Repúblicas com admin e moradores.** Quem cria vira admin, e admins podem promover outros moradores, remover pessoas e gerenciar as contas.
- **Entrada por código temporário de 7 dígitos.** A validade vai de 1 hora a 7 dias. Gerar um código novo invalida o anterior, e há um limite de tentativas erradas.
- **Contas padrão e adicionais, fixas e variáveis.** A república já nasce com Aluguel, Condomínio, Internet, Luz, Água, Gás, Mercado e Produtos de limpeza, e o admin pode criar outras (com valor sugerido).
- **Divisão de cada conta.** Por padrão a conta é dividida igualmente entre todos os moradores. Também dá para escolher só algumas pessoas, dividir por percentual ou por valores exatos. O admin pode salvar a divisão como padrão de uma categoria (ex.: a internet dividida só entre 3).
- **Gráficos e relatórios.** O app mostra o total por mês (fixas × variáveis, últimos 6 meses), o que aumentou em relação ao mês anterior por categoria, quanto cada um gastou e pagou no período (1, 3, 6 ou 12 meses) e quem precisa pagar quem.
- **Histórico consistente.** Valores ficam em centavos, cada conta guarda a parte de cada morador e quem sai da república continua no histórico.

## Rodando

1. Crie um projeto em [supabase.com](https://supabase.com) e rode a migration:
   - com a CLI: `supabase link --project-ref SEU_REF && supabase db push`
   - ou cole `supabase/migrations/20261126000000_init.sql` no SQL Editor.
2. `cp .env.example .env` e preencha URL e anon key (Project Settings → API).
3. Instale e abra:
   ```bash
   npm install
   npx expo install --fix   # alinha as versões com o SDK do Expo
   npm start                # escaneie o QR code com o app Expo Go
   ```

## Testes
```bash
npm test          # lógica de divisão, convites, relatórios e dinheiro
npm run test:db   # migrations + RLS + RPCs num Postgres temporário (precisa de Postgres instalado)
npm run typecheck
```
O CI (`.github/workflows/ci.yml`) roda os três em todo PR.

## Estrutura
```
app/                 telas (expo-router)
  (tabs)/            Resumo · Contas · Moradores · Ajustes
  bill/new.tsx       lançar conta com divisão
  bill/[id].tsx      detalhe, quem pagou, acertos
src/domain/          regras de negócio puras + testes
src/lib/api.ts       acesso ao Supabase
supabase/migrations  schema, RLS, RPCs e views de relatório
supabase/tests       testes de integração do banco
```

Desenvolvendo com Claude Code: o `CLAUDE.md` descreve as convenções, e o hook em `.claude/settings.json` roda os testes antes de o Claude dar uma tarefa por concluída.
