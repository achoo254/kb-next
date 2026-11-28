---
title: Service trên Kubernetes: ClusterIP, NodePort, LoadBalancer và DNS của cụm
tags: kubernetes, service, clusterip, nodeport, dns
type: note
---

> [!TLDR]
> - Pod có địa chỉ IP luôn thay đổi; Service cho một nhóm Pod một địa chỉ và một tên ổn định.
> - ClusterIP chỉ dùng trong cụm, NodePort mở cổng trên mọi node, LoadBalancer nhờ hạ tầng bên ngoài cấp địa chỉ công khai.
> - DNS của cụm giúp Pod gọi nhau bằng tên như `web.demo.svc.cluster.local`.

## Mở đầu

Khi chạy ứng dụng trên Kubernetes, bạn sớm gặp một vấn đề: Pod sinh ra và mất đi liên tục. Mỗi lần Deployment cập nhật hay một node gặp sự cố, Pod mới được tạo với địa chỉ IP mới. Nếu một ứng dụng khác ghi cứng IP của Pod, nó sẽ hỏng ngay lần đầu Pod được thay thế. Kubernetes giải quyết bằng một đối tượng tên là **Service**: nó đứng trước một nhóm Pod và cho nhóm đó một địa chỉ ảo cùng một tên DNS không đổi.

Bài này giải thích Service hoạt động ra sao, ba kiểu Service hay gặp (ClusterIP, NodePort, LoadBalancer) và cách Pod tìm nhau qua DNS của cụm. Nếu bạn chưa biết cách tạo Pod bằng Deployment, hãy đọc trước [[Deployment và rolling update trong Kubernetes: cập nhật ứng dụng mà không gián đoạn]]; bài đó giải thích vì sao Pod bị thay thế khi cập nhật, và đó chính là lý do Service cần tồn tại.

## Service chọn Pod bằng nhãn

Service không biết Pod là gì ngoài nhãn (label). Bạn khai báo một `selector`, và Kubernetes tự theo dõi những Pod có nhãn khớp và đang sẵn sàng, rồi chuyển lưu lượng tới chúng (danh sách địa chỉ đó được lưu trong các đối tượng EndpointSlice). Khi Pod thêm hoặc mất, danh sách tự cập nhật.

