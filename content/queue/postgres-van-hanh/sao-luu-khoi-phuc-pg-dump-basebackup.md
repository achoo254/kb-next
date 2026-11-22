---
title: Sao lưu và khôi phục PostgreSQL: pg_dump, pg_restore và pg_basebackup
tags: PostgreSQL, sao lưu, pg_dump, pg_basebackup, khôi phục
type: lab
---

> [!TLDR]
> - Có hai họ sao lưu: **logic** (`pg_dump`, xuất cấu trúc và dữ liệu của một cơ sở dữ liệu) và **vật lý** (`pg_basebackup`, chép nguyên cụm PostgreSQL).
> - Dạng `-Fc` của `pg_dump` cho phép khôi phục chọn lọc và song song bằng `pg_restore`; bản sao lưu vật lý khôi phục cả cụm và là nền để khôi phục theo thời điểm.
> - Sao lưu chưa thử khôi phục thì chưa là sao lưu: hãy khôi phục thử vào một cơ sở dữ liệu khác định kỳ.

## Mở đầu

Ở bài trước, bài về kết nối, vai trò và `pg_hba.conf`, ta đã có một cơ sở dữ liệu `shopdb` với vai trò `app_user`. Bài này trả lời câu hỏi: nếu mất dữ liệu thì lấy lại bằng cách nào?

PostgreSQL cho hai cách chính, mỗi cách hợp một việc:

| | Logic (`pg_dump`) | Vật lý (`pg_basebackup`) |
|---|---|---|
| Đơn vị | một cơ sở dữ liệu | cả cụm (mọi cơ sở dữ liệu) |
| Nội dung | lệnh/dữ liệu để dựng lại | bản chép các tệp dữ liệu và WAL |
| Khôi phục | `pg_restore` hoặc `psql` | giải nén vào thư mục dữ liệu rồi khởi động |
| Hợp với | cơ sở dữ liệu vừa và nhỏ, chuyển giữa các máy, chọn từng bảng | cơ sở dữ liệu lớn, khôi phục cả cụm nhanh, làm nền cho sao chép và khôi phục theo thời điểm |
| Giới hạn | khôi phục lâu khi dữ liệu lớn | phải cùng phiên bản chính và cùng kiến trúc khi khôi phục |

Các lệnh dưới đây đã thử trên Ubuntu 24.04 với PostgreSQL 16.15.

## Sao lưu logic với pg_dump

### Chuẩn bị

`pg_dump` chạy như một máy khách bình thường, nên cần quyền đọc các bảng. Chạy bằng tài khoản `postgres` trên máy chủ là đơn giản nhất:

```bash
sudo -u postgres pg_dump -Fc -f /var/backups/shopdb.dump shopdb
```

Hãy bảo đảm thư mục đích tồn tại và `postgres` ghi được. Tuỳ chọn `-F` chọn định dạng: `p` (văn bản SQL thuần, mặc định), `c` (custom, nén), `d` (thư mục, hỗ trợ dump song song với `-j`), `t` (tar). Tuỳ chọn `-s` chỉ xuất cấu trúc, `-a` chỉ xuất dữ liệu.

### Xem nội dung bản sao lưu

Định dạng custom có "mục lục" mà bạn xem được mà không cần khôi phục:

```bash
pg_restore --list /var/backups/shopdb.dump
```

Kết quả liệt kê từng đối tượng (bảng, dữ liệu bảng, ràng buộc...) cùng phiên bản `pg_dump` đã tạo ra bản này.

### Khôi phục

Khôi phục vào một cơ sở dữ liệu trống mới:

```bash
sudo -u postgres createdb shopdb_restore
sudo -u postgres pg_restore -d shopdb_restore --no-owner /var/backups/shopdb.dump
```

`--no-owner` bỏ qua việc gán chủ sở hữu theo bản gốc, hữu ích khi vai trò gốc không có ở máy đích. Một vài tuỳ chọn khác của `pg_restore`: `-j N` khôi phục song song bằng N tiến trình, `-C` tạo cơ sở dữ liệu trước (kết nối vào một cơ sở dữ liệu có sẵn như `postgres` rồi mới tạo), `-c --if-exists` xoá đối tượng cũ trước khi tạo lại.

> **Cảnh báo:** `--clean`/`-c` xoá các đối tượng đang có trong cơ sở dữ liệu đích trước khi dựng lại. Chỉ dùng khi bạn chắc chắn đang nhắm đúng cơ sở dữ liệu; thói quen an toàn là khôi phục vào cơ sở dữ liệu mới, kiểm tra, rồi mới chuyển hướng ứng dụng.

Để kiểm tra nhanh, đếm số dòng trong bảng đã khôi phục và so với bản gốc:

```bash
sudo -u postgres psql -d shopdb_restore -Atc "SELECT count(*) FROM t"
```

(Bảng `t` ở đây là bảng mẫu có 1.000 dòng dùng khi thử; bạn thay bằng bảng của mình.)

### Giới hạn cần biết

- `pg_dump` không xuất các **vai trò** và **tablespace** (những thứ thuộc cả cụm). Dùng `pg_dumpall --globals-only` để lấy riêng phần đó.
- `pg_dump` cho bản chụp nhất quán tại thời điểm bắt đầu mà không chặn người khác đọc/ghi, nhưng nó không giúp khôi phục về "mười phút trước khi xảy ra sự cố".

## Sao lưu vật lý với pg_basebackup

`pg_basebackup` kết nối như một máy khách sao chép nên cần dòng `replication` trong `pg_hba.conf` (bản mặc định của Ubuntu đã có cho socket cục bộ) và vai trò có thuộc tính `REPLICATION` hoặc là siêu quản trị. Ví dụ chạy trên chính máy chủ:

