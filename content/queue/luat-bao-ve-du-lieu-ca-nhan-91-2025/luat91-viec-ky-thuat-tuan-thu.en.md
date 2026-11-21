---
title: Technical measures for complying with Law 91/2025/QH15: classification, encryption, logging, deletion and breach notification
tags: compliance, encryption, access logs, data deletion, breach notification, law 91/2025
type: process
---

> [!TLDR]
> - The law does not mandate specific tools, but many articles translate into technical work: data classification, encryption, access control and monitoring, safe deletion, breach notification within 72 hours.
> - Encryption does not change the nature of personal data (Article 12); de-identification does, but re-identification is prohibited (Article 14).
> - This is a technical reading of the law, not legal advice; detailed requirements are in implementing documents.

This article explains legal text from a technical angle, as of November 2026, and is not legal advice for any specific case. It follows [[Impact assessments and cross-border transfers under Law 91/2025/QH15: when, what to file, and the deadlines]] and [[Personal Data Protection Law 91/2025/QH15: basic and sensitive data, data subject rights, controllers and processors]].

## Introduction

Law 91/2025/QH15 is written in legal language, but many articles can be "translated" into work for technical teams. Article 3, clause 4 states the principle of applying institutional, technical and human measures together; Article 37 requires the controller to apply suitable management and technical measures, reviewing and updating them when needed. Below are five groups of work, each tied to the relevant articles. The law does not name software or specific configurations; treat them as a checklist of suggestions, not mandatory requirements.

## 1. Data classification and flow mapping

To know which data is basic or sensitive (Article 2), and which is data of children, health, finance, location or biometrics (Articles 24 to 31 have specific rules), the first step is an **inventory**: which system stores which field, who accesses it, where it is sent. This also underpins the impact assessment dossiers and determines whether there is a cross-border transfer (for example using a platform located outside Vietnam, Article 20, clause 1).

A simple approach: label each column in the database schema (not personal data, basic, sensitive), keep the label table in the code repository next to the documentation, and update it when adding fields. The official lists of basic and sensitive data are issued by the Government, so compare against them instead of inferring your own.

## 2. Encryption and de-identification

Article 12 lets organizations decide on encryption and decryption suitable to their processing, and stresses that encrypted data is **still personal data**. Article 31, clause 4 sets specific requirements for biometric data: physical security of devices that store and transmit it, restricted access, and a monitoring system to prevent and detect violations. Article 30, clause 3 requires systems using big data, artificial intelligence, blockchain and cloud computing to integrate suitable security measures, use suitable authentication and identification, and apply access control.

General technical suggestions: encrypt in transit (TLS) and at rest, manage keys separately from the data, and limit who can read the keys. De-identification (Article 14, clause 6) requires tightly controlling the process and **no re-identification** afterwards unless the law allows it. So be careful when "anonymizing" by merely hashing a single field: if records can still be matched back to individuals, it is hard to say the data has been de-identified.

## 3. Access control and access logs

The law requires access control in Article 30, clause 3, restricted access to biometric data in Article 31, and monitoring systems to detect violations. Article 19, clause 2 requires supervision mechanisms for processing without consent: procedures, regular risk assessment, periodic checks, and a feedback channel. Article 37 requires blocking unauthorized collection from your own systems.

Technically: least privilege by role, multi-factor authentication for administrator accounts, and **access logs** recording who read, changed or exported personal data and when. These logs both help detect anomalies and serve as evidence when cooperating with the specialized agency. Note that logs may themselves contain personal data (IP addresses tied to accounts, emails), so they also need access control and a retention period.

## 4. Deleting and destroying data when the purpose ends

Article 14, clause 1 lists the cases for deletion and destruction: the data subject requests it (with exceptions), the processing purpose is completed, the legal retention period expires, a competent authority decides, or by agreement. Clause 3 requires deletion by safe measures that prevent unauthorized intrusion and recovery; clause 4 prohibits deliberately recovering deleted data without authorization. Specialized articles add milestones: data of unsuccessful job candidates must be deleted (Article 25), employee data is deleted when the contract ends unless agreed or provided otherwise, and recordings made in public places are kept only for the necessary time (Article 32).

The matching technical work: set a **retention period** for each type of data, run periodic deletion jobs, and remember that backups, copies in test environments and logs also hold data. Warning: bulk deletion commands or jobs cannot be undone; try them on a copy, check the filter conditions, and confirm the retention policy before running on a live system.

## 5. Detecting and reporting incidents

Article 23, clause 1: when a violation is found that could harm national defense, national security, social order and safety, or infringe the life, health, honor, dignity or property of data subjects, the controller (or controller-processor) and third parties must notify the specialized agency **no later than 72 hours after discovery**. A processor that discovers a violation promptly notifies the controller. The controller must draw up a record confirming the violation and cooperate in handling it; the content of the notice is set by the Government. In finance and banking specifically, organizations must notify data subjects when account information is leaked or lost (Article 27).

Technically: have an incident-response process with a named owner, record the "discovery" time, keep a record template ready, and have contracts with processors that require them to tell you in less than 72 hours. When your project belongs to an information system with a security level, also read [[The five security levels under Decree 331/2026/NĐ-CP: criteria, personal-data thresholds and the highest-level rule]] to see how the two frameworks relate.

## Verification

A simple self-check list:

- Is there an up-to-date personal data inventory and classification labels?
- Is data encrypted in transit and at rest, with keys managed separately?
- Is there least-privilege access and access logging, both with retention periods?
- Does each type of data have a retention period and a deletion job, including backups?
- Is there a 72-hour notification process and processor contracts that match that period?
- Is there a channel for data subject requests (view, correct, delete, withdraw consent)?

## Common mistakes

- Thinking encryption alone makes data "no longer personal data".
- Deleting from the main database but forgetting backups and test environments.
- Logging personal data without limiting access and retention.
- Not recording the time of discovery, so the 72-hour mark cannot be shown.

## Summary

The law sets goals and engineers choose the methods: classification, encryption, access control, logging, safe deletion and an incident process. Start with a data inventory, then check implementing documents for detailed requirements.

## References

- Personal Data Protection Law No. 91/2025/QH15 (PDF): https://static3.luatvietnam.vn/uploaded/others/2025/08/21/luat-91-2025-qh15_2108094941.pdf
- Introduction to Law 91/2025/QH15: https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-186-102925-article.html