Ví dụ một Deployment tên `web` với nhãn `app: web`, và một Service đi kèm:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: demo
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
```

Hai con số cần phân biệt: `port` là cổng của Service (nơi client gọi tới), còn `targetPort` là cổng mà container thực sự lắng nghe. Hai số này có thể khác nhau, và đó là nguồn nhầm lẫn phổ biến.

Áp dụng và kiểm tra:

```bash
kubectl create namespace demo
kubectl apply -f service-web.yaml
kubectl -n demo get service web
kubectl -n demo get endpointslices
```

Nếu cột địa chỉ trong EndpointSlice trống, selector không khớp với nhãn của Pod nào, hoặc Pod chưa sẵn sàng.

## Ba kiểu Service hay dùng

### ClusterIP: mặc định, chỉ trong cụm

Nếu bạn không ghi `type`, Service là **ClusterIP**. Nó nhận một địa chỉ ảo nội bộ và chỉ truy cập được từ bên trong cụm. Đây là lựa chọn đúng cho phần lớn thành phần nội bộ như cơ sở dữ liệu, hàng đợi hay API phụ trợ, vì chúng không nên lộ ra ngoài.

### NodePort: mở một cổng trên mọi node

Với `type: NodePort`, Kubernetes ngoài việc tạo ClusterIP còn mở một cổng trên **mọi node** của cụm, mặc định trong khoảng 30000–32767. Truy cập `địa-chỉ-node:cổng` sẽ chuyển tới Service. Kiểu này tiện để thử nghiệm hoặc làm nền cho một bộ cân bằng tải do bạn tự dựng, nhưng ít khi là cách đưa ứng dụng ra người dùng cuối vì cổng lạ và phải tự quản việc chọn node.

```yaml
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
```

Bạn có thể bỏ `nodePort` để Kubernetes tự chọn một cổng còn trống.

### LoadBalancer: nhờ hạ tầng cấp địa chỉ công khai

Với `type: LoadBalancer`, Kubernetes yêu cầu hạ tầng bên dưới tạo một bộ cân bằng tải bên ngoài và gắn địa chỉ của nó vào Service. Điều này chỉ chạy khi cụm có thành phần làm việc đó: thường là dịch vụ đám mây quản lý sẵn, hoặc một add-on bạn cài thêm cho cụm tự dựng. Nếu không có, cột `EXTERNAL-IP` sẽ mãi ở trạng thái `<pending>`.

```bash
kubectl -n demo get service web
```

Mỗi Service `LoadBalancer` thường tốn một bộ cân bằng tải riêng. Khi có nhiều ứng dụng web, người ta thường gom chúng sau một Ingress hoặc Gateway chung; chủ đề đó là nội dung của bài kế tiếp trong hành tinh này.

## DNS của cụm: gọi nhau bằng tên

Cụm Kubernetes chạy sẵn một dịch vụ DNS. Mỗi Service nhận một bản ghi tên theo mẫu:

```text
<tên-service>.<namespace>.svc.cluster.local
```

Với ví dụ trên, tên đầy đủ là `web.demo.svc.cluster.local`. Mỗi Pod được kubelet cấu hình sẵn `/etc/resolv.conf` có danh sách tìm kiếm (search) gồm namespace của chính Pod đó, nên:

- Trong cùng namespace `demo`, chỉ cần gọi `web`.
- Từ namespace khác, dùng `web.demo` hoặc tên đầy đủ.

Để thử, chạy một Pod tạm và tra tên:

```bash
kubectl -n demo run dnstest --rm -it --image=busybox:1.36 --restart=Never -- nslookup web
```

Kết quả hiển thị địa chỉ ClusterIP của Service. Nếu bạn đã quen với Docker, ý tưởng giống với [[Mạng bridge tự tạo trong Docker: container gọi nhau bằng tên nhờ DNS nội bộ]]: tên thay cho IP. Điểm khác là ở Kubernetes tên trỏ tới Service (địa chỉ ổn định, cân bằng tải qua nhiều Pod), không trỏ thẳng tới một container.

### Service headless

Nếu bạn đặt `clusterIP: None`, Service trở thành **headless**: không có địa chỉ ảo, và DNS trả về trực tiếp địa chỉ của từng Pod. Kiểu này dùng khi client cần tự biết từng Pod, ví dụ các ứng dụng có trạng thái chạy bằng StatefulSet.

## Kiểm tra

1. `kubectl -n demo get service web` thấy Service có `CLUSTER-IP`.
2. `kubectl -n demo get endpointslices` thấy địa chỉ các Pod.
3. Chạy Pod tạm và `nslookup web` trả về địa chỉ.
4. Với NodePort, gọi `curl http://192.0.2.10:30080` (thay bằng địa chỉ node của bạn).

## Lỗi hay gặp

- **Selector không khớp nhãn:** Service tồn tại nhưng không có endpoint. So lại `kubectl get pods --show-labels`.
- **Nhầm `port` và `targetPort`:** kết nối bị từ chối dù Pod chạy bình thường.
- **Pod chưa Ready:** Service chỉ gửi lưu lượng tới Pod đã sẵn sàng; kiểm tra readiness probe.
- **LoadBalancer ở trạng thái `<pending>`:** cụm không có thành phần cấp bộ cân bằng tải.
- **Gọi tên Service từ namespace khác mà thiếu phần namespace.**

## Tóm lại

Service biến một nhóm Pod luôn thay đổi thành một đích ổn định: ClusterIP cho trong cụm, NodePort để mở cổng trên node, LoadBalancer để nhờ hạ tầng cấp địa chỉ công khai. DNS của cụm cho phép gọi nhau bằng tên thay vì IP. Bài kế tiếp trong hành tinh này nói về việc đưa nhiều ứng dụng ra ngoài một cách gọn gàng hơn.

## Tham khảo

- [Service (tài liệu Kubernetes)](https://kubernetes.io/docs/concepts/services-networking/service/)
- [DNS cho Service và Pod](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
