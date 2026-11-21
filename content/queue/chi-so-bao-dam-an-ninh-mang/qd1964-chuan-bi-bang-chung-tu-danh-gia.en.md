---
title: Preparing evidence for a self-assessment under the Cybersecurity Assurance Index: a backup example and Group III figures
tags: cybersecurity, evidence, self-assessment, backup, TCVN 14423
type: process
---

> [!TLDR]
> - Every score level needs an explanation and evidence; preparing records per assessment item makes scoring much easier.
> - The backup and recovery criterion (II.11) is a good example: a signed policy, automatic backups, protected copies, storage on separate infrastructure.
> - Group III is not scored but needs accurate statistics, never lower than the figures recorded by the competent authorities.

*This article only explains the document and is not legal advice for any specific case. Content is current as of November 2026.*

## Goal

After this article you will know how to turn one criterion of the Cybersecurity Assurance Index (Decision 1964/QĐ-TTg, 12 October 2026) into a concrete list of records you need, and understand what Group III figures to collect. The content follows Annexes III, VI and VII. To understand scoring and rating first, read the article on scoring and rating levels that comes just before this one.

## Preparation

- The list of your information systems and the approved level of each (Group II applies only to systems at level 3 or higher).
- The assessment tables in Annexes V, VI and VII of the decision. Each row has: the assessment item, descriptions of Level 0 to Level 3, and an "evidence" column suggesting which documents to submit.
- One person responsible for collecting evidence for each criterion, and one place to store documents with version control.
- Note: Annex I takes the standard TCVN 14423:2026 as the central basis of the Index, so the requirements in the tables often coincide with the measures that standard requires.

## Steps

### Step 1: read the required level and turn it into "documents needed"

For each assessment item, read the Level 1, Level 2, Level 3 columns and the evidence column. The general rule of Annex III: with no explanation or supporting document for a level, that level is not recognized; a procedure or rule at Level 1 must be signed by a competent authority and still be in force.

### Step 2: build the records for each level

Take the criterion **II.11 Data backup and recovery** (weight 10 in Group II). The Annex VI table splits it into four objectives:

1. **A backup and recovery policy exists.** At Level 1, the issued policy must state at minimum: the types of data to back up (such as system configuration files, server operating system backups, databases, data and business information), the frequency, the method, how the backup storage area is managed to keep integrity, and periodic test restores to check that the backups are usable. Level 3 adds reviewing and updating the policy at least once a year or when the organization changes.
2. **Automatic backup.** There is a list of data to back up with frequency by day, week, month or year, and an automatic backup solution or an equivalent measure. Suggested evidence is the data list, the deployment plan or the backup rule set.
3. **Protecting backups.** Level 1 requires applying the 3-2-1 backup rule or an equivalent measure, and encrypting important backups.
4. **Separate storage infrastructure.** Backups are identified, versioned and stored on infrastructure separate from the production environment.

For most items, Level 2 is "Level 1 plus a mechanism to measure and assess effectiveness" and Level 3 is "Level 2 plus a mechanism for continuous improvement". For backup, Level 2 evidence could be a periodic report on backup success rate and test-restore time; Level 3 evidence is review minutes and the changes made afterward. This is the article's suggestion to help you picture it, not a mandatory list from the document.

### Step 3: prepare Group III figures

Group III has 9 statistical criteria for direction and management, not counted in the score. Annex VII divides them into "positive" criteria (higher is better, such as the rate of risk-treatment measures done on time and the rate of incidents handled in time) and "negative" criteria (lower is better, such as the number of serious incidents, the number of leaked personal-data records, and the gigabytes of data leaked, lost or encrypted). For the first two percentages, the formula is 100 times the number achieved divided by the total.

The document has two constraints to remember: figures are based on the system owner's statistics but **must not be lower than the figures recorded by the competent authorities** (for the criteria about incidents and leaks), and when combining several systems you add the raw figures first and only then compute the percentage. So keep a complete incident log with detection and handling times, rather than reconstructing it from memory at the end of the period.

### Step 4: self-score and cross-check

Score at the highest level that has full evidence, then have someone who did not prepare the records read it again: every score must trace to a specific document.

## Verification

- Each assessment item has a cell recording the self-scored level, the evidence document name, the signer and the effective date.
- All Level 1 policies are signed and still in force.
- For Level 2 and above there is real data per period, not empty tables.
- Group III figures match the incident log and are not lower than externally recorded figures.
- Every system at level 3 or higher has full evidence for Group II.

## Common mistakes

- **A policy exists but is unsigned or expired.** Then Level 1 is not recognized.
- **Backups exist but a restore was never tested.** The backup policy requirements include periodic test restores, so this is a common gap.
- **Self-declaration without evidence.** Annex I says clearly that formal assessment or self-declaration without grounds should be limited.
- **Averaging percentages** of each system instead of adding raw figures in Group III.
- **Copying the old score sheet into the new period** without review: the Level 3 criterion requires reviewing the policy at least every year.

## References

- Decision No. 1964/QĐ-TTg of 12 October 2026 of the Prime Minister, Annexes I, III, VI and VII (official PDF): https://bcp.cdnchinhphu.vn/334894974524682240/2026/10/12/1964-qd-ttg-12102026-signed-1791798586779365358593.pdf
- Government web portal: https://chinhphu.vn
