# nestjs-metrics — Arquitetura, Implementação e Entrega

> Porta do pacote [`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics) para o ecossistema **NestJS + TypeScript**, entregue como **biblioteca npm** com um **módulo NestJS** plugável.

---

## 0. Decisões da sessão de revisão (grilling)

> **Estas decisões têm precedência sobre o restante do documento onde houver conflito.** Resultam de uma sessão de stress-test da arquitetura.

| # | Decisão | Racional resumido |
|---|---|---|
| 1 | **Cortar `QueryAdapter` da v0.1.** Acoplar o core direto ao `SelectQueryBuilder` do TypeORM. | Abstração especulativa com 1 só implementação; extrair só quando o 2º ORM existir. A `SqlDialect` strategy permanece (3 dialetos coexistem desde o dia 1). |
| 2 | **Validar identificadores:** `assertSafeIdentifier()` (allowlist regex) + escape do driver em `column`/`table`/`dateColumn`/`labelColumn`. | Lib pública; parâmetros nomeados não protegem identificadores. Fecha o vetor de SQL injection herdado do original. |
| 3 | **Porta idiomática, paridade como baseline (não dogma).** Quirks defensáveis são corrigidos e registrados em `DIVERGENCES.md`. DoD = "paridade de saída **exceto divergências documentadas**". | Permite corrigir bugs latentes do original (semana, heurística de data, `groupData` por ordem). |
| 4 | **Semana = ISO-8601 uniforme** via SQL por dialeto, com teste cross-dialeto. | Original é inconsistente (`Carbon::week` no PHP vs `%W`/`WEEK()`/`EXTRACT` no SQL). ISO é o padrão de analytics. |
| 5 | **Manter as 3 formas de uso** (`Metrics.query`, `MetricsService`+módulo, `metricsFor(repo)`) como fachadas finas sobre **um único core**; testes de fumaça por fachada. | Pedido explícito do usuário. Core único evita divergência de comportamento. |
| 6 | **Testes multi-dialeto reais (Testcontainers Postgres+MySQL) bloqueiam todo PR**, além de SQLite + snapshots de SQL. | Garantia dura de execução real desde a v0.1. |
| 7 | **Distribuição CJS-first** (`"type": "commonjs"`) + type declarations. Dual/ESM fica para uma major futura. | Ecossistema Nest/TypeORM é CJS; evita dual-package hazard nos enums/exceções. |
| 8 | **Atalho de entidade = `metricsFor(repo)`** (canônico) + extensão opcional de `Repository`. **Abandonar** o Active Record literal `Entity.metrics()`. | TypeORM é Data Mapper; clone sintático custaria amarrar a connection global e Active Record. Paridade é semântica, não sintática. |
| 9 | **Bucketing timezone-aware desde a v0.1**: opção `timezone` com conversão de fuso no SQL por dialeto. | Agrupamento por data é silenciosamente dependente do fuso da conexão; requisito do usuário. |
| 10 | **SQLite faz bucketing TZ-aware em JS (Luxon, DST-correto)**; Postgres/MySQL no SQL. Setup do contêiner MySQL **carrega as timezone tables**. | SQLite não tem TZ nativo; o caminho JS vira o oráculo DST-correto que valida o SQL dos outros dois. `CONVERT_TZ` sem tabelas retorna NULL silenciosamente. |
| 11 | **Config global via `forRoot({ locale?, timezone? })`** + **`forFeature({ locale?, timezone? })`** como override por escopo. Precedência: **opção da chamada > forRoot > default da lib** (`en` / `UTC`). | Decisões 9/10 criaram 2 defaults globais legítimos; o módulo deixa de ser cerimônia. |

---

## 1. Objetivo

Recriar, em NestJS/TypeScript, uma biblioteca que gera **métricas** (valores agregados) e **trends** (séries temporais para gráficos) a partir de entidades de banco de dados, através de uma **API fluente** equivalente à do `laravel-metrics`.

O resultado deve:

- Ser publicável no **npm** e importável como **módulo NestJS** (`MetricsModule`) e/ou classe standalone (`Metrics`).
- Suportar **PostgreSQL, MySQL/MariaDB e SQLite** (mesmos dialetos do original).
- Usar **TypeORM** como camada de acesso a dados (equivalente do Eloquent/Query Builder).
- Manter **paridade funcional e de formato de saída** com o original, validada por testes.

### Não-objetivos (v1)

- Não é um app/serviço HTTP — é uma lib (um app demo é roadmap, ver §13).
- Não fornece UI de gráficos; entrega apenas o **payload** (`{ labels, data }`) pronto para Chart.js/ApexCharts/etc.
- ~~Não suporta Prisma/Knex/Drizzle na v1.~~ **(Decisão 1, atualizada):** a abstração foi **extraída** quando o 2º backend surgiu (modo executor, ver §6.4). O core agora é dual-mode — o caminho TypeORM permanece intacto; um `ExecutorBackend` agnóstico de ORM emite SQL cru para qualquer `DataSource` `(sql, params) => rows`. Pacotes adapter (Prisma/Drizzle) são roadmap do monorepo `@metrics-kit` (PRD #16).

---

## 2. Análise do projeto original

O `laravel-metrics` é uma **biblioteca** (não um app). Núcleo em ~1.200 linhas:

| Arquivo | Responsabilidade |
|---|---|
| `src/LaravelMetrics.php` (874 ln) | Builder fluente: aggregates, períodos, `metrics()`, `trends()`, `metricsWithVariations()`, grouped data, fill missing |
| `src/DatesFunctions.php` (252 ln) | **SQL por dialeto** (extração de dia/semana/mês/ano), cálculo de janelas de período, geração de labels de datas, tradução por locale (Carbon) |
| `src/Enums/Aggregate.php` | `count`/`avg`/`sum`/`max`/`min` |
| `src/Enums/Period.php` | `today`/`day`/`week`/`month`/`year` |
| `src/HasMetrics.php` | Trait `Order::metrics()` (atalho a partir do model) |
| `src/LaravelMetricsFacade.php` | Facade Laravel |
| `src/Exceptions/*` | 4 exceções de validação (período, aggregate, formato de data, count de variação) |

### 2.1 Superfície da API (a replicar)

**Entrada do builder**
- `query(builder)` — a partir de um Query/Eloquent builder.
- `Order::metrics()` — atalho via trait.
- `table(name)`, `dateColumn(col)` (default `created_at`), `labelColumn(col)`.

**Aggregates** — `count(col='id')`, `average(col)`, `sum(col)`, `max(col)`, `min(col)`.

**Períodos**
- `byDay(n)`, `byWeek(n)`, `byMonth(n)`, `byYear(n)` — `n=0` → período atual; `n=1` → ponto único; `n>1` → janela.
- `between(start, end, isoFormat)`, `from(date, isoFormat)`.
- `forDay/forWeek/forMonth/forYear(value)` — fixa o ponto de referência.
- `groupByDay/Week/Month/Year()` — granularidade (apenas com `between`).

**Combinações** — `countByMonth`, `sumByYear`, `averageBetween`, `maxFrom`, … (produto cartesiano aggregate × período).

**Saídas**
- `metrics(): number` — valor agregado único.
- `trends(inPercent=false): { labels: string[], data: number[] }` — série para gráfico.
- `metricsWithVariations(prevCount, prevPeriod, inPercent): { count, variation: { type, value } }`.

**Modificadores de saída**
- `fillMissingData(value=0, labels=[])` — preenche buracos da série (descobre labels automaticamente).
- `groupData(labels[], aggregate)` — quebra uma coluna categórica em múltiplos datasets (`{ labels, data: { total, <label>: [] } }`).
- `trends(true)` — converte série em percentuais.

**Locale** — nomes de dias/meses traduzidos via `app.locale` (Carbon). Semana fica `Week N`.

### 2.2 O ponto sensível: SQL por dialeto

`formatPeriod()` e `formatDateColumn()` emitem SQL **diferente por driver**:

| Conceito | MySQL | PostgreSQL | SQLite |
|---|---|---|---|
| dia | `day(col)` | `EXTRACT(DAY FROM col)` | `CAST(strftime('%d', col) AS INTEGER)` |
| semana | `week(col)` | `EXTRACT(WEEK FROM col)` | `CAST(strftime('%W', col) AS INTEGER)` |
| mês | `month(col)` | `EXTRACT(MONTH FROM col)` | `CAST(strftime('%m', col) AS INTEGER)` |
| ano | `year(col)` | `EXTRACT(YEAR FROM col)` | `CAST(strftime('%Y', col) AS INTEGER)` |
| data | `date(col)` | `TO_CHAR(col,'YYYY-MM-DD')` | `strftime('%Y-%m-%d', col)` |

Esse é o coração da portabilidade: precisa ser uma **estratégia por dialeto** isolada e fortemente testada.

---

## 3. Decisões arquiteturais

| Decisão | Escolha | Justificativa |
|---|---|---|
| Linguagem | TypeScript 5.x (strict) | Tipagem da API fluente |
| Framework alvo | NestJS 10+ | Módulo `forRoot/forFeature` injetável |
| Acesso a dados | **TypeORM 0.3** (`DataSource`/`SelectQueryBuilder`) | Equivalente mais direto do Eloquent no Nest |
| Datas/locale | **Luxon** | Substitui Carbon: `DateTime`, intervalos, `toLocaleString`, nomes de meses/dias por locale |
| Testes | **Vitest** (ou Jest) + **better-sqlite3** in-memory | Espelha a suíte SQLite do original; testes de integração reais contra Postgres/MySQL via Docker |
| Build | **tsup** (ESM+CJS+d.ts) ou `tsc` | Dual package, tipos publicados |
| Lint/format | ESLint + Prettier | Equivalente ao Pint |
| Versionamento | SemVer + **Changesets** | Automatiza changelog e publish |
| CI/CD | GitHub Actions | Matriz de dialetos + publish no npm |

### Equivalências de conceito

| Laravel | nestjs-metrics |
|---|---|
| Eloquent `Builder` / Query `Builder` | TypeORM `SelectQueryBuilder<T>` |
| `Carbon` | `luxon.DateTime` |
| `config('app.locale')` | opção `locale` do módulo / parâmetro |
| Trait `HasMetrics` | Mixin/decorator `withMetrics()` ou método estático no repositório |
| Facade | Provider injetável `MetricsService` |
| Enum PHP | `enum`/`as const` TS |
| Exceptions | classes que estendem Nest `BadRequestException`/custom |

---

## 4. Arquitetura do pacote

### 4.1 Camadas

```
┌─────────────────────────────────────────────────────────┐
│  API pública (fluent)                                    │
│  Metrics.query(qb) ─► .sum('amount').byMonth().trends()  │
├─────────────────────────────────────────────────────────┤
│  Core                                                    │
│  • MetricsBuilder   (estado fluente + orquestração)      │
│  • AggregateRunner  (monta SELECT, executa, normaliza)   │
│  • TrendsFormatter  (labels/data, percent, fill, group)  │
│  • VariationsCalc   (metricsWithVariations)              │
├─────────────────────────────────────────────────────────┤
│  Dialect Strategy        │  Date/Locale Service          │
│  • PostgresDialect       │  • PeriodResolver (janelas)   │
│  • MySqlDialect          │  • LabelFormatter (luxon)     │
│  • SqliteDialect         │  • PeriodSeriesGenerator      │
│  (interface SqlDialect)  │    (datas faltantes)          │
├─────────────────────────────────────────────────────────┤
│  Data Adapter                                            │
│  • TypeOrmAdapter (SelectQueryBuilder, driver detect)    │
│  (interface QueryAdapter ─ portas p/ futuros ORMs)       │
├─────────────────────────────────────────────────────────┤
│  NestJS Integration                                      │
│  • MetricsModule.forRoot({ dataSource, locale })         │
│  • MetricsService (provider injetável)                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Componentes principais

- **`MetricsBuilder`** — guarda o estado fluente (período, aggregate, coluna, label, count, year/month/day/week, flags de fill/group). Cada método `byMonth()/sum()/...` retorna `this`. É **imutável-friendly**: `clone()` para `metricsWithVariations`.
- **`SqlDialect` (interface)** — `periodExpr(part, col)`, `dateExpr(col)`, `weekOfYear()`, etc. Implementações por driver. Selecionada via `adapter.getDriver()`.
- **`QueryAdapter` (interface)** — abstrai o ORM: `clone()`, `selectRaw(expr, bindings)`, `whereYear/Month/Between`, `groupBy`, `get()/first()`, `getDriver()`, `getTable()`. `TypeOrmAdapter` é a única impl. da v1.
- **`PeriodResolver`** — porta de `getDayPeriod/getWeekPeriod/getMonthPeriod` (cálculo das janelas `[início, fim]`).
- **`LabelFormatter`** — porta de `formatDate`/`formatPeriod` para labels legíveis (Luxon + locale).
- **`PeriodSeriesGenerator`** — porta de `getMonthsData/getDaysData/...` para `fillMissingData`.
- **`TrendsFormatter`** — porta de `formatTrends`, `populateMissingData*`, `trendsWithMergedData`.

### 4.3 Estrutura de pastas

```
nestjs-metrics/
├─ src/
│  ├─ index.ts                    # barrel exports públicos
│  ├─ metrics.builder.ts          # MetricsBuilder (fluent core)
│  ├─ metrics.module.ts           # NestJS MetricsModule.forRoot/forFeature
│  ├─ metrics.service.ts          # provider injetável
│  ├─ enums/
│  │  ├─ aggregate.enum.ts
│  │  └─ period.enum.ts
│  ├─ dialects/
│  │  ├─ sql-dialect.interface.ts
│  │  ├─ postgres.dialect.ts
│  │  ├─ mysql.dialect.ts
│  │  ├─ sqlite.dialect.ts
│  │  └─ dialect.factory.ts
│  ├─ adapters/
│  │  ├─ query-adapter.interface.ts
│  │  └─ typeorm.adapter.ts
│  ├─ dates/
│  │  ├─ period-resolver.ts
│  │  ├─ label-formatter.ts
│  │  └─ period-series.generator.ts
│  ├─ formatting/
│  │  ├─ trends.formatter.ts
│  │  └─ variations.calculator.ts
│  ├─ exceptions/
│  │  ├─ invalid-aggregate.exception.ts
│  │  ├─ invalid-period.exception.ts
│  │  ├─ invalid-date-format.exception.ts
│  │  └─ invalid-variations-count.exception.ts
│  └─ types.ts                    # TrendsResult, MetricsResult, opções
├─ test/
│  ├─ helpers/datasource.ts       # sqlite :memory: + seed orders
│  ├─ metrics.spec.ts
│  ├─ trends.spec.ts
│  ├─ variations.spec.ts
│  ├─ fill-missing.spec.ts
│  ├─ group-data.spec.ts
│  ├─ dialects.spec.ts            # integração Postgres/MySQL (Docker)
│  └─ exceptions.spec.ts
├─ docs/ARCHITECTURE.md
├─ package.json
├─ tsconfig.json / tsconfig.build.json
├─ tsup.config.ts
├─ vitest.config.ts
├─ .eslintrc / .prettierrc
├─ .changeset/
└─ .github/workflows/{ci.yml,release.yml}
```

---

## 5. Desenho da API pública

### 5.1 Standalone (espelha `LaravelMetrics::query`)

```ts
import { Metrics } from 'nestjs-metrics';

// trend de soma de amount por mês do ano corrente
const result = Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byMonth(6)
  .trends();
// => { labels: ['January', ...], data: [1200, ...] }

const total = Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byYear()
  .metrics(); // => number
```

> Como TypeORM é assíncrono, os terminais retornam `Promise`: `await ...trends()`, `await ...metrics()`. Essa é a principal diferença vs. o PHP síncrono.

### 5.2 Via NestJS module + service

```ts
@Module({
  imports: [
    MetricsModule.forRoot({ dataSource, locale: 'pt-BR' }),
  ],
})
export class AppModule {}

@Injectable()
class DashboardService {
  constructor(private readonly metrics: MetricsService) {}

  monthlyRevenue() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }
}
```

### 5.3 Atalho a partir da entidade (equivalente ao trait)

```ts
// helper que injeta .metrics() no repositório
const builder = metricsFor(orderRepo); // QueryBuilder pré-configurado
await builder.countByMonth().trends();
```

### 5.4 Tipos de retorno

```ts
type TrendsResult = { labels: (string | number)[]; data: number[] };
type GroupedTrendsResult = {
  labels: (string | number)[];
  data: { total: number[]; [group: string]: number[] };
};
// Normalized discriminated shape (see DIVERGENCES.md §6).
type VariationResult = {
  count: number;
  variation: { type: 'none' | 'increase' | 'decrease'; value: number | string };
};
```

---

## 6. Detalhes de portabilidade (riscos técnicos)

### 6.1 Síncrono → assíncrono
O PHP executa queries inline. Em TypeORM, `getRawOne/getRawMany` são `async`. **Decisão:** apenas os métodos terminais (`metrics`, `trends`, `metricsWithVariations`) são `async`; todo o builder fluente permanece síncrono e encadeável.

### 6.2 `selectRaw` + bindings
O original usa `selectRaw('avg(col) as data, ...')` e bindings posicionais (`?`) no `groupData`. TypeORM usa `addSelect(expr, alias)` + parâmetros nomeados (`:p0`). O `TypeOrmAdapter` traduz `?` posicional → parâmetros nomeados gerados.

### 6.3 Detecção de driver
`builder.getConnection().getDriverName()` → `dataSource.options.type` (`postgres`/`mysql`/`mariadb`/`sqlite`/`better-sqlite3`). `DialectFactory.for(type)` retorna a estratégia certa; `mariadb` mapeia para `MySqlDialect`.

### 6.4 Abstração de ORM — **extraída (Decisão 1, cumprida)**
A interface foi extraída quando o 2º backend surgiu, não desenhada especulativamente. O core é **dual-mode** por trás de `QueryBackend`: o builder monta um `QueryPlan` backend-neutro (select/where/group/order + params `:name`), e um backend o renderiza:
- **`TypeOrmBackend`** — o caminho original, sobre o `SelectQueryBuilder`, com comportamento e escaping do driver **inalterados**.
- **`ExecutorBackend`** — monta um SQL cru parametrizado e o executa via um `DataSource` agnóstico `(sql, params) => rows` (Prisma/Drizzle/qualquer driver). Placeholders `:name` viram posicionais (`$n` no Postgres, `?` no MySQL/SQLite); tipos crus do driver passam por `normalize()` no boundary.

A `SqlDialect` strategy existe desde o dia 1 (os três dialetos coexistem) e ganhou `escapeId`/`placeholder` para o modo executor.

### 6.7 Segurança de identificadores (Decisão 2)
`column`/`table`/`dateColumn`/`labelColumn` são interpolados crus no SQL (herança do original). Como é uma lib pública e parâmetros nomeados **não** protegem identificadores, todo identificador passa por `assertSafeIdentifier()` (allowlist `^[a-zA-Z_][a-zA-Z0-9_.]*$`) + escape (driver no `TypeOrmBackend`, `dialect.escapeId` no `ExecutorBackend`) antes de entrar no SQL. Valores fluem **somente** como parâmetros ligados. Documenta-se que o ideal continua sendo input controlado pelo dev.

**Escape hatch `from` (modo executor):** `ExecutorSpec.from` aceita um fragmento `FROM` cru (para joins/subqueries que o `{ table }` estruturado não expressa). Esse fragmento é interpolado **sem** sanitização — é uma **superfície confiável do dev**, explicitamente não para input do usuário final. É o único ponto fora da regra de allowlist acima, registrado aqui de propósito.

### 6.8 Fuso horário (Decisões 9 e 10)
Opção `timezone` (IANA) na chamada/`forRoot`/`forFeature`. Conversão por dialeto: Postgres `col AT TIME ZONE`, MySQL `CONVERT_TZ()` (**exige timezone tables carregadas** no contêiner — senão retorna NULL silencioso), SQLite **faz o bucketing em JS** (Luxon, DST-correto), que serve de oráculo para validar o SQL dos outros dois. Default `UTC`.

### 6.5 Locale / nomes de datas
Carbon `->locale(x)->monthName` → Luxon `DateTime.fromObject({...},{locale}).toLocaleString({ month: 'long' })`. Cobrir paridade de nomes em `en` e `pt-BR` com snapshots de teste. Atenção a diferenças de numeração de semana (ISO vs. Carbon `%W`).

### 6.6 Decimais
SQLite/Postgres podem retornar agregados como string. Normalizar via `Number()`/`parseFloat` no `AggregateRunner`, como o `(float)` do PHP.

---

## 7. Plano de implementação

Abordagem **TDD** (red-green-refactor), portando a suíte de testes do original como **spec executável** — cada teste PHP vira um teste Vitest, garantindo paridade observável.

### Fase 0 — Bootstrap (0,5 dia)
- `package.json`, `tsconfig` strict, ESLint/Prettier, tsup, Vitest.
- Helper de teste: `DataSource` SQLite in-memory + tabela `orders` (`id, status, amount, created_at, updated_at`) e seed — espelha `tests/TestCase.php`.
- CI mínima (lint + test) verde.

### Fase 1 — Núcleo: metrics() em SQLite (1,5 dia)
- `enums`, `exceptions`, `QueryAdapter` + `TypeOrmAdapter`, `SqliteDialect`.
- `MetricsBuilder` com aggregates + `byDay/Week/Month/Year` + `metrics()`.
- Porta de `MetricsTest.php`. **Saída:** `metrics()` correto para todos os aggregates/períodos em SQLite.

### Fase 2 — trends() + labels/locale (2 dias)
- `LabelFormatter` (Luxon), `TrendsFormatter`, `PeriodResolver`.
- `trends()`, `trends(true)` (percent), `labelColumn`, `dateColumn`, `between`/`from`, `forX`.
- Porta de `TrendsTest.php`. **Saída:** trends com nomes de meses/dias traduzidos.

### Fase 3 — fillMissingData + groupData + groupBy (2 dias)
- `PeriodSeriesGenerator`, `populateMissingData*`, `trendsWithMergedData`, `groupBy*`.
- Porta de `FillMissingDataTest.php` e `GroupDataTest.php`.

### Fase 4 — metricsWithVariations + exceções (1 dia)
- `VariationsCalculator`, `clone()` do builder, validações.
- Porta de `MetricsWithVariationsTest.php` e `ExceptionsTest.php`.

### Fase 5 — Multi-dialeto (1,5 dia)
- `PostgresDialect`, `MySqlDialect`, `DialectFactory`.
- `test/dialects.spec.ts` rodando contra Postgres e MySQL reais via **Testcontainers/docker-compose** na CI (matriz).

### Fase 6 — Integração NestJS (1 dia)
- `MetricsModule.forRoot/forFeature`, `MetricsService`, helper `metricsFor(repo)`.
- Teste de integração: `Test.createTestingModule` resolvendo `MetricsService`.

### Fase 7 — DX, docs e exemplos (1 dia)
- README com a mesma estrutura de exemplos do original (tabela de combinações).
- JSDoc/TSDoc na API pública, exemplos `examples/` com Chart.js payload.

**Estimativa total:** ~10,5 dias úteis (1 dev).

### 7.1 Critérios de "pronto" (Definition of Done)
- Todos os testes portados passam (paridade de saída com o original em `en`).
- Matriz CI verde em SQLite + Postgres + MySQL.
- Cobertura ≥ 85% no core (`dialects`, `dates`, `formatting`).
- `npm pack` gera ESM+CJS+`.d.ts`; `tsc --noEmit` limpo no projeto consumidor.
- README + CHANGELOG + exemplos.

---

## 8. Estratégia de testes

| Camada | Tipo | Ferramenta |
|---|---|---|
| Builder/formatters | Unit | Vitest (puro, sem DB) |
| metrics/trends/fill/group | Integração leve | Vitest + SQLite `:memory:` |
| Dialetos Postgres/MySQL | Integração real | Testcontainers / docker-compose |
| Módulo NestJS | Integração | `@nestjs/testing` |
| Paridade de SQL | Snapshot | snapshot da string SQL por dialeto |
| Locale | Snapshot | `en` + `pt-BR` |

**Princípio:** cada teste do `tests/` PHP tem um espelho. Divergências intencionais (ex.: async) ficam documentadas no teto do arquivo de spec.

---

## 9. Empacotamento e build

`package.json` (essencial):

```jsonc
{
  "name": "nestjs-metrics",
  "version": "0.1.0",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "require": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist"],
  "peerDependencies": {
    "@nestjs/common": "^10 || ^11",
    "typeorm": "^0.3"
  },
  "dependencies": { "luxon": "^3" },
  "sideEffects": false
}
```

- **peerDependencies** para Nest/TypeORM (não duplicar a instância do consumidor).
- **Build CJS-first + types** via **tsup** (Decisão 7): formato único, sem dual-package hazard nos enums/exceções. Promoção a dual/ESM fica para uma major futura.
- `prepublishOnly`: `lint && test && build`.

---

## 10. CI/CD e publicação ("subida")

### 10.1 `ci.yml` (PR e push)
- Matriz: Node 18/20/22 × dialeto {sqlite, postgres(service), mysql(service)}.
- Passos: install → lint → typecheck → test (com containers de DB) → build → `npm pack --dry-run`.

### 10.2 `release.yml` (publicação)
- **Changesets**: PRs incluem um changeset; merge na `main` abre/atualiza o "Version Packages" PR.
- Ao mergear o PR de versão: `changeset publish` → publica no **npm** (token `NPM_TOKEN`) e cria tag/GitHub Release com changelog.
- Provenance: `npm publish --provenance` (supply-chain).

```yaml
# release.yml (resumo)
on: { push: { branches: [main] } }
jobs:
  release:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with: { publish: pnpm release }   # = changeset publish
        env: { NPM_TOKEN: ${{ secrets.NPM_TOKEN }}, GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

### 10.3 Versionamento
- **SemVer.** v0.x enquanto a API estabiliza; `1.0.0` ao atingir paridade total + dialetos validados.
- Branch `main` protegida; releases só via PR de changeset.

### 10.4 Checklist de primeira publicação
1. Reservar o nome `nestjs-metrics` no npm (`npm view nestjs-metrics`).
2. Configurar `NPM_TOKEN` (automation) nos secrets do repo.
3. `LICENSE` (MIT, como o original), `README`, `CHANGELOG` inicial.
4. `npm publish --dry-run` local para validar `files`/`exports`.
5. Tag `v0.1.0` + GitHub Release.

---

## 11. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Diferenças sutis de SQL entre dialetos (semana ISO vs `%W`) | Trends incorretos | Testes de integração reais por dialeto + snapshots de SQL |
| Paridade de locale (nomes de meses) | Labels divergem do original | Snapshots em `en`/`pt-BR`; documentar fonte (Luxon ICU) |
| Async quebra ergonomia esperada | DX | Documentar claramente; só terminais são `async` |
| Bindings posicionais → nomeados (groupData) | SQL inválido/injeção | Adapter centraliza a tradução; testes de injeção |
| Acoplamento a TypeORM | Limita adoção | `QueryAdapter` isola o ORM desde a v1 |
| Agregados como string (driver) | Tipos errados | Normalização numérica central |

---

## 12. Mapa de paridade (rastreabilidade)

| Original (PHP) | Porta (TS) | Fase |
|---|---|---|
| `LaravelMetrics::query` / aggregates / `byX` | `MetricsBuilder` | 1–2 |
| `DatesFunctions::formatPeriod/formatDateColumn` | `dialects/*` | 1,5 |
| `formatDate` / locale | `LabelFormatter` | 2 |
| `getXPeriod` (janelas) | `PeriodResolver` | 2–3 |
| `getXData` (séries) | `PeriodSeriesGenerator` | 3 |
| `formatTrends`/`populateMissingData*`/`trendsWithMergedData` | `TrendsFormatter` | 2–3 |
| `metricsWithVariations` | `VariationsCalculator` | 4 |
| `HasMetrics` trait | `metricsFor(repo)` | 6 |
| Facade | `MetricsService` | 6 |
| `Enums/Exceptions` | `enums/`, `exceptions/` | 1 |

---

## 13. Roadmap pós-v1

- **App demo NestJS** (monorepo pnpm/Nx) com endpoints REST de dashboard — equivalente ao `laravel-metrics-demo`.
- Adapters **Prisma** e **Knex/Drizzle** — via **extração** da interface a partir de 2 casos reais (Decisão 1), não pré-construída.
- Cache opcional de queries (`@nestjs/cache-manager`).
- ~~Suporte a fuso horário~~ — **antecipado para a v0.1** (Decisões 9/10).
- Helpers de saída prontos para Chart.js/ApexCharts/Recharts.

---

## 14. Resumo executivo

Porta fiel do `laravel-metrics` como **lib npm + módulo NestJS** sobre **TypeORM**, com **Luxon** para datas/locale e **estratégias de dialeto** isoladas e testadas contra bancos reais. Entrega guiada por **TDD com a suíte do original como espec**, publicada via **Changesets + GitHub Actions** no npm. ~10,5 dias para v0.1 com paridade funcional; `1.0.0` após validação multi-dialeto e estabilização da API.
