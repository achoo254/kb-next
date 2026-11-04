# 17-09 · Kiến trúc cụm lab Kubernetes

Ba máy ảo Ubuntu chạy một cụm Kubernetes thật tên `dattqh-cloud`, dựng bằng `kubeadm` theo tài liệu chính thức của khoá ngày 17.09.2026. Trang này ghi lại cái gì chạy ở đâu — số liệu đọc trực tiếp từ cụm ngày 17.09.2026, không phải sơ đồ mẫu, và chỉ vào được khi bật VPN lab. Các lệnh dựng cụm nằm ở [[17-09 · Dựng cụm Kubernetes từng bước]].

## Thông số cụm

| Hạng mục | Giá trị |
| --- | --- |
| Kubernetes | v1.31.14 |
| Container runtime | containerd 2.3.3 |
| Mạng cho Pod | flannel v0.28.9 |
| Định tuyến Service | kube-proxy · iptables |
| Quy mô | 3 node · 2 vCPU · 3.9 GiB |
| Hệ điều hành | Ubuntu 22.04.2 |

## Ba mặt phẳng địa chỉ

Trong cụm có ba loại địa chỉ và chỉ **một loại là thật**; hai loại còn lại do phần mềm dựng ra, chỉ tồn tại bên trong cụm — đứng ngoài ping không bao giờ thấy. Vì sao cần ba dải và chúng phải tách nhau thế nào: xem [[Kubernetes: khái niệm và mô hình cụm lab]].

| Dải | Loại | Ai dựng | Trên cụm lab |
| --- | --- | --- | --- |
| `192.168.122.0/24` | Thật — mạng node | Card mạng `ens160` của từng máy ảo | Đường SSH, đường các node nói chuyện với nhau, dải duy nhất ra được Internet; toàn bộ traffic Kubernetes chạy trên dải này. `.182` control plane, `.183` worker, `.184` worker, `.185` máy log |
| `10.244.0.0/16` | Ảo — dải Pod | flannel | Mỗi node giữ một khúc: `10.244.0.0/24` → cloud-1, `10.244.1.0/24` → cloud-2, `10.244.2.0/24` → cloud-3 |
| `10.96.0.0/12` | Ảo — dải Service | kube-proxy | `10.96.0.1` API server, `10.96.0.10` DNS nội bộ, `10.102.109.34` hello-app |
| `192.168.123.0/24` · `192.168.124.0/24` | Để trống — dự phòng | Card `ens224`, `ens192` | Có để khớp mô hình ba dải của tài liệu; tách biệt hoàn toàn, không có gateway, hiện **không chở traffic nào** của Kubernetes |

Vài điều rút ra từ bảng:

- Vì mỗi node giữ một khúc dải Pod, nhìn IP là đoán ra Pod nằm ở máy nào. Pod ở hai máy khác nhau vẫn gọi thẳng được nhau vì flannel đóng gói gói tin rồi gửi qua mạng node.
- IP Service không nằm trên card mạng nào, nó chỉ là luật trong bảng iptables của từng node. Pod đổi IP mỗi lần sinh lại nên không ai gọi thẳng IP Pod — gọi vào IP Service, kube-proxy tự lái sang một Pod còn sống.

## Máy nào chạy gì

Bốn tiến trình sau có mặt trên mọi node:

| Tiến trình | Cổng / vai trò |
| --- | --- |
| kubelet | 10250 |
| kube-proxy | 10256 |
| containerd | CRI |
| flannel | VXLAN |

Riêng máy điều khiển gánh thêm bốn thành phần "bộ não" của cụm:

| Máy | Địa chỉ | Vai trò | Thành phần riêng | Pod đang chạy | Khúc dải Pod |
| --- | --- | --- | --- | --- | --- |
| dattqh-cloud-1 | `<ADDR-1>` | Máy điều khiển | kube-apiserver:6443, etcd:2379–2380, kube-scheduler:10259, kube-controller-manager:10257 | coredns ×2 (10.244.0.2–3) | — |
| dattqh-cloud-2 | `<ADDR-3>` | Máy chạy ứng dụng | — | hello-app `10.244.1.7` | `10.244.1.0/24` · 254 địa chỉ |
| dattqh-cloud-3 | `<ADDR-4>` | Máy chạy ứng dụng | — | hello-app `10.244.2.8` | `10.244.2.0/24` · 254 địa chỉ |
| dattqh-victoria-lab | `<ADDR-5>` | Ngoài cụm · máy thu log | Chạy bằng Docker: VictoriaLogs 1.52.0:9428, Vector 0.57.0:9514/udp | — | — |

