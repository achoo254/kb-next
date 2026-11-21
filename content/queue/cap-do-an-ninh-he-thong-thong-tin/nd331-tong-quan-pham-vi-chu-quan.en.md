---
title: Decree 331/2026/NĐ-CP at a glance: scope, who it applies to, system owners and operators
tags: cybersecurity, decree 331, security levels, system owner, legal
type: note
---

> [!TLDR]
> - Decree 331/2026/NĐ-CP (issued 19 August 2026) sets out detailed rules for protecting information systems by security level.
> - Every system has exactly one system owner and an operating unit; the two roles carry different responsibilities.
> - A system's scope is defined by business function and data flow, not by an organisation chart.

*This article explains the text as of November 2026. It is not legal advice for any specific case; when applying it, check the official text and ask your security unit or a lawyer.*

## Introduction

If you work in infrastructure or software development in Vietnam, sooner or later you will hear the question: "What level is this system?" Since 2026 the answer rests on Decree No. 331/2026/NĐ-CP of the Government, issued on 19 August 2026, "on cybersecurity protection for information systems". The decree is based on the Law on Cybersecurity No. 116/2025/QH15 and takes effect on the date of issue (Article 38).

This article is an overview for readers who are not lawyers. The next two articles in the series go deeper into the level criteria and the dossier procedure.

## What the decree covers

Under Article 1, the decree gives detail on several clauses of the Law on Cybersecurity: the cybersecurity levels of information systems, authority, sequence and procedures for determining a level, the duty to ensure cybersecurity, and inspection. Article 2 applies it to organisations and individuals involved in building or operating information systems in Vietnam; others are encouraged to apply it voluntarily.

For an easy mental map, think of six chapters:

- Chapter I: general provisions (Articles 1 to 8), including definitions, system owner, operating unit and principles.
- Chapter II: criteria for levels 1 to 5 and for systems important to national security (Articles 9 to 17).
- Chapter III: authority, sequence and procedures for appraisal and approval (Articles 18 to 25).
- Chapter IV: cybersecurity inspection (Articles 26 and 27).
- Chapter V: tasks, measures and responsibilities (Articles 28 to 34).
- Chapter VI: implementation, including reporting, effect and transition (Articles 35 to 40), with annexed templates.

## The system owner

Article 4 says who the system owner is. Depending on the system, it may be a ministry, a ministerial-level agency, a provincial People's Committee, the investment decision-maker, or another enterprise or organisation that owns the system. The owner may delegate in writing under clause 3 of that article.

Remember: each system has only one owner (Article 8). The owner carries the main responsibility: the head of the organisation answers before the law, assigns dedicated security staff suited to the system, approves the level dossier at the levels within its authority, and reports incidents (Article 31).

## The operating unit

Article 5 defines the operating unit as the party that directly operates the system, including cases where the owner rents IT services. A simple example: an agency is the owner of a service portal, while a technical team (in-house or outsourced) that handles servers, patches and daily monitoring is the operating unit. The operating unit's own responsibilities are in Article 33; those of the dedicated cybersecurity unit are in Article 32. For a technical team this means that daily work such as patching, backups and logging must have a clear owner rather than sit in a zone where nobody is responsible.

## Principles and defining the system's scope

Article 6 sets out the principles of cybersecurity by level, including continuity, sharing of resources and priority for higher-level systems. Article 7 explains how to define "one information system": by business function, data flow and the degree of dependence between components, not by the organisation's administrative structure.

Example: a web application, its database and background services that serve one business function are usually considered as one system, even if different departments manage them. Splitting only to reach a lower level is not accepted; we return to this point in the next article.

## Effect and transition

The decree takes effect on 19 August 2026. Article 39 contains transitional rules referring to Decree No. 85/2016/NĐ-CP, the earlier decree on information system security by level: projects already under investment before 1 July 2026 must complete appraisal under Decree 85/2016/NĐ-CP within six months, then meet the level-based protection requirements within twelve months from when the Law on Cybersecurity takes effect. Teams with legacy systems should read this article carefully together with their legal department.

## Summary

- Decree 331/2026/NĐ-CP is the central guiding text on cybersecurity levels of information systems.
- A system has one owner; the operating unit may be in-house or outsourced, but the owner's responsibility does not go away.
- Scope follows function and data flow; the next step is determining the level.

## References

- Decree No. 331/2026/NĐ-CP of 19 August 2026 of the Government on cybersecurity protection for information systems, summary on the Government Cipher Committee site: https://bcy.gov.vn/van-ban-phap-luat/nghi-dinh-331-2026-nd-cp-tang-cuong-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-929291
- Ministry of Public Security, "New rules on cybersecurity protection for information systems": https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596
