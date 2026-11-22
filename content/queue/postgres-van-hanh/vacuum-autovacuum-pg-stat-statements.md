---
title: VACUUM, autovacuum và truy vấn chậm trong PostgreSQL với pg_stat_statements
tags: PostgreSQL, VACUUM, autovacuum, pg_stat_statements, truy vấn chậm
type: lab
---

> [!TLDR]
> - PostgreSQL không ghi đè dòng khi `UPDATE`/`DELETE` mà để lại bản cũ ("dòng chết"); `VACUUM` dọn các dòng chết đó để chỗ trống được dùng lại.
> - **Autovacuum** chạy nền tự động; thường chỉ cần theo dõi và chỉnh cho các bảng ghi/xoá nhiều, chứ không nên tắt.
> - Để tìm truy vấn chậm, bật `log_min_duration_statement` và tiện ích `pg_stat_statements`, rồi sắp theo tổng thời gian thực thi.

## Mở đầu

Sau khi biết cách sao lưu và khôi phục bằng `pg_dump` và `pg_basebackup`, việc vận hành hằng ngày xoay quanh hai câu hỏi: cơ sở dữ liệu có "gọn" không, và truy vấn nào đang làm nó chậm. Bài này giải thích VACUUM và autovacuum bằng ví dụ có thể tự chạy, rồi dùng `pg_stat_statements` để tìm truy vấn tốn thời gian. Lệnh đã thử với PostgreSQL 16.15 trên Ubuntu 24.04.

## Vì sao cần VACUUM

PostgreSQL dùng cơ chế nhiều phiên bản dòng (MVCC): khi bạn `UPDATE` hay `DELETE`, dòng cũ không bị xoá ngay vì có thể còn giao dịch khác đang cần đọc nó. Dòng cũ thành "dòng chết" (dead tuple). `VACUUM` quét bảng, đánh dấu không gian của các dòng chết là dùng lại được (nhưng thường không trả về cho hệ điều hành), cập nhật bản đồ thông tin cho truy vấn và giữ cho bộ đếm giao dịch không bị "quay vòng".

Nếu không dọn: bảng và chỉ mục phình to ("bloat"), truy vấn chậm dần, và trong trường hợp cực đoan còn gây rủi ro vì cạn bộ đếm ID giao dịch, một tình huống PostgreSQL phải tự bảo vệ bằng cách ép dọn.

### Quan sát dòng chết

Tạo bảng thử, xoá một nửa số dòng rồi xem thống kê:

```sql
CREATE TABLE t (id int PRIMARY KEY, v text);
INSERT INTO t SELECT g, md5(g::text) FROM generate_series(1, 1000) g;
DELETE FROM t WHERE id <= 500;

SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables;
```

Ngay sau lệnh xoá, bạn sẽ thấy khoảng 500 dòng sống và 500 dòng chết (thống kê cập nhật chậm một chút, nên số chính xác có thể hơi lệch). Dọn tay có báo cáo chi tiết:

```sql
VACUUM (VERBOSE, ANALYZE) t;
```

Kết quả nêu số dòng đã loại bỏ và cho biết bảng đã được phân tích lại (`ANALYZE` cập nhật thống kê giúp bộ lập kế hoạch chọn đường chạy tốt). Lệnh `VACUUM` thường không khoá chặn đọc/ghi bảng.

Có một lệnh dễ nhầm là `VACUUM FULL`: nó viết lại cả bảng để thật sự trả không gian cho hệ điều hành, nhưng **khoá độc quyền** bảng trong lúc chạy và cần thêm chỗ trống đĩa bằng cỡ bảng. Chỉ dùng khi hiểu rõ và có khung giờ bảo trì.

Để dọn cả cụm từ dòng lệnh, có `vacuumdb --all --analyze` (thêm `-j N` để chạy N kết nối song song).

## Autovacuum: người dọn nền

Mặc định `autovacuum` bật. Nó kích hoạt dọn một bảng khi số dòng chết vượt ngưỡng:

```text
autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × số dòng của bảng
```

Mặc định là `50` và `0.2` (20%), kiểm tra bằng:

```sql
SHOW autovacuum;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_vacuum_threshold;
SHOW autovacuum_naptime;   -- mặc định 1min: bao lâu nó đi xem một lần
```

Với bảng rất lớn, 20% là rất nhiều dòng chết trước khi dọn. Bạn có thể chỉnh riêng cho một bảng thay vì đổi toàn cụm:

```sql
ALTER TABLE t SET (autovacuum_vacuum_scale_factor = 0.05);
```

Nên làm gì khi vận hành:

- Đừng tắt autovacuum. Nếu nó "làm chậm máy", hãy điều chỉnh tần suất và tốc độ, không tắt.
- Theo dõi `n_dead_tup` và `last_autovacuum` trong `pg_stat_user_tables`; bảng nào dòng chết cứ tăng mà `last_autovacuum` không đổi thì cần xem lại.
- Một giao dịch mở rất lâu (ví dụ phiên quên `COMMIT`) giữ chân dòng chết, khiến VACUUM không dọn được. Xem các phiên qua `pg_stat_activity`.
- Bật `log_autovacuum_min_duration` nếu muốn log các lần dọn mất lâu.

## Tìm truy vấn chậm

### Cách 1: ghi log truy vấn vượt ngưỡng

