/**
 * Dimensional modelling on a tiny shop. One star (fact_sales + dim_customer + dim_product) and a
 * second fact (fact_returns) that shares dim_product.
 *   Ana moves North → South on 2026-04-01 (slowly changing dimension).
 *   Davi buys in March but isn't in the customer dimension yet (late-arriving dimension).
 *   The returns system has its own category labels ("Shoes"), so only dim_product is conformed.
 * Q1 revenue in the source is 450.
 */
export const DIM_SETUP = [
  `CREATE OR REPLACE TABLE dim_product (product_id VARCHAR, product VARCHAR, category VARCHAR)`,
  `INSERT INTO dim_product VALUES ('p1', 'Runner shoes', 'Footwear'), ('p2', 'Hiking boots', 'Footwear'), ('p3', 'T-shirt', 'Apparel')`,
  // what the returns system calls the same products
  `CREATE OR REPLACE TABLE returns_system_category (product_id VARCHAR, category VARCHAR)`,
  `INSERT INTO returns_system_category VALUES ('p1', 'Shoes'), ('p2', 'Shoes'), ('p3', 'Apparel')`,
  // type 2: one row per version, with validity dates; -1 is the "unknown" member
  `CREATE OR REPLACE TABLE dim_customer_t2 (customer_sk INTEGER, customer_id VARCHAR, name VARCHAR, region VARCHAR, valid_from DATE, valid_to DATE, is_current BOOLEAN)`,
  `INSERT INTO dim_customer_t2 VALUES
     (-1, NULL, 'Unknown', 'Unknown', DATE '1900-01-01', DATE '9999-12-31', true),
     (1, 'c1', 'Ana', 'North', DATE '2026-01-01', DATE '2026-04-01', false),
     (2, 'c2', 'Bruno', 'South', DATE '2026-01-01', DATE '9999-12-31', true),
     (3, 'c3', 'Carla', 'North', DATE '2026-01-01', DATE '9999-12-31', true),
     (4, 'c1', 'Ana', 'South', DATE '2026-04-01', DATE '9999-12-31', true)`,
  // type 1: overwritten in place, so only today's value exists
  `CREATE OR REPLACE TABLE dim_customer_t1 AS
     SELECT customer_id, name, region FROM dim_customer_t2 WHERE is_current AND customer_id IS NOT NULL`,
  `CREATE OR REPLACE TABLE fact_sales (sale_id INTEGER, sale_date DATE, customer_id VARCHAR, product_id VARCHAR, amount INTEGER)`,
  `INSERT INTO fact_sales VALUES
     (1, DATE '2026-01-10', 'c1', 'p1', 100),
     (2, DATE '2026-02-05', 'c1', 'p3', 40),
     (3, DATE '2026-02-20', 'c2', 'p2', 150),
     (4, DATE '2026-03-15', 'c3', 'p1', 100),
     (5, DATE '2026-03-28', 'c4', 'p3', 60),
     (6, DATE '2026-04-12', 'c1', 'p2', 150),
     (7, DATE '2026-05-03', 'c2', 'p3', 40),
     (8, DATE '2026-05-20', 'c3', 'p2', 150)`,
  `CREATE OR REPLACE TABLE fact_returns (return_id INTEGER, return_date DATE, product_id VARCHAR, amount INTEGER)`,
  `INSERT INTO fact_returns VALUES (1, DATE '2026-02-10', 'p1', 100), (2, DATE '2026-03-30', 'p3', 40), (3, DATE '2026-05-25', 'p2', 150)`,
] as const

export const Q1_SOURCE_TOTAL = 450

export type History = 't1' | 't2' | 't2cur' | 't2bug'
export type Late = 'inner' | 'left' | 'unknown'
export type Across = 'fanout' | 'local' | 'conformed'

/** Wraps a (region, revenue) query with a TOTAL row, so reconciliation with the source is visible. */
const withTotal = (inner: string) => `WITH r AS (
${inner}
)
SELECT region, revenue FROM (
  SELECT 0 AS o, coalesce(region, '(null)') AS region, revenue FROM r
  UNION ALL SELECT 1, 'TOTAL', sum(revenue) FROM r
)
ORDER BY o, region`

const q1 = `s.sale_date < DATE '2026-04-01'`

/** Q1 revenue by region, attributing each sale to a region in one of four ways. */
export const historySql = (h: History) => withTotal(historyCore(h))

/** The attribution query itself, without the TOTAL wrapper (for display). */
export function historyCore(h: History): string {
  const join = {
    t1: `LEFT JOIN dim_customer_t1 d ON d.customer_id = s.customer_id`,
    t2: `LEFT JOIN dim_customer_t2 d ON d.customer_id = s.customer_id
  AND s.sale_date >= d.valid_from AND s.sale_date < d.valid_to`,
    t2cur: `LEFT JOIN dim_customer_t2 d ON d.customer_id = s.customer_id AND d.is_current`,
    t2bug: `LEFT JOIN dim_customer_t2 d ON d.customer_id = s.customer_id`,
  }[h]
  return `SELECT coalesce(d.region, 'Unknown') AS region, sum(s.amount) AS revenue
FROM fact_sales s
${join}
WHERE ${q1}
GROUP BY 1`
}

/** Q1 revenue by region when one customer is missing from the dimension. */
export function lateSql(l: Late): string {
  const inner =
    l === 'unknown'
      ? // facts were loaded with customer_sk = -1 when the lookup failed, so every fact has a key
        `WITH keyed AS (
  SELECT s.*, coalesce(d.customer_sk, -1) AS customer_sk
  FROM fact_sales s
  LEFT JOIN dim_customer_t2 d ON d.customer_id = s.customer_id
    AND s.sale_date >= d.valid_from AND s.sale_date < d.valid_to
)
SELECT d.region, sum(k.amount) AS revenue
FROM keyed k JOIN dim_customer_t2 d USING (customer_sk)
WHERE k.sale_date < DATE '2026-04-01'
GROUP BY 1`
      : `SELECT d.region, sum(s.amount) AS revenue
FROM fact_sales s
${l === 'inner' ? 'JOIN' : 'LEFT JOIN'} dim_customer_t2 d ON d.customer_id = s.customer_id
  AND s.sale_date >= d.valid_from AND s.sale_date < d.valid_to
WHERE ${q1}
GROUP BY 1`
  return withTotal(inner)
}

/** Return rate by category, combining two fact tables three ways. */
export function acrossSql(a: Across): string {
  if (a === 'fanout')
    return `SELECT p.category, sum(s.amount) AS sales, sum(r.amount) AS returns,
  round(100.0 * sum(r.amount) / sum(s.amount), 1) AS return_pct
FROM fact_sales s
JOIN fact_returns r ON r.product_id = s.product_id
JOIN dim_product p ON p.product_id = s.product_id
GROUP BY 1 ORDER BY 1`
  const retCat = a === 'local' ? 'returns_system_category' : 'dim_product'
  return `WITH sales AS (
  SELECT p.category, sum(s.amount) AS sales
  FROM fact_sales s JOIN dim_product p USING (product_id) GROUP BY 1
), rets AS (
  SELECT c.category, sum(r.amount) AS returns
  FROM fact_returns r JOIN ${retCat} c USING (product_id) GROUP BY 1
)
SELECT coalesce(sales.category, rets.category) AS category, sales, returns,
  round(100.0 * returns / sales, 1) AS return_pct
FROM sales FULL OUTER JOIN rets ON rets.category = sales.category
ORDER BY 1`
}
