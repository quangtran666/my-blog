---
title: INNER JOIN gây row explosion? Dùng `WHERE EXISTS`
description: Chỉ cần kiểm tra tồn tại thì tránh `INNER JOIN`. Dùng `WHERE EXISTS`/`NOT EXISTS`.
date: 2025-10-03
---

# 🛠️ Tối ưu query: INNER JOIN gây "row explosion" → chuyển sang dùng `WHERE EXISTS + NOT EXISTS`{lang=sql}

> **Bài học cốt lõi:** Khi bạn **chỉ cần kiểm tra tồn tại**
> (có bản ghi tương ứng ở bảng kia hay không),
> **không nên dùng `INNER JOIN`{lang=sql}** vì nó dễ làm **nở số dòng trung gian**
> → phải `DISTINCT`{lang=sql} → tạo **temporary table**
> → chậm. Hãy **đổi sang `WHERE EXISTS`{lang=sql}** (semi-join) và **`NOT EXISTS`{lang=sql}** (anti-join).

---

## 1) Bối cảnh & mục tiêu

- Bảng: `received_orders (ro)`, `wishlists (wl)`.
- **Mục tiêu:** Lấy **`main_id`** thỏa:
  1. Có bản ghi ở `received_orders` **trước** ngày `2025-10-01`.
  2. **Có gắn** với `wishlists`.
  3. **Không có** bản ghi ở `received_orders` **từ** `2025-10-01` trở đi.
- **Logic mong muốn đạt được:** `Kết quả = (A ∩ B) \ C`, trong đó
  - `A` = `main_id` có `working_day2 < '2025-10-01'` (ở `received_orders`)
  - `B` = `main_id` xuất hiện trong `wishlists`
  - `C` = `main_id` có `working_day2 >= '2025-10-01'` (ở `received_orders`)

---

## 2) Query gốc (INNER JOIN + NOT IN) — gây chậm

```sql [file.sql] {3-10}
SELECT DISTINCT ro.main_id
FROM happys_dev_prod_clone_db.received_orders ro
INNER JOIN happys_dev_prod_clone_db.wishlists wl
  ON wl.received_order_main_id = ro.main_id
WHERE ro.working_day2 < '2025-10-01'
  AND ro.main_id NOT IN (
    SELECT DISTINCT ro1.main_id
    FROM happys_dev_prod_clone_db.received_orders ro1
    WHERE ro1.working_day2 >= '2025-10-01'
  )
ORDER BY ro.main_id ASC
LIMIT 500;
```

### Tác hại của `INNER JOIN`{lang=sql} trong case này

1. **gây row explosion**: 1 `main_id` ở `received_orders` có thể khớp n dòng `wishlists` → tạo n dòng trung gian.

2. Phải dùng `DISTINCT` để khử trùng → MySQL tạo temporary table with deduplication → tốn CPU/IO.

3. `NOT IN` (subquery lớn) thường vật hóa cả tập và dính cả NULL.

4. Dấu hiệu trong `EXPLAIN ANALYZE` bạn từng thấy:
   - Nested loop inner join sinh ~63.6 triệu dòng trung gian.
   - Temporary table with deduplication xuất hiện trước bước ORDER BY/LIMIT.
   - Thời gian tổng thể ~39s.

---

## 3) Viết lại query `WHERE EXISTS + NOT EXISTS`{lang=sql}

```sql [file.sql] {3-14}
SELECT DISTINCT ro.main_id
FROM happys_dev_prod_clone_db.received_orders ro
WHERE ro.working_day2 < '2025-10-01'
  AND EXISTS (  -- B: có gắn wishlist
    SELECT 1
    FROM happys_dev_prod_clone_db.wishlists wl
    WHERE wl.received_order_main_id = ro.main_id
  )
  AND NOT EXISTS (  -- C: không có record sau ngày 2025-10-01
    SELECT 1
    FROM happys_dev_prod_clone_db.received_orders ro1
    WHERE ro1.main_id = ro.main_id
      AND ro1.working_day2 >= '2025-10-01'
  )
ORDER BY ro.main_id ASC
LIMIT 500;
```

### Vì sao cách này không có "row explosion"?

1. `EXISTS`{lang=sql} là semi-join: chỉ kiểm tra tồn tại → không nhân bản dòng như JOIN.
2. `NOT EXISTS`{lang=sql} là anti-join: dừng sớm khi thấy dòng thỏa điều kiện; không phải gom toàn bộ set như `NOT IN`.
3. `DISTINCT`{lang=sql} chỉ còn để khử trùng nếu chính `received_orders` có nhiều bản ghi/`main_id`.
4. Kết quả trong `EXPLAIN ANALYZE` tốt hơn:
   - Không còn "row explosion" do join.
   - Ít/không còn "Temporary table with deduplication".
   - Thời gian giảm khi dữ liệu/điều kiện phù hợp.

---

## 4) Cách thức thực hiện

::steps{level="4"}

#### **Viết lại mục tiêu thành set:**

`(A ∩ B) \ C`

#### **Giữ A trong WHERE của bảng gốc** (`received_orders`) để lọc sớm:

```sql
FROM received_orders ro
WHERE ro.working_day2 < '2025-10-01'
```

#### **Thay JOIN (để kiểm tra tồn tại) bằng EXISTS** để lấy B:

```sql
AND EXISTS (
  SELECT 1
  FROM wishlists wl
  WHERE wl.received_order_main_id = ro.main_id
```

#### **Thay NOT IN bằng NOT EXISTS tương quan** để trừ C:

```sql
AND NOT EXISTS (
  SELECT 1
  FROM received_orders ro1
  WHERE ro1.main_id = ro.main_id
    AND ro1.working_day2 >= '2025-10-01'
)
```

#### **Khử trùng ở outer** (nếu cần): `SELECT DISTINCT ro.main_id`.

```sql
SELECT DISTINCT ro.main_id
```

::

---

## 5) Ghi nhớ nhanh (TL;DR)

::tip
`JOIN` chỉ để biết tồn tại không → đổi sang `EXISTS`{lang=sql}.
::

::tip
Loại trừ theo khóa → `NOT EXISTS`, tránh `NOT IN`.
::

::tip
Khử trùng ở ngoài bằng `DISTINCT` trên key bạn trả về (ở đây là `ro.main_id`).
::

::tip
Luôn dùng **set thinking:** `(A ∩ B) \ C`.
::
