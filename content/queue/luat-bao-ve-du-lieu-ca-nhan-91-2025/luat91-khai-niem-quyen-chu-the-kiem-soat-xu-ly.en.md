---
title: Personal Data Protection Law 91/2025/QH15: basic and sensitive data, data subject rights, controllers and processors
tags: personal data protection, law 91/2025, data subject, data controller, data processor
type: note
---

> [!TLDR]
> - Law 91/2025/QH15 divides personal data into basic data and sensitive data; the detailed lists are issued by the Government.
> - Data subjects have six groups of rights in Article 4; consent is valid only when voluntary, informed and given per purpose (Article 9).
> - A controller decides purposes and means, a processor acts under a contract; their responsibilities differ (Article 37).

This article only explains the text of the law in plain language for technical readers, as of November 2026. It is not legal advice for any specific case; when applying it, check the official text and consult a qualified legal professional.

## Introduction

The Personal Data Protection Law No. 91/2025/QH15 was passed by the 15th National Assembly on 26 June 2025 and takes effect on 1 January 2026 (Article 38). It has 5 chapters and 39 articles. The Government issues implementing decrees, including Decree 356/2025/NĐ-CP; this article mentions the decree only in general terms and does not go into its article numbers.

For people working in infrastructure and software, three questions always come first: what counts as personal data, what rights people have over it, and what role your organization plays when processing it. The law answers them in Articles 2, 4, 9 and 37.

## Personal data, basic data and sensitive data

Article 2 defines personal data as digital data or information in other forms that identifies, or helps identify, a specific person. The law distinguishes two kinds:

- **Basic personal data**: reflects identity and common background, is frequently used in transactions and social relations, and belongs to a list issued by the Government.
- **Sensitive personal data**: tied to privacy, where a breach directly affects lawful rights and interests, also belonging to a list issued by the Government.

Two points matter to engineers. First, data that has been **de-identified** (altered or stripped so that it can no longer identify a specific person) is no longer personal data. Second, **encrypted data is still personal data** (Article 12): encryption is a protective measure, not a way out of the law. For example, a users table whose email column is encrypted at rest is still personal data, while a set of statistics with all identifiers removed and no way to trace back to individuals may have been de-identified.

The law also defines processing very broadly: collecting, analyzing, aggregating, encrypting, decrypting, editing, deleting, destroying, de-identifying, providing, publishing, transferring, and any other activity affecting the data. So even writing email addresses to logs or backing up a database counts as "processing".

## Rights and duties of the data subject

The data subject is the person the data reflects. Article 4 lists these rights:

1. To be informed about the processing of their data.
2. To consent or refuse, and to request withdrawal of consent.
3. To view, correct, or request correction of their data.
4. To request provision, deletion or restriction of processing, and to object to processing.
5. To complain, denounce, sue and claim compensation.
6. To ask competent authorities or relevant parties to take measures protecting their data.

Data subjects also have duties: protect their own data, respect others' data, provide complete and accurate information, and not obstruct the lawful duties of controllers or processors. When a controller receives a request to exercise these rights, it must act promptly within the time limits set by law; the specific periods are detailed by the Government (Article 4, clause 5).

Not every request must be granted. Articles 10 and 14 show that requests to withdraw consent, restrict processing or delete data do not apply in the cases of processing without consent under Article 19, and withdrawing consent does not affect processing that took place before the withdrawal.

## Consent: conditions for validity

Article 9 sets out the conditions for consent:

- It rests on voluntariness, and the person knows the types of data, the purposes, the controller (or controller-processor), and their own rights and duties.
- It is expressed in a clear, specific way that can be printed or copied as a document, including electronic form or a verifiable format.
- It is given **per purpose**, with no mandatory condition to also agree to other purposes.
- It remains valid until the data subject changes it, or as provided by law.
- Silence or no response is not consent.

For product builders this translates into concrete design requirements: no pre-ticked box bundling several purposes, keep evidence of consent (who, when, what), and make withdrawal as easy as giving consent.

Article 19 lists cases where processing is allowed without consent, for example protecting life in urgent situations, serving the activities of state agencies, or carrying out an agreement between the data subject and a relevant party as provided by law. When relying on these cases, an organization must set up supervision mechanisms: procedures, risk assessment, periodic checks and a channel for feedback.

## Controller, processor, and controller-processor

Article 2 distinguishes three roles:

- **Personal data controller**: decides the purposes and means of processing.
- **Personal data processor**: processes data at the request of the controller under a contract.
- **Controller-processor**: decides the purposes and means and also directly processes the data.

Article 37 sets out the matching responsibilities. A controller must state each party's responsibilities in contracts, set purposes and means in its agreements with data subjects, apply suitable management and technical measures, notify breaches under Article 23, choose a suitable processor, guarantee data subject rights, answer to data subjects for damage, and block unauthorized collection from its systems. A processor may receive data only after a contract exists, must process according to that contract, take full protective measures and answer to the controller. A controller-processor must meet both sets of responsibilities.

An illustration: an organization rents hosting to run its customer database. It decides what to collect and why, so it is the controller; the hosting provider only follows the contract, so it is the processor. The contract between them should spell out this division of responsibility.

## Prohibited acts

Article 7 prohibits, among other things, processing data contrary to law, buying or selling personal data (unless another law allows it), and seizing, deliberately leaking or losing data. Article 17 clarifies that transferring data in the cases the law allows, with or without a fee, is not regarded as buying or selling. On penalties, Article 8 sets the maximum fine for other violations at VND 3 billion for organizations, and an individual committing the same act faces at most half the organization's maximum; selling data and cross-border transfer have their own calculation.

## Summary

- Distinguish basic from sensitive data by the Government's lists; encryption does not stop data being personal data, while de-identification does.
- Data subjects have the rights in Article 4; consent must be voluntary, clear and per purpose.
- Determine whether your organization is a controller, a processor or both, then check the responsibilities in Article 37 and your contracts.

The next article in the series covers impact assessment dossiers and cross-border data transfer.

## References

- Personal Data Protection Law No. 91/2025/QH15 (PDF): https://static3.luatvietnam.vn/uploaded/others/2025/08/21/luat-91-2025-qh15_2108094941.pdf
- Introduction to Law 91/2025/QH15: https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-bao-ve-du-lieu-ca-nhan-2025-so-91-2025-qh15-186-102925-article.html