```bash
sudo -u postgres pg_basebackup -D /var/backups/base -Ft -z -X stream -c fast -P
```

Ý nghĩa: `-D` thư mục đích (phải trống hoặc chưa có), `-Ft -z` xuất dạng tar nén gzip, `-X stream` chép cả WAL cần thiết trong lúc sao lưu để bản chép tự đủ dùng, `-c fast` yêu cầu checkpoint ngay thay vì chờ, `-P` hiện tiến độ. Kết quả gồm `base.tar.gz`, `pg_wal.tar.gz` và `backup_manifest`.

Muốn kiểm tra tính toàn vẹn của bản chép dạng thư mục thường (`-Fp`), dùng `pg_verifybackup` với tệp manifest.

Khôi phục từ bản vật lý, ở mức khái quát:

1. Dừng cụm: `sudo systemctl stop postgresql@16-main`.
2. Đổi tên hoặc dời thư mục dữ liệu cũ (đừng xoá ngay), tạo lại thư mục rỗng thuộc `postgres`.
3. Giải nén `base.tar.gz` vào thư mục dữ liệu và `pg_wal.tar.gz` vào thư mục con `pg_wal`.
4. Khởi động lại cụm và kiểm tra log.

Trên Ubuntu, các tệp cấu hình nằm riêng ở `/etc/postgresql/16/main/` chứ không nằm trong thư mục dữ liệu, nên hãy sao lưu thư mục `/etc/postgresql` bằng công cụ tệp thông thường.

> **Cảnh báo:** bước 2 và 3 ghi đè dữ liệu. Thực hành trước trên một máy thử, không phải trên máy chủ chạy thật.

Muốn khôi phục về một thời điểm bất kỳ (point-in-time recovery), bạn cần thêm lưu trữ WAL liên tục (`archive_mode`, `archive_command`) bên cạnh bản sao lưu cơ sở. Đây là chủ đề riêng; bài này chỉ nhắc để bạn biết bản chụp hằng đêm chưa đủ nếu yêu cầu là "mất tối đa vài phút dữ liệu".

## Lên lịch và thử khôi phục

Một lịch tối thiểu có thể là: `pg_dump -Fc` mỗi đêm cho từng cơ sở dữ liệu quan trọng, kèm `pg_dumpall --globals-only`, ghi ra thư mục có tên theo ngày, sao chép sang một nơi khác máy chủ, và xoá bản cũ theo chính sách giữ. Dùng `cron` hoặc timer của systemd để chạy, và ghi kết quả ra log (xem [[journalctl: lọc log theo dịch vụ và theo thời gian trên Ubuntu 24.04]] nếu bạn chạy qua dịch vụ systemd).

Điều quan trọng hơn lịch là **thử khôi phục định kỳ**: ít nhất mỗi quý, khôi phục bản mới nhất vào một cơ sở dữ liệu hoặc máy thử, rồi chạy vài truy vấn kiểm tra. Đo luôn thời gian khôi phục để biết mục tiêu thời gian của mình có thực tế không.

## Kiểm tra

- `pg_restore --list` đọc được bản sao lưu mà không báo lỗi.
- Khôi phục vào cơ sở dữ liệu thử thành công, số dòng khớp với bản gốc.
- Bản sao lưu nằm ở nơi khác máy chủ gốc.
- Có ghi lại lệnh khôi phục và người nào cũng làm theo được.

## Lỗi hay gặp

- **`pg_dump: error: server version mismatch`**: `pg_dump` cũ hơn máy chủ không dump được; dùng công cụ có phiên bản bằng hoặc mới hơn máy chủ.
- **`pg_restore: error: role "app_user" does not exist`**: vai trò chưa có ở máy đích; tạo trước, hoặc khôi phục với `--no-owner`.
- **Quên rằng `pg_dump` không chứa vai trò**: sao lưu thêm bằng `pg_dumpall --globals-only`.
- **`pg_basebackup` báo không có quyền replication**: thiếu dòng `replication` trong `pg_hba.conf` hoặc vai trò thiếu `REPLICATION`.
- **Chỉ sao lưu trên cùng ổ đĩa với dữ liệu**: hỏng ổ là mất cả hai.
- **Không bao giờ thử khôi phục**: đến ngày cần mới biết tệp hỏng hoặc thiếu.

## Tóm lại

Dùng `pg_dump -Fc` và `pg_restore` cho sao lưu logic linh hoạt từng cơ sở dữ liệu; dùng `pg_basebackup` khi cần chép cả cụm và nền cho khôi phục theo thời điểm. Cả hai đều cần được lưu ở nơi khác và được thử khôi phục thường xuyên. Khi dữ liệu đã an toàn, việc tiếp theo là giữ cho cơ sở dữ liệu khoẻ và biết truy vấn nào chậm, như bài kế tiếp: [[VACUUM, autovacuum và truy vấn chậm trong PostgreSQL với pg_stat_statements]].

## Tham khảo

- [PostgreSQL 16: pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
- [PostgreSQL 16: pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)
- [PostgreSQL 16: pg_dumpall](https://www.postgresql.org/docs/16/app-pg-dumpall.html)
- [PostgreSQL 16: pg_basebackup](https://www.postgresql.org/docs/16/app-pgbasebackup.html)
- [PostgreSQL 16: Backup and Restore](https://www.postgresql.org/docs/16/backup.html)
- [PostgreSQL 16: pg_verifybackup](https://www.postgresql.org/docs/16/app-pgverifybackup.html)
