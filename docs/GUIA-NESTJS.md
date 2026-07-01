# Guia Completo — `nestjs-metrics`

> Gere **métricas** (valores agregados) e **trends** (séries temporais prontas para
> gráficos) a partir de entidades TypeORM, com uma API fluente e integração NestJS.

---

## Sumário

- [Instalação](#instalação)
- [Registro do Módulo](#registro-do-módulo)
- [O MetricsService](#o-metricsservice)
- [Entry Points (formas de começar)](#entry-points-formas-de-começar)
- [Agregadores (Aggregates)](#agregadores-aggregates)
- [Períodos (Periods)](#períodos-periods)
- [Janelas (Window Semantics)](#janelas-window-semantics)
- [Ranges de Data (between / from)](#ranges-de-data-between--from)
- [Granularidade em Ranges (groupBy*)](#granularidade-em-ranges-groupby)
- [Referência Temporal (forDay / forWeek / forMonth / forYear)](#referência-temporal-forday--forweek--formonth--foryear)
- [Shorthands Combinados](#shorthands-combinados)
- [Coluna de Data Customizada (dateColumn)](#coluna-de-data-customizada-datecolumn)
- [Agrupamento Categórico (labelColumn)](#agrupamento-categórico-labelcolumn)
- [Métodos Terminais](#métodos-terminais)
  - [.metrics()](#metrics)
  - [.trends()](#trends)
  - [.metricsWithVariations()](#metricswithvariations)
- [Preencher Dados Ausentes (fillMissingData)](#preencher-dados-ausentes-fillmissingdata)
- [Múltiplas Séries (groupData)](#múltiplas-séries-groupdata)
- [Percentuais (inPercent)](#percentuais-inpercent)
- [Timezone / Fuso Horário](#timezone--fuso-horário)
- [Locale / Tradução dos Labels](#locale--tradução-dos-labels)
- [Cache](#cache)
- [Modo Executor (queryExecutor)](#modo-executor-queryexecutor)
- [Filtros Estruturados (WhereInput)](#filtros-estruturados-whereinput)
- [Validation / SkipValidation](#validation--skipvalidation)
- [Hierarquia de Erros](#hierarquia-de-erros)
- [Repository Helpers (metricsFor / withMetrics)](#repository-helpers-metricsfor--withmetrics)
- [Tabela de Erros](#tabela-de-erros)
- [Exemplo Completo](#exemplo-completo)

---

## Instalação

```bash
npm install nestjs-metrics
```

Dependências `peer` (já devem estar no projeto):

- `@nestjs/common` ^10 || ^11
- `typeorm` ^0.3
- `nestjs-metrics-core` (instalada automaticamente)

---

## Registro do Módulo

### `forRoot` — configuração global

Registra o `MetricsService` como provider **global** com defaults para locale e
timezone que serão aplicados a todas as queries.

```typescript
import { MetricsModule } from 'nestjs-metrics/nestjs';

@Module({
  imports: [
    MetricsModule.forRoot({
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    }),
  ],
})
export class AppModule {}
```

### `forFeature` — override por módulo

Permite sobrescrever as opções globais dentro de um módulo específico. As opções
do `forFeature` **fazem merge** sobre as do `forRoot`:

```typescript
@Module({
  imports: [MetricsModule.forFeature({ locale: 'en' })],
  providers: [ReportsService],
})
export class ReportsModule {}
```

### `MetricsModuleOptions`

```typescript
interface MetricsModuleOptions {
  locale?: string;   // BCP-47 tag, ex: 'pt-BR', 'en', 'fr'
  timezone?: string; // IANA timezone, ex: 'America/Sao_Paulo', 'UTC'
}
```

> ⚠️ O esquema é validado com Zod. Locales inválidos (ex: `''`) lançam
> `ValidationError`.

---

## O MetricsService

Injetável com escopo baseado em onde foi registrado:

```typescript
import { MetricsService } from 'nestjs-metrics/nestjs';

@Injectable()
export class OrdersService {
  constructor(private readonly metrics: MetricsService) {}
}
```

### Método `.query()`

Abre um `MetricsBuilder` sobre um `SelectQueryBuilder` do TypeORM:

```typescript
this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .countByMonth('id')
  .trends();
```

### Precedência de opções (locale/timezone)

**call-site** > **forFeature** > **forRoot** > **default (`'en'`, `'UTC'`)**

```typescript
// forRoot locale = 'pt-BR'
// forFeature locale = 'en'  (dentro do ReportsModule)
// call-site locale = 'fr'   → vence
this.metrics
  .query(ordersQuery, { locale: 'fr' })
  .countByMonth()
  .trends();
```

---

## Entry Points (formas de começar)

Todas produzem o **mesmo resultado** para a mesma query.

### 1. Via `MetricsService` (NestJS)

```typescript
this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .metrics();
```

### 2. Via `Metrics.query()` (estático, sem NestJS)

```typescript
import { Metrics } from 'nestjs-metrics';
// ou import { Metrics } from 'nestjs-metrics-core';

const result = await Metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .count()
  .metrics();
```

### 3. Via `metricsFor(repo)`

```typescript
import { metricsFor } from 'nestjs-metrics';

const result = await metricsFor(orderRepo)
  .sumByMonth('amount')
  .trends();
```

### 4. Via `withMetrics(repo)`

Estende o repositório com um método `.metrics()`:

```typescript
import { withMetrics } from 'nestjs-metrics';

const repo = withMetrics(orderRepo);
const result = await repo
  .metrics()
  .countByMonth()
  .trends();
```

### 5. Via `MetricsBuilder.queryExecutor()` (raw SQL, sem TypeORM)

```typescript
import { MetricsBuilder } from 'nestjs-metrics-core';

const ds: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then(r => r.rows),
};

const result = await MetricsBuilder
  .queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .trends();
```

---

## Agregadores (Aggregates)

| Método       | SQL      | Descrição                    | Default `column` |
|-------------|----------|------------------------------|------------------|
| `.count()`  | `COUNT`  | Número de linhas             | `'id'`           |
| `.sum()`    | `SUM`    | Soma da coluna numérica      | (obrigatório)    |
| `.average()`| `AVG`    | Média da coluna numérica     | (obrigatório)    |
| `.max()`    | `MAX`    | Maior valor da coluna        | (obrigatório)    |
| `.min()`    | `MIN`    | Menor valor da coluna        | (obrigatório)    |

```typescript
// Contagem simples (coluna default 'id')
await Metrics.query(qb).count().metrics();

// Soma de uma coluna específica
await Metrics.query(qb).sum('amount').metrics();

// Média
await Metrics.query(qb).average('amount').metrics();

// Máximo / Mínimo
await Metrics.query(qb).max('amount').metrics();
await Metrics.query(qb).min('amount').metrics();
```

> O parâmetro `column` é validado como identificador SQL seguro. Caracteres
> especiais ou SQL injection lançam `InvalidIdentifierException`.

---

## Períodos (Periods)

Definem como os dados serão agrupados no tempo. Usados com `.trends()` ou
com `.metrics()` (para escopo temporal sem agrupamento).

| Método                    | Bucket     | Labels (trends)       |
|--------------------------|------------|-----------------------|
| `.byDay(count?)`         | Dia        | Nome do dia da semana |
| `.byWeek(count?)`        | Semana ISO | `Week N`              |
| `.byMonth(count?)`       | Mês        | Nome do mês           |
| `.byYear(count?)`        | Ano        | Número do ano         |

```typescript
// Agrupar por mês
await Metrics.query(qb).count().byMonth().trends();
// → { labels: ['January', 'February', ...], data: [10, 15, ...] }
```

> Veja "Janelas" abaixo para o significado do parâmetro `count`.

---

## Janelas (Window Semantics)

O parâmetro `count` nos métodos de período controla a janela temporal:

| `count` | Comportamento                                                |
|---------|--------------------------------------------------------------|
| `0`     | Período **inteiro** (ex: o ano todo, sem filtro de janela)   |
| `1`     | **Apenas** a unidade atual (ex: este mês)                    |
| `>1`    | **Últimas N unidades** até a referência (ex: últimos 3 meses)|

```typescript
// Ano inteiro (default)
await Metrics.query(qb).count().byMonth().forYear(2026).metrics();
// → total do ano

// Apenas junho de 2026
await Metrics.query(qb).count().byMonth(1).forYear(2026).forMonth(6).metrics();

// Últimos 3 meses até junho de 2026
await Metrics.query(qb).count().byMonth(3).forYear(2026).forMonth(6).metrics();
// → window = meses 3..6 (março a junho)
```

### Exemplos de janela por ano

```typescript
// Apenas 2024
await m().count().byYear(1).forYear(2024).metrics();

// Últimos 3 anos [2021..2024]
await m().count().byYear(3).forYear(2024).metrics();
```

---

## Ranges de Data (between / from)

Substituem o período por um intervalo de datas explícito. Os labels em `.trends()`
são as próprias datas (ISO).

### `.between(start, end)`

```typescript
// Dias dentro de Janeiro de 2026
await Metrics.query(qb)
  .count()
  .between('2026-01-01', '2026-01-31')
  .trends();
// → { labels: ['2026-01-10', '2026-01-12'], data: [2, 1] }
```

### `.from(date)`

Abreviação para `between(date, today())`.

```typescript
await Metrics.query(qb).count().from('2026-06-01').metrics();
```

### Shorthands de range

```typescript
.countBetween(['2026-01-01', '2026-12-31'])
.sumBetween(['2026-01-01', '2026-12-31'], 'amount')
.averageBetween(['2026-01-01', '2026-12-31'], 'amount')
.maxBetween(['2026-01-01', '2026-12-31'], 'amount')
.minBetween(['2026-01-01', '2026-12-31'], 'amount')

.countFrom('2020-01-01')
.sumFrom('2020-01-01', 'amount')
.averageFrom('2020-01-01', 'amount')
.maxFrom('2020-01-01', 'amount')
.minFrom('2020-01-01', 'amount')
```

---

## Granularidade em Ranges (groupBy*)

Quando usa `.between()`/`.from()`, o bucket padrão é **dia**. Use `groupBy*`
para alterar:

```typescript
// Por mês
await m().count().between('2026-01-01', '2026-03-31').groupByMonth().trends();
// → { labels: ['2026-01', '2026-02', '2026-03'], data: [2, 1, 1] }

// Por ano
await m().count().between('2026-01-01', '2026-12-31').groupByYear().trends();

// Por semana ISO
await m().count().between('2026-03-01', '2026-03-15').groupByWeek().trends();
// → { labels: ['2026-W10', '2026-W11'], ... }

// Por dia (explícito, equivalente ao default)
await m().count().between('2026-01-01', '2026-01-31').groupByDay().trends();
```

---

## Referência Temporal (forDay / forWeek / forMonth / forYear)

Pinos que definem o ponto de referência para os períodos. O default é
"agora" (data/hora atual).

```typescript
// Dia específico
await Metrics.query(qb)
  .count().byDay(1)
  .forYear(2026).forMonth(6).forDay(2)
  .metrics();

// Semana ISO específica
await Metrics.query(qb)
  .count().byWeek(1)
  .forYear(2026).forMonth(3).forWeek(11)
  .metrics();

// Mês específico
await Metrics.query(qb)
  .count().byMonth(1)
  .forYear(2026).forMonth(6)
  .metrics();

// Ano específico
await Metrics.query(qb)
  .count().byMonth()
  .forYear(2026)
  .trends();
```

---

## Shorthands Combinados

Atalhos que juntam agregador + período numa chamada só:

| Shorthand                | Equivalente                        |
|--------------------------|------------------------------------|
| `.countByDay(col, n)`    | `.count(col).byDay(n)`             |
| `.countByWeek(col, n)`   | `.count(col).byWeek(n)`            |
| `.countByMonth(col, n)`  | `.count(col).byMonth(n)`           |
| `.countByYear(col, n)`   | `.count(col).byYear(n)`            |
| `.sumByDay(col, n)`      | `.sum(col).byDay(n)`               |
| `.sumByWeek(col, n)`     | `.sum(col).byWeek(n)`              |
| `.sumByMonth(col, n)`    | `.sum(col).byMonth(n)`             |
| `.sumByYear(col, n)`     | `.sum(col).byYear(n)`              |
| `.averageByDay(col, n)`  | `.average(col).byDay(n)`           |
| `.averageByWeek(col, n)` | `.average(col).byWeek(n)`          |
| `.averageByMonth(col, n)`| `.average(col).byMonth(n)`         |
| `.averageByYear(col, n)` | `.average(col).byYear(n)`          |
| `.maxByDay(col, n)`      | `.max(col).byDay(n)`               |
| `.maxByWeek(col, n)`     | `.max(col).byWeek(n)`              |
| `.maxByMonth(col, n)`    | `.max(col).byMonth(n)`             |
| `.maxByYear(col, n)`     | `.max(col).byYear(n)`              |
| `.minByDay(col, n)`      | `.min(col).byDay(n)`               |
| `.minByWeek(col, n)`     | `.min(col).byWeek(n)`              |
| `.minByMonth(col, n)`    | `.min(col).byMonth(n)`             |
| `.minByYear(col, n)`     | `.min(col).byYear(n)`              |

```typescript
await Metrics.query(qb).countByMonth('id', 6).forYear(2026).trends();
await Metrics.query(qb).sumByYear('amount', 5).trends();
```

---

## Coluna de Data Customizada (dateColumn)

Por default o builder usa `created_at` como coluna de data. Para usar outra:

```typescript
await Metrics.query(qb)
  .count()
  .dateColumn('updated_at')
  .byMonth()
  .forYear(2026)
  .trends();
// → Agrupa por updated_at em vez de created_at
```

---

## Agrupamento Categórico (labelColumn)

Agrupa a série por uma coluna categórica **em vez de** por período. O filtro
temporal ainda se aplica — use `forYear`/`between` etc. para escopo.

```typescript
// Total de pedidos agrupados por status (em 2026)
await Metrics.query(qb)
  .count()
  .labelColumn('status')
  .forYear(2026)
  .trends();
// → { labels: ['delivered', 'pending', 'cancelled'], data: [10, 5, 2] }
```

Combinado com período + `forYear`:

```typescript
await Metrics.query(qb)
  .sumByYear('amount', 1)
  .forYear(2026)
  .labelColumn('status')
  .trends();
// → { labels: ['paid', 'pending', 'refunded'], data: [750, 75, 75] }
```

> O filtro do período ainda se aplica. Para agrupar por status dentro de um ano,
> use `sumByYear('amount', 1).forYear(YYYY).labelColumn('status')`.

### Trocar a Tabela (table())

Para métricas sobre joins:

```typescript
await Metrics.query(ordersJoinCustomers(dataSource))
  .count()
  .table('customers')
  .labelColumn('name')
  .trends();
// → { labels: ['Acme', 'Globex'], data: [2, 1] }
```

---

## Métodos Terminais

### `.metrics()`

Retorna um único valor numérico agregado.

```typescript
const total = await Metrics.query(qb).sum('amount').metrics();
// → number (ou 0 se nenhuma linha corresponder)
```

### `.trends()`

Retorna séries temporais prontas para gráfico.

```typescript
const { labels, data } = await Metrics.query(qb).countByMonth().trends();
// → TrendsResult: { labels: (string | number)[], data: number[] }
```

**Com `groupData()`** retorna `GroupedTrendsResult`:

```typescript
const { labels, data } = await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered'])
  .trends();
// → GroupedTrendsResult: { labels: [...], data: { total: [...], pending: [...], delivered: [...] } }
```

### `.metricsWithVariations()`

Retorna o valor atual + a variação contra um período anterior.

```typescript
interface VariationResult {
  count: number;
  variation: {
    type: 'increase' | 'decrease' | 'none';
    value: number | string; // string quando inPercent=true
  };
}
```

```typescript
// Variação vs o ano anterior
const r = await Metrics.query(qb)
  .count().byYear(1).forYear(2026)
  .metricsWithVariations(1, Period.YEAR);
// → { count: 5, variation: { type: 'increase', value: 3 } }

// Como percentual
const r = await Metrics.query(qb)
  .count().byYear(1).forYear(2026)
  .metricsWithVariations(1, Period.YEAR, true);
// → { count: 6, variation: { type: 'increase', value: '50%' } }
```

> `previousCount` deve ser > 0. `previousPeriod` deve ser um dos:
> `Period.DAY | Period.WEEK | Period.MONTH | Period.YEAR`.

---

## Preencher Dados Ausentes (fillMissingData)

Por default, `.trends()` só retorna buckets que têm dados.
`fillMissingData()` preenche os vazios com um valor padrão.

```typescript
await Metrics.query(qb)
  .count().byMonth().forYear(2026)
  .fillMissingData()
  .trends();
// → { labels: ['January', 'February', 'March'], data: [1, 0, 1] }
```

### Comportamento por modo

| Modo                    | Estratégia                                          |
|-------------------------|-----------------------------------------------------|
| Período (byMonth etc.)  | Preenche entre o **menor e maior** bucket presente  |
| Range (between/from)    | Enumera **todo** o range                            |
| Categórico (labelColumn)| Auto-descobre labels **distintos** ou usa lista explícita|

### Valor customizado

```typescript
.fillMissingData(99)
// → data: [1, 99, 1]
```

### Labels explícitas (modo categórico)

```typescript
await Metrics.query(qb)
  .count()
  .labelColumn('status')
  .fillMissingData(0, ['pending', 'delivered', 'cancelled'])
  .trends();
// → { labels: ['pending', 'delivered', 'cancelled'], data: [2, 1, 0] }
```

---

## Múltiplas Séries (groupData)

Divide a coluna do agregador em uma série por valor — ideal para gráficos
empilhados. Cada série usa `CASE WHEN column = value THEN 1 ELSE 0 END`.

```typescript
await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered', 'cancelled'])
  .forYear(2026)
  .trends();
// → GroupedTrendsResult
// labels: ['January', 'March']
// data.total:  [3, 2]
// data.pending:   [2, 1]
// data.delivered: [1, 0]
// data.cancelled: [0, 1]
```

### Com fillMissingData

```typescript
await Metrics.query(qb)
  .countByMonth('status')
  .groupData(['pending', 'delivered'])
  .forYear(2026)
  .fillMissingData()
  .trends();
// → data.total: [2, 0, 1], data.pending: [1, 0, 1], data.delivered: [1, 0, 0]
// labels: ['January', 'February', 'March']
```

### Agregador customizado

```typescript
.groupData(['pending', 'delivered'], Aggregate.SUM)
```

---

## Percentuais (inPercent)

`trends(true)` converte cada valor para porcentagem do total da série.

```typescript
const r = await Metrics.query(qb)
  .count().byMonth().forYear(2026)
  .trends(true);
// → { labels: ['January', 'March'], data: [75, 25] }
```

Compatível com `fillMissingData`:

```typescript
await m().count().byMonth().forYear(2026).fillMissingData().trends(true);
// → { labels: ['January', 'February', 'March'], data: [75, 0, 25] }
```

---

## Timezone / Fuso Horário

Por default o timezone é `'UTC'`. Configure um IANA timezone para bucketing
no horário local.

```typescript
// Escopo global (forRoot)
MetricsModule.forRoot({ timezone: 'America/Sao_Paulo' });

// Por query (call-site)
Metrics.query(qb, { timezone: 'America/New_York' });
```

### Exemplo: linha próxima à meia-noite

```typescript
// created_at = '2026-07-15 03:30:00' (UTC)
// Em New York (-4 EDT) → 23:30 de 14 de julho

const q = () => Metrics.query(qb, { timezone: 'America/New_York' });

await q().count().between('2026-07-14', '2026-07-14').metrics();
// → 1 (no horário local é dia 14)

await q().count().between('2026-07-15', '2026-07-15').metrics();
// → 0
```

### Trends em timezone local

```typescript
const r = await Metrics.query(qb, { timezone: 'America/New_York' })
  .count()
  .between('2026-07-13', '2026-07-16')
  .groupByDay()
  .trends();
// → labels: ['2026-07-14'], data: [1]
```

> ⚠️ **SQLite** não suporta timezone no modo executor. Lança
> `SqliteTimezoneUnsupportedException`.

---

## Locale / Tradução dos Labels

Controla o idioma dos nomes de meses e dias da semana no resultado de
`.trends()`.

```typescript
Metrics.query(qb, { locale: 'pt-BR' })
  .count().byMonth()
  .trends();
// → labels: ['janeiro', 'fevereiro', ...]

Metrics.query(qb, { locale: 'fr' })
  .count().byMonth()
  .trends();
// → labels: ['janvier', 'février', ...]
```

Valor default: `'en'`.

---

## Cache

Sistema de cache plugável e opt-in. O cache é por **plano de query** (agregador +
coluna + filtros + timezone), então queries diferentes têm keys diferentes.

### Ativar cache

```typescript
import { MemoryCacheStore } from 'nestjs-metrics';

const cache = new MemoryCacheStore();
const opts = { cache: { enabled: true, ttl: 60 } }; // 60 segundos

const result = await Metrics.query(qb, opts, cache)
  .count()
  .metrics();
```

### CacheStore customizado

Implemente a interface `CacheStore`:

```typescript
import type { CacheStore } from 'nestjs-metrics-core';

class MyRedisStore implements CacheStore {
  get<T>(key: string): T | undefined { /* ... */ }
  set<T>(key: string, value: T, ttl: number): void { /* ... */ }
  del(key: string): void { /* ... */ }
  clear(): void { /* ... */ }
  stats(): CacheStats { /* ... */ }
}
```

### Métodos do CacheStore

| Método      | Descrição                                    |
|-------------|----------------------------------------------|
| `get(key)`  | Retorna valor ou `undefined` se não existir  |
| `set(key, value, ttl)` | Armazena com TTL em segundos    |
| `del(key)`  | Remove entrada                               |
| `clear()`   | Limpa tudo e reseta estatísticas             |
| `stats()`   | Retorna `{ hits, misses, size }`             |

---

## Modo Executor (queryExecutor)

Usado **sem TypeORM** — com Prisma, Drizzle, ou qualquer driver SQL. Requer um
`DataSource` com `dialect` + `execute`.

### DataSource

```typescript
interface DataSource {
  dialect: 'postgres' | 'mysql' | 'sqlite';
  execute: (sql: string, params: unknown[]) => Promise<Row[]>;
}
```

### Exemplo básico

```typescript
import { MetricsBuilder } from 'nestjs-metrics-core';

const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then(r => r.rows),
};

const result = await MetricsBuilder
  .queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

### ExecutorSpec

```typescript
interface ExecutorSpec {
  table: string;           // Nome da tabela (obrigatório)
  dateColumn?: string;     // Coluna de data (default lida do builder)
  where?: WhereInput;      // Filtros estruturados (opcional)
  from?: string;           // Fragmento FROM raw (para joins/subqueries)
}
```

---

## Filtros Estruturados (WhereInput)

Disponível no modo executor via `ExecutorSpec.where`. Filtros são **AND** e
valores são sempre passados como parâmetros nomeados (sem risco de injection).

```typescript
type WhereInput = Record<string, WhereCondition>;

type WhereCondition =
  | WhereScalar              // = valor
  | WhereScalar[]            // IN (...)
  | RangeCondition;          // { gte?, lte?, gt?, lt? }

type WhereScalar = string | number | boolean | null;

interface RangeCondition {
  gte?: WhereScalar;
  lte?: WhereScalar;
  gt?: WhereScalar;
  lt?: WhereScalar;
}
```

### Exemplos

```typescript
// Igualdade
{ status: 'paid' }

// IN
{ status: ['paid', 'pending'] }

// Range
{ amount: { gte: 100 } }
{ amount: { gt: 100, lte: 300 } }

// IS NULL
{ customer_id: null }

// Múltiplas condições (AND)
{ status: 'paid', amount: { gte: 200 } }
```

### Uso com queryExecutor

```typescript
const result = await MetricsBuilder
  .queryExecutor(dataSource, {
    table: 'orders',
    dateColumn: 'created_at',
    where: { status: 'paid', amount: { gte: 100 } },
  })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

Os filtros `where` são aplicados **junto com** os filtros de período/range.

---

## Validation / SkipValidation

### Validação automática

Todas as entradas (builder, executor spec, module options) são validadas com
**Zod** no construtor. Opções inválidas lançam `ValidationError`.

```typescript
Metrics.query(qb, { locale: '' }); // → ValidationError
Metrics.query(qb, { timezone: 123 as never }); // → ValidationError
```

### SkipValidation

Para desligar a validação em cenários de performance crítica:

```typescript
import { Metrics } from 'nestjs-metrics';

Metrics.skipValidation = true; // desliga validação Zod em todas as entradas
// ... queries sem validação ...
Metrics.skipValidation = false; // religa
```

---

## Hierarquia de Erros

Todas as exceções estendem `MetricsError` e carregam um `code` estável
(machine-readable) e `context` opcional.

```
Error
 └─ MetricsError (code + context)
     ├─ ValidationError          VALIDATION_ERROR
     ├─ InvalidAggregateException    INVALID_AGGREGATE
     ├─ InvalidDateFormatException   INVALID_DATE_FORMAT
     ├─ InvalidIdentifierException   INVALID_IDENTIFIER
     ├─ InvalidPeriodException       INVALID_PERIOD
     ├─ InvalidVariationsCountException INVALID_VARIATIONS_COUNT
     ├─ InvalidTimezoneException     INVALID_TIMEZONE
     ├─ SqliteTimezoneUnsupportedException SQLITE_TIMEZONE_UNSUPPORTED
     ├─ ConfigurationError       CONFIGURATION_ERROR
     └─ QueryExecutionError      QUERY_EXECUTION_ERROR
```

### Captura

```typescript
import { MetricsError, QueryExecutionError } from 'nestjs-metrics';

try {
  await builder.sum('amount').metrics();
} catch (err) {
  if (err instanceof MetricsError) {
    console.error(err.code, err.context);
  }
}
```

---

## Repository Helpers (metricsFor / withMetrics)

### `metricsFor(repo, options?)`

```typescript
import { metricsFor } from 'nestjs-metrics';

const repo = dataSource.getRepository(Order);
const result = await metricsFor(repo, { locale: 'pt-BR' })
  .sumByMonth('amount')
  .trends();
```

### `withMetrics(repo)`

Adiciona um método `.metrics()` ao repositório:

```typescript
import { withMetrics } from 'nestjs-metrics';

const repo = withMetrics(dataSource.getRepository(Order));
const result = await repo
  .metrics()
  .countByMonth()
  .trends();
```

---

## Tabela de Erros

| Exception                         | Código                       | Causa                                      |
|-----------------------------------|------------------------------|--------------------------------------------|
| `ValidationError`                 | `VALIDATION_ERROR`           | Opções inválidas (locale vazio, etc.)      |
| `InvalidAggregateException`       | `INVALID_AGGREGATE`          | Agregador não suportado                    |
| `InvalidDateFormatException`      | `INVALID_DATE_FORMAT`        | Data não está em YYYY-MM-DD                |
| `InvalidIdentifierException`      | `INVALID_IDENTIFIER`         | Nome de coluna/tabela inseguro             |
| `InvalidPeriodException`          | `INVALID_PERIOD`             | Período inválido em metricsWithVariations  |
| `InvalidVariationsCountException` | `INVALID_VARIATIONS_COUNT`   | previousCount <= 0                         |
| `InvalidTimezoneException`        | `INVALID_TIMEZONE`           | IANA zone inválido                         |
| `SqliteTimezoneUnsupportedException` | `SQLITE_TIMEZONE_UNSUPPORTED` | Timezone não-UTC no executor SQLITE      |
| `ConfigurationError`              | `CONFIGURATION_ERROR`        | Driver não suportado / dialeto não inf     |
| `QueryExecutionError`             | `QUERY_EXECUTION_ERROR`      | Erro do driver na execução SQL             |

---

## Exemplo Completo

```typescript
import { Module } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
import { Order } from './order.entity';
import { Period } from 'nestjs-metrics';

@Module({
  imports: [
    MetricsModule.forRoot({
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    }),
  ],
})
export class ReportsModule {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly metrics: MetricsService,
  ) {}

  // --- Métricas simples ---

  async totalRevenue(): Promise<number> {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sum('amount')
      .metrics();
  }

  async orderCountThisMonth(): Promise<number> {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .countByMonth(1) // apenas o mês atual
      .metrics();
  }

  // --- Trends ---

  async monthlyRevenueTrend() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sumByMonth('amount', 12) // últimos 12 meses
      .fillMissingData()
      .trends();
  }

  async ordersByStatus() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .count()
      .labelColumn('status')
      .trends();
  }

  // --- Variação ---

  async revenueVariation() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sumByYear('amount', 1)
      .forYear(2026)
      .metricsWithVariations(1, Period.YEAR, true);
    // → { count: 100000, variation: { type: 'increase', value: '15.5%' } }
  }

  // --- Range customizado ---

  async dailyRevenue(days: number) {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);

    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .sum('amount')
      .between(start, end)
      .groupByDay()
      .fillMissingData()
      .trends();
  }

  // --- Múltiplas séries ---

  async stackedStatusByMonth() {
    return this.metrics
      .query(this.orderRepo.createQueryBuilder('order'))
      .countByMonth('status', 6)
      .groupData(['pending', 'paid', 'cancelled'])
      .fillMissingData()
      .trends();
  }
}
```
