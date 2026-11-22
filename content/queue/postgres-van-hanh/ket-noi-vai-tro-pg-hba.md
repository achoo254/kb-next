---
title: PostgreSQL trên Ubuntu 24.04: kết nối, vai trò và tệp pg_hba.conf
tags: PostgreSQL, pg_hba.conf, vai trò, xác thực, Ubuntu 24.04
type: lab
---

> [!TLDR]
> - Trên Ubuntu 24.04, gói `postgresql` cài PostgreSQL 16; tệp cấu hình nằm ở `/etc/postgresql/16/main/`.
> - Quyền truy cập gồm hai lớp: **vai trò** (role) quyết định ai là ai, còn `pg_hba.conf` quyết định ai được kết nối từ đâu, vào cơ sở dữ liệu nào, bằng cách xác thực nào.
> - Dòng khớp đầu tiên trong `pg_hba.conf` thắng; sửa xong chỉ cần nạp lại (reload), không cần khởi động lại.

## Mục tiêu

Sau bài này bạn sẽ cài được PostgreSQL 16 trên Ubuntu 24.04 LTS, kết nối bằng `psql`, tạo một vai trò và một cơ sở dữ liệu cho ứng dụng, rồi đọc và sửa `pg_hba.conf` để cho phép đúng máy cần kết nối. Đây là bài đầu của chuỗi về vận hành PostgreSQL; bài sau nói về [[Sao lưu và khôi phục PostgreSQL: pg_dump, pg_restore và pg_basebackup]].

## Chuẩn bị

- Một máy Ubuntu 24.04 LTS, tài khoản có quyền `sudo`.
- Ví dụ trong bài dùng địa chỉ của vùng tài liệu: `192.0.2.0/24` cho mạng ứng dụng. Hãy thay bằng mạng thật của bạn.

Cài đặt:

```bash
sudo apt update
sudo apt install postgresql
psql --version        # ví dụ: psql (PostgreSQL) 16.x
pg_lsclusters         # liệt kê các cụm (cluster) trên máy
```

Ubuntu dùng bộ công cụ `postgresql-common`, nên mỗi "cụm" có tên dạng `16 main`. Dịch vụ tương ứng là `postgresql@16-main`, được bao bởi dịch vụ chung `postgresql`.

## Các bước

### Bước 1: kết nối lần đầu bằng tài khoản hệ thống postgres

Khi cài, Ubuntu tạo tài khoản hệ điều hành `postgres` và một vai trò cùng tên trong cơ sở dữ liệu. Cách đơn giản nhất để vào là chuyển sang tài khoản này:

```bash
sudo -u postgres psql
```

