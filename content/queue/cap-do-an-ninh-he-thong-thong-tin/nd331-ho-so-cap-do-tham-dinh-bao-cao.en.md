---
title: Level dossiers under Decree 331/2026/NĐ-CP: who appraises, who approves, processing times and periodic reports
tags: level dossier, appraisal, periodic reporting, decree 331, process
type: process
---

> [!TLDR]
> - The level proposal dossier has 5 groups of documents (Article 21); appraisal takes at most 15 working days for level 3 and 25 working days for levels 4 and 5 (Article 23).
> - Levels 1 to 3 are appraised by the owner's dedicated unit; levels 4 and 5 by the Ministry of Public Security leading the appraisal; the owner approves (Article 18).
> - There is an annual periodic report with data closed from 15 December of the previous year to 14 December (Article 35), and incident reporting within 24 and 72 hours (Article 31).

*This article explains the text as of November 2026 and is not legal advice for a specific case. Check the official text and the annexed templates when preparing a real dossier.*

## Introduction

Once you know the criteria for each level (see [[The five security levels under Decree 331/2026/NĐ-CP: criteria, personal-data thresholds and the highest-level rule]]), the next step is to turn that level into an approved dossier. Chapter III of Decree No. 331/2026/NĐ-CP (issued 19 August 2026) describes this in Articles 18 to 25. This article follows the practical order: prepare, submit, appraise, approve, then the reporting duties that follow.

## Preparation: risk assessment and building the dossier

The dossier starts from a cybersecurity risk assessment (Article 10). Article 21 says the level proposal dossier has five groups of documents: an overview of the system, the design, an explanation of the grounds for the proposed level, an explanation of the security plan, and expert opinion (required for levels 4 and 5). Article 22 sets out the content of the explanation: overview, the level proposal, the security plan, plus extra requirements for levels 4 and 5. Article 29 lists the content of the security plan, from design to decommissioning.

For a technical team the concrete work is usually: a system diagram and data flows, an asset inventory, the types of data processed, the number of data subjects, and the technical and management measures already in place. Keep these documents alive and update them together with the system.

## Two situations: a new project and a running system

Article 19 applies to new investment projects, expansion and upgrades, including rented services. Article 37 encourages approving the level dossier before approving the economic-technical report, basic design or equivalent, so that protection requirements are built into the design from the start. Article 20 sets the sequence for running systems: prepare the dossier, appraise, approve. Article 25 says that when the level must be redetermined (for example a change of function or scope, or crossing a data threshold), it follows the same sequence as the first time.

## Who appraises, who approves

Under Article 18 (cross-checked through public summaries):

- **Levels 1 and 2:** the owner's dedicated cybersecurity unit appraises and approves.
- **Level 3:** the dedicated unit appraises, the owner approves.
- **Level 4:** the Ministry of Public Security leads the appraisal, the owner approves.
- **Level 5:** the Ministry of Public Security leads the appraisal, the owner approves the security plan; the Prime Minister approves the list of systems important to national security (Article 17 covers the dossier for adding a system to that list).

For cipher systems, an official news item says the Government Cipher Committee appraises level 4 and 5 dossiers within its scope. Because details of authority depend on the situation in many places, always read Article 18 in the original text.

## Processing times

Articles 23 and 24 set time limits in working days:

1. Responding to an invalid dossier: at most 5 working days.
2. Appraisal: at most 15 working days for level 3; at most 25 working days for levels 4 and 5.
3. Processing the approval dossier: at most 7 working days.

When planning a project, add these limits to the schedule, on top of the time to prepare and revise the dossier.

## Duties after approval

**Incident reporting.** Article 31 sets the owner's responsibilities, including incident reporting: a report on the cause, impact and remedial measures within 72 hours, and an initial notice within 24 hours for serious incidents. To do that, the operations team must be able to search logs quickly; see how to filter by service and time in [[journalctl: filtering logs by service and by time on Ubuntu 24.04]].

**Periodic reporting.** Articles 35 and 36 set annual and ad hoc reports. Annual data is closed from 15 December of the previous year to 14 December of the reporting year; the content has 12 groups of information, such as the list of systems, levels, approval status, inspections and compliance with the security plan. Check the original text for the exact submission deadlines.

**Inspection.** Chapter IV (Articles 26 and 27) allows the dedicated force of the Ministry of Public Security to inspect, including assessing compliance and scanning for vulnerabilities and penetration testing.

## Common mistakes

- Doing the dossier once and leaving it; the system changes function or gains users without the level being redetermined.
- Describing the scope by organisation chart instead of data flow.
- Leaving appraisal time out of the project schedule.
- Not preparing logs and procedures in advance for incidents that must be reported within 24 and 72 hours.

## Summary

The process is: risk assessment, a dossier of five groups of documents, appraisal by the authority in Article 18, approval, then upkeep through periodic and incident reports. Understanding this path helps technical teams prepare data ahead of time instead of chasing deadlines.

## References

- Decree No. 331/2026/NĐ-CP of 19 August 2026 of the Government (summary on the Government Cipher Committee site): https://bcy.gov.vn/van-ban-phap-luat/nghi-dinh-331-2026-nd-cp-tang-cuong-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-929291
- Ministry of Public Security, "New rules on cybersecurity protection for information systems": https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596
