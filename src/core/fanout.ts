/**
 * Grain and join fan-out. Four tables at different grains:
 *   customers   one row per customer
 *   orders      one row per order          (amount = order total)
 *   order_items one row per order line
 *   payments    one row per payment        (an order can be paid in parts)
 * Joining a one-row-per-order measure to a many-rows-per-order table repeats it.
 */
export const FANOUT_SETUP = [
  `CREATE OR REPLACE TABLE customers (customer_id INTEGER, name VARCHAR, country VARCHAR)`,
  `INSERT INTO customers VALUES (1, 'Ana', 'BR'), (2, 'Bruno', 'PT'), (3, 'Carla', 'BR'), (4, 'Davi', 'US')`,
  `CREATE OR REPLACE TABLE orders (order_id INTEGER, customer_id INTEGER, order_date DATE, amount DOUBLE)`,
  `INSERT INTO orders VALUES
     (101, 1, DATE '2026-01-03', 120), (102, 1, DATE '2026-01-10', 50),
     (103, 2, DATE '2026-01-11', 50), (104, 3, DATE '2026-01-15', 200)`,
  `CREATE OR REPLACE TABLE order_items (order_id INTEGER, sku VARCHAR, qty INTEGER, price DOUBLE)`,
  `INSERT INTO order_items VALUES
     (101, 'mug', 1, 70), (101, 'tee', 1, 50),
     (102, 'cap', 1, 50),
     (103, 'pen', 2, 25),
     (104, 'mug', 1, 70), (104, 'tee', 1, 50), (104, 'sock', 4, 20)`,
  `CREATE OR REPLACE TABLE payments (order_id INTEGER, method VARCHAR, paid DOUBLE)`,
  `INSERT INTO payments VALUES
     (101, 'card', 120), (102, 'pix', 50),
     (103, 'card', 25), (103, 'card', 25),
     (104, 'card', 100), (104, 'voucher', 100)`,
] as const

/** True revenue: one row per order, so a plain SUM is right. */
export const TRUE_REVENUE = 420

export const FANOUT_QUERIES = {
  grain: `-- orders: one row per order, so SUM(amount) is the revenue
SELECT count(*) AS orders, sum(amount) AS revenue
FROM orders`,

  joinRows: `-- each order is repeated once per item
SELECT o.order_id, o.amount, i.sku
FROM orders o
JOIN order_items i USING (order_id)
ORDER BY o.order_id`,

  sumAfterJoin: `-- ✗ the order amount is summed once per item
SELECT sum(o.amount) AS revenue, count(DISTINCT o.order_id) AS orders
FROM orders o
JOIN order_items i USING (order_id)`,

  twoJoins: `-- ✗ items × payments: an order with 3 items and 2 payments appears 6 times
SELECT o.order_id,
       count(*)            AS rows_after_join,
       sum(o.amount)       AS summed_amount,
       sum(i.qty * i.price) AS summed_items,
       sum(p.paid)         AS summed_payments
FROM orders o
JOIN order_items i USING (order_id)
JOIN payments p USING (order_id)
GROUP BY o.order_id
ORDER BY o.order_id`,

  sumDistinct: `-- ✗ "fix" with SUM(DISTINCT): orders 102 and 103 are both 50, so one is dropped
SELECT sum(DISTINCT o.amount) AS revenue
FROM orders o
JOIN order_items i USING (order_id)`,

  preAggregate: `-- ✓ bring each table to order grain first, then join one-to-one
WITH items AS (
  SELECT order_id, count(*) AS lines, sum(qty * price) AS items_total
  FROM order_items GROUP BY order_id
), pays AS (
  SELECT order_id, count(*) AS payments, sum(paid) AS paid_total
  FROM payments GROUP BY order_id
)
SELECT o.order_id, o.amount, items.lines, items.items_total, pays.payments, pays.paid_total
FROM orders o
JOIN items USING (order_id)
JOIN pays USING (order_id)
ORDER BY o.order_id`,

  preAggregateTotal: `-- ✓ same joins, revenue is right again
WITH items AS (SELECT order_id, count(*) AS lines FROM order_items GROUP BY order_id),
     pays  AS (SELECT order_id, count(*) AS payments FROM payments GROUP BY order_id)
SELECT sum(o.amount) AS revenue
FROM orders o JOIN items USING (order_id) JOIN pays USING (order_id)`,

  grainTest: `-- a grain test (what dbt's unique test does): any rows here = the grain is broken
SELECT o.order_id, count(*) AS copies
FROM orders o
JOIN order_items i USING (order_id)
GROUP BY o.order_id
HAVING count(*) > 1`,

  leftJoinFilter: `-- ✗ LEFT JOIN, then a WHERE on the right table: Davi (no orders) disappears
SELECT c.name, count(o.order_id) AS orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_date >= DATE '2026-01-05'
GROUP BY c.name
ORDER BY c.name`,

  leftJoinOn: `-- ✓ put the condition in ON: every customer stays, with 0 where nothing matches
SELECT c.name, count(o.order_id) AS orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.order_date >= DATE '2026-01-05'
GROUP BY c.name
ORDER BY c.name`,
} as const
