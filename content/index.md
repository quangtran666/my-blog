# 🛠️ Tối ưu query: INNER JOIN gây "row explosion" → chuyển sang `WHERE EXISTS` + `NOT EXISTS`

> **Bài học cốt lõi:** Khi bạn **chỉ cần kiểm tra tồn tại** (có bản ghi tương ứng ở bảng kia hay không), **không nên dùng `INNER JOIN`** vì nó dễ làm **nở số dòng trung gian** → phải `DISTINCT` → tạo **temporary table** → chậm. Hãy **đổi sang `WHERE EXISTS`** (semi-join) và **`NOT EXISTS`** (anti-join).

---

## 1) Bối cảnh & mục tiêu

- Bảng: `received_orders (ro)`, `wishlists (wl)`.
- **Mục tiêu:** Lấy **`main_id`** thỏa:
  1. Có bản ghi ở `received_orders` **trước** ngày `2025-10-01`.
  2. **Có gắn** với `wishlists`.
  3. **Không có** bản ghi ở `received_orders` **từ** `2025-10-01` trở đi.
- **Logic tập hợp:** `Kết quả = (A ∩ B) \ C`, trong đó
  - `A` = `main_id` có `working_day2 < '2025-10-01'` (ở `received_orders`)
  - `B` = `main_id` xuất hiện trong `wishlists`
  - `C` = `main_id` có `working_day2 >= '2025-10-01'` (ở `received_orders`)

---

## 2) Query gốc (INNER JOIN + NOT IN) — gây chậm

```sql
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

### Tác hại của INNER JOIN trong case này

1. **Nhân bản dòng (row explosion)**: 1 `main_id` ở `received_orders` có thể khớp n dòng `wishlists` → tạo n dòng trung gian.

2. Phải dùng `DISTINCT` để khử trùng → MySQL tạo temporary table with deduplication → tốn CPU/IO.

3. `NOT IN` (subquery lớn) thường vật hóa cả tập và dính bẫy NULL.

4. Dấu hiệu trong `EXPLAIN ANALYZE` bạn từng thấy:
   - Nested loop inner join sinh ~63.6 triệu dòng trung gian.
   - Temporary table with deduplication xuất hiện trước bước ORDER BY/LIMIT.
   - Thời gian tổng thể ~39s.

---

## 3) Query rewrite (WHERE EXISTS + NOT EXISTS) — cùng logic "có gắn"

```sql
SELECT DISTINCT ro.main_id
FROM happys_dev_prod_clone_db.received_orders ro
WHERE ro.working_day2 < '2025-10-01'
  AND EXISTS (  -- B: có gắn wishlist
    SELECT 1
    FROM happys_dev_prod_clone_db.wishlists wl
    WHERE wl.received_order_main_id = ro.main_id
  )
  AND NOT EXISTS (  -- \ C: không có record sau/đúng 2025-10-01
    SELECT 1
    FROM happys_dev_prod_clone_db.received_orders ro1
    WHERE ro1.main_id = ro.main_id
      AND ro1.working_day2 >= '2025-10-01'
  )
ORDER BY ro.main_id ASC
LIMIT 500;
```

### Vì sao cách này "đỡ nổ dòng"?

1. `EXISTS` là semi-join: chỉ kiểm tra tồn tại → không nhân bản dòng như JOIN.

2. `NOT EXISTS` là anti-join: dừng sớm khi thấy dòng cấm; không phải gom toàn bộ set như `NOT IN`.

3. `DISTINCT` chỉ còn để khử trùng nếu chính `received_orders` có nhiều bản ghi/`main_id`.

4. Kỳ vọng trong `EXPLAIN ANALYZE` tốt:
   - Không còn "row explosion" do join.
   - Ít/không còn "Temporary table with deduplication".
   - Thời gian giảm khi dữ liệu/điều kiện phù hợp.

---

## 4) Chuyển đổi từng bước (recipe "cơ học")

1. **Viết lại mục tiêu thành set:** `(A ∩ B) \ C`.

2. **Giữ A trong WHERE của bảng gốc** (`received_orders`) để lọc sớm:

   ```sql
   FROM received_orders ro
   WHERE ro.working_day2 < '2025-10-01'
   ```

3. **Thay JOIN (để kiểm tra tồn tại) bằng EXISTS** để lấy B:

   ```sql
   AND EXISTS (
     SELECT 1
     FROM wishlists wl
     WHERE wl.received_order_main_id = ro.main_id
   )
   ```

4. **Thay NOT IN bằng NOT EXISTS tương quan** để trừ C:

   ```sql
   AND NOT EXISTS (
     SELECT 1
     FROM received_orders ro1
     WHERE ro1.main_id = ro.main_id
       AND ro1.working_day2 >= '2025-10-01'
   )
   ```

5. **Khử trùng ở outer** (nếu cần): `SELECT DISTINCT ro.main_id`.

---

## 5) Checklist kiểm chứng kết quả

### ✅ So tính đúng đắn

Dùng cùng cách đếm cho cả hai query, ví dụ:

```sql
-- Với JOIN version
SELECT COUNT(DISTINCT ro.main_id)
FROM ... JOIN ...
WHERE ...;

