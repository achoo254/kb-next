---
title: Ingress và Gateway API trên Kubernetes: đưa ứng dụng ra ngoài qua HTTPS
tags: kubernetes, ingress, gateway-api, https, tls
type: note
---

> [!TLDR]
> - Ingress khai báo luật định tuyến HTTP/HTTPS theo tên miền và đường dẫn; cần một Ingress controller cài sẵn để luật có tác dụng.
> - IngressClass chỉ rõ controller nào xử lý Ingress nào; chứng chỉ TLS đặt trong một Secret.
> - Dự án Kubernetes khuyến nghị Gateway API cho nhu cầu mới; Ingress vẫn dùng được và không bị gỡ bỏ.

## Mở đầu

Ở bài [[Service trên Kubernetes: ClusterIP, NodePort, LoadBalancer và DNS của cụm]] ta đã thấy Service giúp Pod tìm nhau. Để người dùng bên ngoài truy cập ứng dụng web, bạn có thể dùng Service kiểu LoadBalancer, nhưng mỗi ứng dụng một bộ cân bằng tải sẽ nhanh chóng tốn kém và khó quản. Kubernetes có hai cách gom lại: **Ingress** (cách lâu đời) và **Gateway API** (cách mới hơn). Bài này giải thích cả hai và cách bật HTTPS.

## Ingress là gì

Ingress là một đối tượng khai báo luật định tuyến HTTP và HTTPS: yêu cầu gửi tới tên miền nào, đường dẫn nào thì chuyển cho Service nào. Điểm quan trọng nhiều người bỏ sót: **bản thân Ingress không làm gì cả**. Nó chỉ là tờ khai báo. Bạn phải cài một **Ingress controller** (một chương trình chạy trong cụm, đọc các Ingress và cấu hình proxy tương ứng). Kubernetes không kèm sẵn controller nào; có nhiều lựa chọn của cộng đồng và nhà cung cấp đám mây.

### IngressClass

Một cụm có thể chạy nhiều controller. `IngressClass` là đối tượng đặt tên cho từng controller, và Ingress chọn controller bằng trường `ingressClassName`. Xem các lớp có sẵn:

```bash
kubectl get ingressclass
```

Nếu danh sách trống, cụm chưa có controller nào và Ingress bạn tạo sẽ không được ai xử lý.

### Ví dụ định tuyến theo tên miền và đường dẫn

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: demo
spec:
  ingressClassName: example-class
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

Giải thích nhanh:

- `host` là tên miền; bỏ trống thì luật áp dụng cho mọi tên miền.
- `pathType: Prefix` khớp theo tiền tố đường dẫn; `Exact` yêu cầu khớp chính xác; `ImplementationSpecific` để controller tự quyết.
- `backend.service` trỏ tới Service trong **cùng namespace** với Ingress.

Tên lớp `example-class` ở trên chỉ là ví dụ; hãy thay bằng tên lấy từ `kubectl get ingressclass`.

## Bật HTTPS với TLS

Để Ingress phục vụ HTTPS, bạn cần chứng chỉ và khoá riêng, lưu trong một Secret kiểu `kubernetes.io/tls` cùng namespace. Tạo bằng lệnh:

```bash
kubectl -n demo create secret tls web-tls --cert=fullchain.pem --key=privkey.pem
```

Sau đó tham chiếu trong Ingress:

```yaml
spec:
  ingressClassName: example-class
  tls:
    - hosts:
        - app.example.com
      secretName: web-tls
  rules:
    - host: app.example.com
      # ... như trên
```

Lưu ý: khoá riêng là bí mật. Không đưa tệp khoá vào kho mã nguồn; cách quản lý Secret nói thêm trong [[ConfigMap và Secret: tách cấu hình khỏi image ứng dụng trên Kubernetes]]. Nhiều đội còn dùng một thành phần tự động xin và gia hạn chứng chỉ thay vì tạo tay, nhưng cơ chế bên dưới vẫn là Secret kiểu TLS như trên.

Chọn một controller: nhớ đọc tài liệu riêng của nó, vì nhiều tính năng nâng cao (viết lại đường dẫn, giới hạn tốc độ, chuyển hướng) được cấu hình qua annotation đặc thù của từng controller, không có trong đặc tả Ingress chung.

## Gateway API: cách mới hơn

Tài liệu Kubernetes ghi rõ: dự án khuyến nghị dùng **Gateway** thay cho Ingress, API Ingress đã được "đóng băng" (không phát triển thêm), nhưng vẫn ở trạng thái GA và **không có kế hoạch gỡ bỏ**. Vì vậy bạn không cần vội bỏ Ingress đang chạy ổn, nhưng với hệ thống mới nên cân nhắc Gateway API.

Gateway API chia vai rõ hơn bằng ba loại đối tượng chính:

- **GatewayClass:** loại hạ tầng, do nhà cung cấp hoặc đội nền tảng định nghĩa.
- **Gateway:** một điểm vào cụ thể, khai báo các cổng và giao thức lắng nghe (kể cả TLS).
- **HTTPRoute:** luật định tuyến HTTP của ứng dụng, gắn vào một Gateway.

Cách chia này cho phép đội vận hành quản lý Gateway, còn đội ứng dụng chỉ viết HTTPRoute của mình. Gateway API là bộ CRD cài thêm vào cụm và cần một triển khai (implementation) hỗ trợ; nó không phải thứ có sẵn mặc định. Ví dụ HTTPRoute tối giản:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
  namespace: demo
spec:
  parentRefs:
    - name: shared-gateway
  hostnames:
    - app.example.com
  rules:
    - backendRefs:
        - name: web
          port: 80
```

## So sánh nhanh

| | Ingress | Gateway API |
|---|---|---|
| Trạng thái | GA, đã đóng băng | Được khuyến nghị cho nhu cầu mới |
| Phân vai | Một đối tượng cho tất cả | Class, Gateway, Route tách riêng |
| Tính năng nâng cao | Thường qua annotation riêng | Nhiều thứ nằm trong đặc tả |
| Cần cài thêm | Ingress controller | Gateway API CRD và một implementation |

## Kiểm tra

1. `kubectl get ingressclass` thấy ít nhất một lớp.
2. `kubectl -n demo get ingress web` có địa chỉ ở cột `ADDRESS` (có thể mất một lúc).
3. Trỏ DNS tên miền tới địa chỉ đó rồi chạy `curl -I https://app.example.com`.
4. Dùng `kubectl -n demo describe ingress web` xem các sự kiện nếu chưa chạy.

## Lỗi hay gặp

- **Quên cài controller:** Ingress tồn tại nhưng không có địa chỉ.
- **Sai `ingressClassName`:** không controller nào nhận.
- **Secret TLS ở namespace khác:** phải cùng namespace với Ingress.
- **Backend sai tên hoặc cổng Service:** nhận lỗi 503 hoặc 404 từ proxy.
- **Chưa trỏ DNS** hoặc dùng chứng chỉ không khớp tên miền.

## Tóm lại

Ingress gom việc định tuyến HTTP/HTTPS vào một điểm vào, nhưng cần controller và `ingressClassName` đúng. HTTPS dùng Secret kiểu TLS. Ingress vẫn được hỗ trợ; với hệ thống mới, Gateway API là hướng được khuyến nghị, với cách phân vai rõ hơn.

## Tham khảo

- [Ingress (tài liệu Kubernetes)](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Gateway API (tài liệu Kubernetes)](https://kubernetes.io/docs/concepts/services-networking/gateway/)
- [Secret kiểu TLS](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
