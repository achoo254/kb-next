---
title: Mạng host trong Docker: bỏ lớp cách ly mạng và khi nào nên dùng
tags: docker, networking, host-network, security, ubuntu
type: note
---

> [!TLDR]
> - Với `--network host`, container dùng thẳng ngăn xếp mạng của máy chủ: không có IP riêng, không NAT, và các cờ `-p`/`-P` bị bỏ qua.
> - Lợi ích là hiệu năng và tiện khi ứng dụng dùng dải cổng rộng; cái giá là mất cách ly mạng và dễ xung đột cổng với máy chủ.
> - Mặc định hãy dùng bridge tự tạo; chỉ chọn host khi bạn đã cân nhắc rõ cả hai mặt.

## Mở đầu

Hai bài trước nói về mạng bridge, nơi mỗi container có một "căn phòng mạng" riêng nối với máy chủ qua cầu ảo. Docker còn một lựa chọn cực đoan hơn: cho container **dùng chung** mạng với máy chủ. Đó là driver `host`. Bài này giải thích nó làm gì, khi nào hợp lý và rủi ro đi kèm. Bài viết trỏ về [[Mạng bridge tự tạo trong Docker: container gọi nhau bằng tên nhờ DNS nội bộ]] làm điểm so sánh. Lệnh kiểm theo Docker Engine 29 trên Ubuntu 24.04 LTS.

## Mạng host hoạt động thế nào

Khi chạy:

```bash
docker run -d --name web-host --network host nginx
```

container **không** được cấp địa chỉ IP riêng. Nó nhìn thấy đúng các giao diện mạng của máy chủ, và khi ứng dụng bên trong nghe cổng 80, thì cổng 80 đó chính là cổng 80 của máy chủ. Kiểm tra từ máy chủ:

```bash
curl -I http://127.0.0.1:80
```

Vì không có lớp mạng ảo ở giữa, nên:

- **Không cần và không có ánh xạ cổng.** Theo tài liệu Docker, khi dùng host mode thì `-p`, `--publish`, `-P` và `--publish-all` đều bị bỏ qua, kèm cảnh báo `WARNING: Published ports are discarded when using host network mode`.
- **Không có NAT**, cũng không có tiến trình userland-proxy cho từng cổng.

Docker Engine trên Linux hỗ trợ driver này. Docker Desktop hỗ trợ từ bản 4.34 và cần bật tính năng trong phần cài đặt; vì vậy lệnh mẫu trong bài là cho Docker Engine trên Ubuntu.

## Khi nào nên dùng

Tài liệu Docker nêu hai lý do chính:

1. **Tối ưu hiệu năng.** Không phải dịch địa chỉ và không có proxy cho từng cổng, nên bớt một lớp xử lý trên đường đi của gói tin.
2. **Ứng dụng cần một dải cổng rộng.** Thay vì viết hàng trăm tuỳ chọn `-p`, container dùng thẳng các cổng của máy chủ. Ví dụ là một dịch vụ phải nghe hàng loạt cổng liên tiếp.

Một lý do thực tế khác hay gặp là chương trình cần thấy trực tiếp các giao diện mạng của máy chủ, chẳng hạn công cụ chẩn đoán mạng. Dù vậy, hãy cân nhắc: nhiều trường hợp có thể giải quyết bằng bridge tự tạo cộng vài tuỳ chọn `-p`, và thế vẫn gọn, an toàn hơn.

## Cái giá phải trả

### Mất cách ly mạng

Ở bridge, container chỉ thấy mạng ảo của nó. Ở host, tiến trình trong container nghe được mọi giao diện của máy chủ. Nếu tiến trình đó bị khai thác, kẻ tấn công đứng ngay trên mạng của máy chủ. Vì vậy host mode không nên dùng cho dịch vụ không tin cậy hoặc dịch vụ hướng ra Internet nếu chưa có biện pháp khác.

### Xung đột cổng

Container ở host mode và các tiến trình khác trên máy chủ dùng chung một không gian cổng. Nếu máy chủ đã có chương trình nghe cổng 80, container nginx chạy host mode không thể nghe cổng 80 nữa và sẽ báo lỗi bind. Tài liệu Docker cũng nhắc hệ quả cùng loại với dịch vụ swarm: nếu một container nghe cổng 80, mỗi nút swarm chỉ chạy được một container như thế.

### Không còn mạng ảo riêng

Container ở host mode không nằm trong mạng bridge tự tạo nên không dùng được cách gọi theo tên container như bài trước. Nó nói chuyện với container khác qua địa chỉ của máy chủ và cổng mà các container đó đã publish.

### Khó tái sử dụng

Cùng một image chạy nhiều bản trên một máy rất dễ đụng cổng ở host mode, trong khi ở bridge mỗi bản có cổng nội bộ riêng và chỉ cần đổi cổng publish. Vì vậy host mode kém phù hợp khi bạn muốn nhân bản container.

## Một mạng nữa: none

Để so sánh cho đủ bộ ba mạng mặc định: `--network none` cho container không có kết nối mạng ra ngoài. Nó dành cho công việc không cần mạng, hoặc khi bạn muốn tự lắp mạng bằng cách khác. Danh sách `docker network ls` ban đầu gồm đúng ba mạng: `bridge`, `host`, `none`.

## Kiểm tra và dọn dẹp

Sau khi thử xong, xoá container (lệnh này **xoá container `web-host`**):

```bash
docker rm -f web-host
```

Trước khi chạy ở host mode, hãy tự hỏi:

- Ứng dụng có thật sự cần dải cổng rộng hoặc hiệu năng cao nhất không?
- Có chương trình khác trên máy chủ đang dùng cổng đó không? Xem bằng `ss -ltn`.
- Nếu tiến trình trong container bị chiếm quyền, thiệt hại ở cấp mạng máy chủ là gì?

## Lỗi hay gặp

- **Vẫn viết `-p` và tưởng nó có tác dụng**: ở host mode nó bị bỏ qua. Cổng ứng dụng nghe cũng là cổng trên máy chủ.
- **Container thoát ngay vì cổng bận**: có chương trình khác đang giữ cổng; đổi cổng trong cấu hình ứng dụng hoặc dừng chương trình kia.
- **Chạy trên Docker Desktop mà không bật**: cần bật tính năng host networking trong cài đặt ở bản 4.34 trở lên.
- **Dùng host mode chỉ vì "đỡ phải nghĩ về cổng"**: đó là lý do yếu; cái giá về cách ly thường lớn hơn lợi ích.

## Tóm lại

Mạng host bỏ hẳn lớp mạng ảo: nhanh hơn một chút và hợp với ứng dụng cần nhiều cổng, đổi lại bạn mất cách ly và phải tự quản lý xung đột cổng. Quy tắc gọn cho cả chuỗi bài: mặc định dùng bridge tự tạo, publish tối thiểu và gắn vào `127.0.0.1` khi được; chỉ dùng host khi có lý do rõ ràng.

## Tham khảo

- [Host network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/host/)
- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [Port publishing and mapping, Docker Docs](https://docs.docker.com/engine/network/port-publishing/)
