---
title: "KB: panel AI tràn khỏi viền ở Universe"
date: 2026-11-09
summary: "Panel AI cao cố định 630px nhưng phần giới thiệu (12 Space, tên dài, 3 nguồn) không cuộn, nên nguồn tràn khỏi viền và ô hỏi bị cắt ở đáy màn hình. Sửa: phần giữa panel cuộn bên trong (class universe-ai-body dùng chung cho intro và thread), ô hỏi luôn ở đáy panel. Thêm e2e wide-layout kiểm ô hỏi nằm trong viền (fail trên code cũ: 777 > 712). Parity C09 lệch 4,16% vì board vẽ ô hỏi treo ngoài viền; nâng ngưỡng lên 4,5% và ghi vào docs/mock-deviations.md."
---

# KB: panel AI tràn khỏi viền ở Universe

Panel AI cao cố định 630px nhưng phần giới thiệu (12 Space, tên dài, 3 nguồn) không cuộn, nên nguồn tràn khỏi viền và ô hỏi bị cắt ở đáy màn hình. Sửa: phần giữa panel cuộn bên trong (class universe-ai-body dùng chung cho intro và thread), ô hỏi luôn ở đáy panel. Thêm e2e wide-layout kiểm ô hỏi nằm trong viền (fail trên code cũ: 777 > 712). Parity C09 lệch 4,16% vì board vẽ ô hỏi treo ngoài viền; nâng ngưỡng lên 4,5% và ghi vào docs/mock-deviations.md.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