-- Với EXISTS version
SELECT COUNT(DISTINCT ro.main_id)
FROM received_orders ro
WHERE ... AND EXISTS (...) AND NOT EXISTS (...);
```

Hai kết quả phải bằng nhau nếu cùng logic "có gắn".

### ⚡ So hiệu năng

Dùng `EXPLAIN ANALYZE`:

- Số rows trung gian có giảm mạnh?
- Còn xuất hiện "Temporary table with deduplication" không?
- Tổng actual time có giảm?

---

## 6) Lưu ý & mẹo thêm (không đổi schema/index, không CTE)

Nếu MySQL "flatten" subquery trong FROM khiến lọc không diễn ra sớm, bạn có thể:

### Dùng hint (MySQL ≥ 8.0.20):

```sql
SELECT /*+ NO_MERGE(ro) */ ...
FROM (SELECT DISTINCT main_id
      FROM received_orders
      WHERE working_day2 < '2025-10-01') ro
...
```

### Hoặc LIMIT vô hạn để chặn merge:

```sql
FROM (
  SELECT DISTINCT main_id
  FROM received_orders
  WHERE working_day2 < '2025-10-01'
  LIMIT 18446744073709551615
) ro
```

### Hoặc STRAIGHT_JOIN (khi buộc JOIN) để ép thứ tự join theo thứ tự viết.

**⚠️ Lưu ý:** `NOT IN` dễ dính bẫy NULL (làm kết quả "trống" bất ngờ). `NOT EXISTS` an toàn hơn.

---

## 7) Ghi nhớ nhanh (TL;DR)

- ✅ `JOIN` chỉ để biết "có/không" → đổi sang `EXISTS`.
- ✅ Loại trừ theo khóa → `NOT EXISTS` (tương quan), tránh `NOT IN`.
- ✅ Khử trùng ở ngoài bằng `DISTINCT` trên key bạn trả về (ở đây là `ro.main_id`).
- ✅ Luôn dùng **set thinking:** `(A ∩ B) \ C`.

---

## 8) (Tùy chọn) So sánh kết quả 2 query cho công bằng

⚠️ **Đừng dùng** `SELECT DISTINCT count(*)` (dễ hiểu sai).  
✅ **Hãy so bằng** `COUNT(DISTINCT ro.main_id)` ở cả hai phiên bản:

```sql
-- JOIN version: đếm main_id duy nhất
SELECT COUNT(DISTINCT ro.main_id)
FROM happys_dev_prod_clone_db.received_orders ro
JOIN happys_dev_prod_clone_db.wishlists wl
  ON wl.received_order_main_id = ro.main_id
WHERE ro.working_day2 < '2025-10-01'
  AND ro.main_id NOT IN (
    SELECT ro1.main_id
    FROM happys_dev_prod_clone_db.received_orders ro1
    WHERE ro1.working_day2 >= '2025-10-01'
  );

-- EXISTS version: đếm main_id duy nhất
SELECT COUNT(DISTINCT ro.main_id)
FROM happys_dev_prod_clone_db.received_orders ro
WHERE ro.working_day2 < '2025-10-01'
  AND EXISTS (
    SELECT 1
    FROM happys_dev_prod_clone_db.wishlists wl
    WHERE wl.received_order_main_id = ro.main_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM happys_dev_prod_clone_db.received_orders ro1
    WHERE ro1.main_id = ro.main_id
      AND ro1.working_day2 >= '2025-10-01'
  );
```