Trong `psql`, vài lệnh meta hay dùng (bắt đầu bằng dấu `\`):

```text
\conninfo     -- bạn đang nối bằng tài khoản nào, vào đâu
\l            -- danh sách cơ sở dữ liệu
\du           -- danh sách vai trò
\q            -- thoát
```

Vì sao không cần mật khẩu? Vì dòng `local all postgres peer` trong `pg_hba.conf` dùng cách xác thực **peer**: máy chủ hỏi hệ điều hành "ai đang chạy tiến trình này?" và chấp nhận nếu tên trùng với tên vai trò.

### Bước 2: tạo vai trò và cơ sở dữ liệu cho ứng dụng

Đừng để ứng dụng dùng vai trò `postgres` (siêu quản trị). Hãy tạo vai trò riêng, chỉ sở hữu cơ sở dữ liệu của nó:

```sql
CREATE ROLE app_user LOGIN PASSWORD 'doi_mat_khau_nay';
CREATE DATABASE shopdb OWNER app_user;
```

Mật khẩu trên chỉ là ví dụ, hãy đặt mật khẩu dài và ngẫu nhiên. Cách an toàn hơn là gõ `\password app_user` trong `psql` để mật khẩu không nằm trong lịch sử lệnh; từ PostgreSQL 14, mặc định mật khẩu được lưu dạng băm `scram-sha-256`.

Một vai trò có thể có các thuộc tính như `LOGIN` (được đăng nhập), `SUPERUSER`, `CREATEDB`, `CREATEROLE`. Với ứng dụng thường chỉ cần `LOGIN`. Nguyên tắc là cấp quyền tối thiểu đủ để làm việc.

### Bước 3: đọc pg_hba.conf

Mở tệp (đường dẫn đúng cho cụm `16 main` của Ubuntu):

```bash
sudo less /etc/postgresql/16/main/pg_hba.conf
```

Bỏ các dòng chú thích, bản mặc định trên Ubuntu 24.04 khoảng như sau:

```text
# TYPE  DATABASE  USER      ADDRESS         METHOD
local   all       postgres                  peer
local   all       all                       peer
host    all       all       127.0.0.1/32    scram-sha-256
host    all       all       ::1/128         scram-sha-256
local   replication all                     peer
host    replication all     127.0.0.1/32    scram-sha-256
host    replication all     ::1/128         scram-sha-256
```

Mỗi dòng có năm cột chính:

| Cột | Ý nghĩa |
|---|---|
| TYPE | `local` (qua socket Unix trên cùng máy), `host` (TCP/IP), `hostssl` (chỉ TCP có mã hoá TLS) |
| DATABASE | tên cơ sở dữ liệu, hoặc `all`; `replication` dành cho kết nối sao chép/sao lưu vật lý |
| USER | tên vai trò hoặc `all` |
| ADDRESS | địa chỉ hoặc dải mạng (CIDR); không có cột này với `local` |
| METHOD | cách xác thực: `peer`, `scram-sha-256`, `reject`, `trust`... |

Quy tắc quan trọng nhất: máy chủ duyệt từ trên xuống và **dùng dòng khớp đầu tiên**; nếu dòng đó xác thực thất bại thì từ chối, không thử dòng sau. Vì vậy dòng cụ thể phải đặt trước dòng chung.

Tránh phương pháp `trust`: nó cho vào không cần mật khẩu.

### Bước 4: cho phép máy ứng dụng kết nối qua mạng

Mặc định PostgreSQL chỉ lắng nghe ở localhost. Để nhận kết nối từ máy khác, cần hai việc.

Một là sửa `listen_addresses` trong `/etc/postgresql/16/main/postgresql.conf`. Ví dụ, nếu máy chủ cơ sở dữ liệu có địa chỉ `192.0.2.10`:

```text
listen_addresses = 'localhost, 192.0.2.10'
```

Thay đổi này **cần khởi động lại**:

```bash
sudo systemctl restart postgresql@16-main
```

Hai là thêm dòng vào `pg_hba.conf`, chỉ cho đúng người dùng, đúng cơ sở dữ liệu, đúng dải mạng, và nên bắt TLS nếu đã cấu hình:

```text
host    shopdb    app_user    192.0.2.0/24    scram-sha-256
```

Dòng này đứng sau các dòng mặc định là được, vì không dòng mặc định nào khớp kết nối từ `192.0.2.0/24`. Rồi nạp lại cấu hình xác thực (không cắt kết nối đang chạy):

```bash
sudo systemctl reload postgresql@16-main
# hoặc trong psql: SELECT pg_reload_conf();
```

Nếu có tường lửa, nhớ mở cổng TCP 5432 chỉ cho dải mạng cần thiết.

## Kiểm tra

Thử kết nối bằng vai trò mới qua TCP:

```bash
psql -h 127.0.0.1 -U app_user -d shopdb
```

Máy chủ sẽ hỏi mật khẩu, vì dòng `host ... 127.0.0.1/32 scram-sha-256` khớp. Từ máy khác trong mạng ứng dụng, thay `127.0.0.1` bằng `192.0.2.10`. Kiểm tra máy chủ có nhận kết nối không:

```bash
pg_isready -h 192.0.2.10 -p 5432
```

Muốn biết máy chủ đã hiểu `pg_hba.conf` thế nào (thứ tự, và có dòng nào lỗi cú pháp), truy vấn view `pg_hba_file_rules`:

```sql
SELECT line_number, type, database, user_name, address, auth_method, error
FROM pg_hba_file_rules;
```

Cột `error` khác rỗng nghĩa là dòng đó sai và bị bỏ qua. Để không phải gõ mật khẩu trong script, có thể dùng tệp `~/.pgpass` (định dạng `host:port:database:user:password`), nhưng tệp này phải có quyền `0600` thì `psql` mới dùng.

## Lỗi hay gặp

- **`FATAL: no pg_hba.conf entry for host "192.0.2.50", user "app_user", database "shopdb"`**: không có dòng nào khớp. Kiểm tra lại dải mạng, tên người dùng, tên cơ sở dữ liệu và `TYPE` (nếu bạn bắt `hostssl` mà máy khách không dùng TLS thì cũng không khớp).
- **`FATAL: Peer authentication failed for user "app_user"`**: bạn đang nối qua socket Unix (không có `-h`) nên dòng `local ... peer` khớp, mà tên tài khoản hệ điều hành không trùng tên vai trò. Thêm `-h 127.0.0.1` để đi qua TCP, hoặc đổi dòng `local` cho phù hợp.
- **`FATAL: password authentication failed`**: sai mật khẩu, hoặc vai trò chưa có mật khẩu.
- **`connection refused` từ máy khác**: `listen_addresses` còn là `localhost`, dịch vụ chưa khởi động lại, hoặc tường lửa chặn cổng 5432.
- **Sửa `pg_hba.conf` mà không có tác dụng**: quên nạp lại (`reload`), hoặc sửa nhầm tệp. Hỏi chính máy chủ: `SHOW hba_file;`.
- Đặt dòng `host all all 0.0.0.0/0 ...` cho "tiện" là cách mở toàn bộ cơ sở dữ liệu ra mạng; hãy luôn giới hạn dải mạng.

## Tóm lại

Hai lớp kiểm soát cần nhớ: vai trò (ai) và `pg_hba.conf` (từ đâu, vào đâu, bằng cách nào). Dòng khớp đầu tiên thắng, nên cụ thể trước chung sau. `pg_hba.conf` chỉ cần reload, còn `listen_addresses` cần restart. Dùng vai trò riêng cho từng ứng dụng, mật khẩu `scram-sha-256`, và giới hạn dải mạng. Khi đã vào được, việc quan trọng tiếp theo là có bản sao lưu khôi phục được, như bài kế tiếp trong chuỗi.

Bài chỉ nêu cách vận hành cơ bản trên PostgreSQL 16 của Ubuntu 24.04 (đã thử với bản 16.15); với môi trường thật, hãy đọc kỹ tài liệu chính thức trước khi đổi cấu hình.

## Tham khảo

- [PostgreSQL 16: Client Authentication, pg_hba.conf](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html)
- [PostgreSQL 16: Database Roles](https://www.postgresql.org/docs/16/user-manag.html)
- [PostgreSQL 16: Connections and Authentication (listen_addresses)](https://www.postgresql.org/docs/16/runtime-config-connection.html)
- [PostgreSQL 16: pg_hba_file_rules](https://www.postgresql.org/docs/16/view-pg-hba-file-rules.html)
- [Ubuntu Server: Install and configure PostgreSQL](https://documentation.ubuntu.com/server/how-to/databases/install-postgresql/)