Tham số `log_min_duration_statement` ghi vào log mọi câu lệnh chạy lâu hơn ngưỡng. Mặc định là `-1` (tắt). Ví dụ ghi các câu lâu hơn 500 mili giây, không cần khởi động lại:

```sql
ALTER SYSTEM SET log_min_duration_statement = '500ms';
SELECT pg_reload_conf();
```

Log của PostgreSQL trên Ubuntu nằm ở `/var/log/postgresql/postgresql-16-main.log`. Chọn ngưỡng đủ cao để log không ngập; có thể bắt đầu với vài trăm mili giây hoặc một giây tuỳ hệ thống.

### Cách 2: tổng hợp bằng pg_stat_statements

Log cho biết từng lần chậm; `pg_stat_statements` cho biết **truy vấn nào tốn nhiều nhất cộng dồn**, gộp các câu chỉ khác giá trị tham số. Tiện ích này là mô-đun đi kèm PostgreSQL (trên Ubuntu 24.04 đã có sẵn sau khi cài gói `postgresql`; kiểm tra bằng `SELECT name FROM pg_available_extensions WHERE name = 'pg_stat_statements';`), nhưng phải nạp lúc khởi động:

```sql
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
```

> **Lưu ý:** lệnh trên **thay thế** toàn bộ giá trị cũ của `shared_preload_libraries`. Nếu đã có thư viện khác, hãy ghi đủ danh sách, cách nhau bằng dấu phẩy. Thay đổi này cần khởi động lại cụm, nên làm trong khung giờ bảo trì.

```bash
sudo systemctl restart postgresql@16-main
```

Rồi tạo tiện ích trong cơ sở dữ liệu cần theo dõi:

```sql
CREATE EXTENSION pg_stat_statements;
```

Truy vấn các câu tốn tổng thời gian nhất (ở PostgreSQL 13 trở lên, các cột là `total_exec_time` và `mean_exec_time`, tính bằng mili giây):

```sql
SELECT calls,
       round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2)   AS mean_ms,
       rows,
       left(query, 80)                     AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

Câu `select ... where v like $1` hiện với `$1` thay giá trị thật: đó là cách tiện ích gộp các câu cùng dạng. Đọc kết quả thế nào:

- `total_ms` cao, `calls` rất lớn: truy vấn nhẹ nhưng gọi quá nhiều; xem ứng dụng có gọi lặp không.
- `mean_ms` cao, `calls` ít: truy vấn nặng từng lần; xem kế hoạch bằng `EXPLAIN (ANALYZE, BUFFERS)` trên bản thử rồi cân nhắc chỉ mục.
- Muốn đo lại từ đầu sau khi tối ưu: `SELECT pg_stat_statements_reset();`.

Lưu ý `EXPLAIN ANALYZE` **thực thi** câu lệnh; với `UPDATE`/`DELETE` hãy bọc trong giao dịch rồi `ROLLBACK`.

## Kiểm tra

- `SHOW shared_preload_libraries;` có `pg_stat_statements`, và truy vấn view trả về dòng.
- `pg_stat_user_tables` cho thấy `last_autovacuum` được cập nhật ở các bảng bận.
- `SHOW log_min_duration_statement;` đúng giá trị bạn đặt, và câu chậm cố ý (ví dụ `SELECT pg_sleep(1)`) xuất hiện trong log.

## Lỗi hay gặp

- **`ERROR: pg_stat_statements must be loaded via "shared_preload_libraries"`**: chưa nạp mô-đun hoặc chưa khởi động lại.
- **Bảng cứ phình dù có autovacuum**: có giao dịch mở lâu, hoặc ngưỡng quá cao cho bảng lớn; xem `pg_stat_activity` và chỉnh `scale_factor` theo bảng.
- **Chạy `VACUUM FULL` giờ cao điểm**: khoá bảng, ứng dụng đứng.
- **Đặt `log_min_duration_statement = 0`** trên hệ thống bận: log mọi câu lệnh, ngập đĩa.
- **Quên rằng thống kê tích luỹ từ lúc khởi động hoặc từ lần reset**: so sánh số liệu ở hai thời điểm cho công bằng.

## Tóm lại

Dòng chết là hệ quả của MVCC; `VACUUM` dọn chúng và autovacuum làm việc đó tự động, bạn chỉ cần theo dõi, chỉnh theo bảng khi cần và tránh `VACUUM FULL` lúc bận. Tìm truy vấn chậm bằng hai lớp: log theo ngưỡng cho từng lần, `pg_stat_statements` cho tổng thể. Cùng với kết nối an toàn và sao lưu đã thử khôi phục, đây là bộ ba nền tảng của việc vận hành PostgreSQL.

## Tham khảo

- [PostgreSQL 16: Routine Vacuuming](https://www.postgresql.org/docs/16/routine-vacuuming.html)
- [PostgreSQL 16: VACUUM](https://www.postgresql.org/docs/16/sql-vacuum.html)
- [PostgreSQL 16: Automatic Vacuuming settings](https://www.postgresql.org/docs/16/runtime-config-autovacuum.html)
- [PostgreSQL 16: pg_stat_statements](https://www.postgresql.org/docs/16/pgstatstatements.html)
- [PostgreSQL 16: Error Reporting and Logging (log_min_duration_statement)](https://www.postgresql.org/docs/16/runtime-config-logging.html)
- [PostgreSQL 16: vacuumdb](https://www.postgresql.org/docs/16/app-vacuumdb.html)