- `dattqh-cloud-1` được đánh dấu `NoSchedule` — máy này giữ bộ não nên cụm không xếp việc thường lên đây. Taint control plane hoạt động thế nào: xem [[Tạo và quản lý Pod]].
- `dattqh-victoria-lab` **không** thuộc cụm Kubernetes. Nó đang thu lệnh gõ trên 4 máy, giữ 365 ngày, và đứng riêng để nếu cụm hỏng thì log vẫn còn đọc được.

## Một lần mở trang web đi qua đâu

Mở `http://<ADDR-1>:<PORT>` từ máy dev. Sáu chặng dưới đây là đường đi thật của gói tin.

| Chặng | Việc xảy ra | Địa chỉ |
| --- | --- | --- |
| 1. Máy dev qua đường hầm VPN | Không bật VPN thì không có đường nào vào dải lab, mọi lệnh treo im | `utun4 → 192.168.122.0/24` |
| 2. Gõ cửa một node bất kỳ | Cổng 30001 mở trên *cả ba* node — kể cả node không chạy Pod nào của ứng dụng | `<ADDR-1>:<PORT>` |
| 3. kube-proxy đổi địa chỉ đích | Luật iptables trên node đổi đích từ cổng 30001 sang IP Service của ứng dụng | `→ 10.102.109.34:8080` |
| 4. Chọn ngẫu nhiên một Pod còn sống | Chọn theo từng kết nối chứ không luân phiên đều; đo 20 lần gọi cho ra tỉ lệ 12/8 giữa hai Pod | `10.244.1.7:8080` hoặc `10.244.2.8:8080` |
| 5. Pod ở máy khác thì flannel chuyển tiếp | flannel bọc gói tin rồi gửi qua mạng node sang máy đích, mở ra và giao cho Pod | VXLAN qua `192.168.122.0/24` |
| 6. Container trả lời | Trang in ra tên Pod đã phục vụ — gọi lại vài lần sẽ thấy tên đổi, đó là bằng chứng có hai bản sao | `Hello, world! Hostname: hello-app-7d9f89775b-…` |

Vì sao kube-proxy chia kết nối ngẫu nhiên chứ không đều, và cần đo bao nhiêu mẫu mới kết luận được: xem [[Tạo và quản lý Pod]].

## Từ máy dev chạm được tới đâu

Đo trên máy Mac khi đang bật VPN lab.

| Đích | Cổng | Kết quả | Vì sao |
| --- | --- | --- | --- |
| `<ADDR-1>` | 6443 | Tới được | API server — cài `kubectl` là điều khiển cụm từ máy dev được |
| `<ADDR-6>x` | 30001 | Tới được | Cổng ứng dụng, mở trên cả ba node |
| `<ADDR-6>x` | 10250 | Tới được | kubelet nghe trên mọi card mạng |
| `10.96.0.0/12` | — | Không tới | Dải Service là luật iptables trong cụm, không có đường ra ngoài |
| `10.244.0.0/16` | — | Không tới | Dải Pod chỉ tồn tại giữa các node — muốn chạm phải mở đường hầm SSH |

## Docker vẫn chạy song song trên cả ba node

Cụm không gỡ Docker vì các bài thực hành trước còn dùng. Docker đặt luật tường lửa mặc định là **chặn mọi gói tin chuyển tiếp**, nhưng mạng Pod vẫn sống vì flannel và kube-proxy mỗi bên tự chèn luật cho phép của mình vào trước — cơ chế chi tiết ở [[Dựng cụm Kubernetes bằng kubeadm]].

Đo thật: Pod ở máy này gọi Pod ở máy kia trả về sau `0.0013s`. Hệ quả cần nhớ — **đừng xoá sạch bảng iptables trên ba máy này**, làm thế là đứt cả mạng Pod lẫn Service.
