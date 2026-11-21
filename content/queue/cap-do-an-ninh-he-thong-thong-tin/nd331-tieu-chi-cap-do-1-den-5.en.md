---
title: The five security levels under Decree 331/2026/NĐ-CP: criteria, personal-data thresholds and the highest-level rule
tags: security levels, decree 331, personal data, risk assessment, legal
type: note
---

> [!TLDR]
> - Decree 331/2026/NĐ-CP divides information systems into 5 levels (Articles 11 to 15), based on the kind of information, who the system serves and the consequences of an attack.
> - A system that meets the criteria of several levels takes the highest one; it may not be split in form to lower the level (Article 8).
> - For online services, the personal-data thresholds are: under 100,000 data subjects (basic data) or under 10,000 (sensitive data) means level 2; above them means level 3 or higher.

*This article explains the text as of November 2026 and is not legal advice for a specific case. Check the official text when applying it.*

## Introduction

Once you know what your system is and who its owner is (see [[Decree 331/2026/NĐ-CP at a glance: scope, who it applies to, system owners and operators]]), the next question is determining its level. Decree No. 331/2026/NĐ-CP, issued on 19 August 2026, devotes Chapter II (Articles 9 to 17) to this. The higher the level, the stricter the protection requirements and the more appraisal steps the dossier goes through.

## Two things to do before assigning a level

Article 9 requires classifying the information being processed into four groups: public information, private information, personal information and state secrets, and classifying the system by function. Article 10 covers cybersecurity risk management: the cases that require a risk assessment, what the assessment contains and how the results are used. According to official summaries, if the assessment shows a risk higher than the level already determined, the owner must propose a higher level.

## Describing each level

What follows is a short reading, not a replacement for the text.

- **Level 1 (Article 11):** systems serving internal needs and processing only public information.
- **Level 2 (Article 12):** internal systems with private or personal information but no state secrets; also some online services for citizens and businesses that are not in conditional business lines and are below the personal-data thresholds.
- **Level 3 (Article 13):** processing state secrets or serving defence and security to the extent that destruction could harm national security; services in conditional business lines; systems handling administrative procedures; services above the level 2 personal-data thresholds; industrial control systems for certain types of works.
- **Level 4 (Article 14):** serious harm to national security if destroyed; nationwide e-Government systems running continuously; control systems for grade I works.
- **Level 5 (Article 15):** especially serious harm; centralised storage of especially important data; international connectivity infrastructure; control of special-grade works. Level 5 systems are systems important to national security (Article 16 sets criteria for this group, and level 3 and 4 systems may also be added to the list).

## Personal-data thresholds for online services

For teams building online services, the personal-data threshold is the most practical criterion. According to summaries, a service that is not in a conditional business line is level 2 when it processes the personal data of fewer than 100,000 data subjects for basic data, or fewer than 10,000 data subjects for sensitive data. At or above those thresholds it is level 3.

Illustration (hypothetical): a small booking app has 8,000 users and stores only names and phone numbers. That is below the threshold for basic data. If users grow to 120,000, the decree requires the owner to reassess the risk, and if the threshold is crossed, to propose a higher level and redo the level dossier. So technical teams should track the number of data subjects as an operating metric, not remember it only when preparing the dossier.

## The highest-level rule and the ban on splitting to lower the level

Article 8 sets three principles: a system has one owner; a system meeting the criteria of several levels takes the highest; and the scope may not be defined in form only in order to lower the level. According to the Ministry of Public Security's summary, if the authorities find that systems were split or merged to lower the level or the requirements, the owner must redefine the system and its level.

Example: splitting the user database from the application into "two small systems" just so that each falls below a threshold goes against the spirit of Articles 7 and 8, because scope must follow business function and data flow.

## Levels and shared infrastructure

The decree encourages sharing resources to save cost. According to the summary, level 3 and 4 systems may share the physical infrastructure of a data centre or cloud if they are logically separated; level 5 may share only security tooling at the monitoring, detection, alerting and perimeter-protection layer, without access to business data. Article 30 also has special rules when renting a data centre or cloud for level 3 to 5 systems.

## Summary

- The five levels tie to the kind of information, who is served, and the consequences of an incident.
- Online services need to watch the thresholds of 100,000 and 10,000 personal-data subjects.
- Apply the highest level when several criteria are met, and do not split in form to lower the level.
- The next step is the dossier, appraisal and approval, covered in the next article in the series.

## References

- Decree No. 331/2026/NĐ-CP of 19 August 2026 of the Government (summary of the level criteria): https://bcy.gov.vn/van-ban-phap-luat/nghi-dinh-331-2026-nd-cp-tang-cuong-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-929291
- Ministry of Public Security, "New rules on cybersecurity protection for information systems": https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596
