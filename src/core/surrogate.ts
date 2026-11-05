/**
 * Surrogate keys. A dimension gets a key column that facts store instead of the natural key.
 *   row_number(): 1, 2, 3… assigned at build time. Depends on what else is in the table.
 *   md5(natural key): computed from the row's own business key. Same input, same key, forever.
 * Facts loaded on day 1 keep their keys; the dimension is rebuilt on day 2 with a new customer.
 */
export const SURROGATE_SETUP = [
  `CREATE OR REPLACE TABLE customers_day1 (email VARCHAR, name VARCHAR)`,
  `INSERT INTO customers_day1 VALUES ('bruno@shop.io', 'Bruno'), ('carla@shop.io', 'Carla'), ('davi@shop.io', 'Davi')`,
  // day 2: Ana signs up, and her email sorts first
  `CREATE OR REPLACE TABLE customers_day2 AS
     SELECT * FROM customers_day1 UNION ALL SELECT 'ana@shop.io', 'Ana'`,
  `CREATE OR REPLACE TABLE orders (order_id INTEGER, email VARCHAR, amount INTEGER)`,
  `INSERT INTO orders VALUES (1, 'bruno@shop.io', 120), (2, 'carla@shop.io', 80), (3, 'davi@shop.io', 300), (4, 'davi@shop.io', 40)`,
  // dimensions as each day's build produced them
  ...(['day1', 'day2'] as const).flatMap((d) => [
    `CREATE OR REPLACE TABLE dim_rownum_${d} AS
       SELECT row_number() OVER (ORDER BY email) AS customer_sk, email, name FROM customers_${d}`,
    `CREATE OR REPLACE TABLE dim_hash_${d} AS
       SELECT md5(email) AS customer_sk, email, name FROM customers_${d}`,
  ]),
  // the fact table was loaded on day 1 (incremental facts are not rebuilt)
  `CREATE OR REPLACE TABLE fact_orders_rownum AS
     SELECT o.order_id, d.customer_sk, o.amount FROM orders o JOIN dim_rownum_day1 d USING (email)`,
  `CREATE OR REPLACE TABLE fact_orders_hash AS
     SELECT o.order_id, d.customer_sk, o.amount FROM orders o JOIN dim_hash_day1 d USING (email)`,
  // composite natural keys for the hashing traps
  `CREATE OR REPLACE TABLE products (brand VARCHAR, model VARCHAR, color VARCHAR)`,
  `INSERT INTO products VALUES ('ab', 'c', 'red'), ('a', 'bc', 'red'), ('acme', 'x1', NULL), ('acme', NULL, 'x1')`,
] as const

export type Strategy = 'rownum' | 'hash'
export type Day = 'day1' | 'day2'

/** Facts (keys from day 1) joined to the dimension as built on `day`: who does each order belong to? */
export const attributionSql = (s: Strategy, day: Day) => `SELECT f.order_id, f.customer_sk, o.email AS true_customer, d.email AS dashboard_says
FROM fact_orders_${s} f
JOIN orders o USING (order_id)
LEFT JOIN dim_${s}_${day} d USING (customer_sk)
ORDER BY f.order_id`

export const dimSql = (s: Strategy, day: Day) => `SELECT * FROM dim_${s}_${day} ORDER BY email`

export const KEY_QUERIES = {
  concat: `-- ✗ plain concatenation: 'ab'+'c' and 'a'+'bc' are both 'abc'
SELECT brand, model, md5(brand || model) AS product_sk
FROM products WHERE color = 'red'`,
  separator: `-- ✓ a separator keeps the parts apart
SELECT brand, model, md5(concat_ws('|', brand, model)) AS product_sk
FROM products WHERE color = 'red'`,
  nullConcat: `-- ✗ || with a NULL makes the whole key NULL
SELECT brand, model, color, md5(brand || '|' || model || '|' || color) AS product_sk
FROM products WHERE brand = 'acme'`,
  nullConcatWs: `-- ✗ concat_ws skips NULLs, so different rows collide
SELECT brand, model, color, md5(concat_ws('|', brand, model, color)) AS product_sk
FROM products WHERE brand = 'acme'`,
  dbtStyle: `-- ✓ what dbt_utils.generate_surrogate_key does: cast, replace NULL with a marker, then join
SELECT brand, model, color,
       md5(concat_ws('-',
         coalesce(cast(brand AS VARCHAR), '_null_'),
         coalesce(cast(model AS VARCHAR), '_null_'),
         coalesce(cast(color AS VARCHAR), '_null_'))) AS product_sk
FROM products`,
  types: `-- ✗ the same customer from two systems: id 7 (integer) vs '007' (text)
SELECT md5(cast(7 AS VARCHAR)) AS from_crm, md5('007') AS from_billing,
       md5(cast(7 AS VARCHAR)) = md5('007') AS same_key`,
} as const
