---
title: Scoring the Cybersecurity Assurance Index: Levels 0 to 3, the aggregation formula and four rating levels
tags: cybersecurity, cybersecurity index, scoring, rating, decision 1964
type: note
---

> [!TLDR]
> - Each assessment item is scored from Level 0 to Level 3, taking the highest level reached, and every level needs an explanation and evidence.
> - An organization's score is aggregated by system level (coefficients 1 to 5) and multiplied by a scale coefficient K (1.0, 1.05, 1.10).
> - There are 4 organization rating levels: Level 1 from 1.4 points, Level 2 from 2.1, Level 3 from 2.7 plus a condition on systems below Level 2.

*This article only explains the document and is not legal advice for any specific case. Content is current as of November 2026.*

## Introduction

Once you know which groups of criteria the Index has (see the overview article earlier in this planet), the next question is how the score is calculated. Annex III of Decision 1964/QĐ-TTg (12 October 2026) explains how to score **each information system**, and Annex IV explains how to combine scores for the **organization**. This article walks through both, with an invented numeric example for illustration.

## Scoring one system: Level 0 to Level 3

The system owner assesses each *assessment item* in Annexes V, VI and VII on four levels, from Level 0 to Level 3, and **takes the score of the highest level the system meets**. The example in the document itself: an item that meets Level 3 (that is, it already meets Level 1 and Level 2) gets 3 points.

The three levels above Level 0 mean the following (paraphrased, not quoted):

- **Level 1: there is a rule and it is followed.** If the item requires a procedure or rule, that document must be signed by a competent authority and still be in force.
- **Level 2: it is measured.** There are indicators of effectiveness and efficiency; a mechanism to collect, store and update data; periodic assessment on that data to see how far goals are met; and a system or software that stores, summarizes and retrieves the data.
- **Level 3: it is improved.** The measurement results have been used to find weaknesses, causes and improvement opportunities; improvement measures have been designed and carried out; there are reports of assessment, proposals and follow-up of the work.

The most important rule for practitioners: **without an explanation or supporting documents and evidence, that level is not recognized**. A level lacking evidence counts as not achieved.

Group I has a feature of its own: its two criteria have only the top and bottom of the scale. For example, "the system has been classified and approved at a level" is either not done (Level 0) or done (Level 3).

## Combining into the organization's score

Annex IV describes six steps. In summary:

### Steps 1 and 2: collect score sheets, compute each criterion

The organization collects the assessment sheet of every system, then computes the average score of each Group I and Group II criterion as a weighted average:

X_TC = (Σ wᵢ·Xᵢ) / (Σ wᵢ)

Here Xᵢ is the criterion score of system i, and **wᵢ is a coefficient by level**: level 1 is 1, level 2 is 2, level 3 is 3, level 4 is 4, level 5 is 5. If the criterion does not apply to a system, that system's wᵢ is 0. So more important systems have a bigger say in the overall score.

*Illustrative example (assumed numbers).* An organization has two systems: A at level 1 scores 3 on criterion I.1, and B at level 3 scores 0. The criterion average is (1×3 + 3×0) / (1+3) = 0.75. A large system without a level dossier pulls the score down more than a small system doing well.

For Group III, the organization only collects statistics. The document gives a special instruction: for values expressed as a percentage, add up the raw figures of all systems first and only then compute the percentage, rather than averaging percentages.

### Step 3: score by group

The score of Group I and Group II is the weighted average of the criteria in the group, using the weights in the Annex II table. A criterion that does not apply has weight 0; if every criterion of a group is not applicable, the whole group is not counted.

### Step 4: scale coefficient K

Compute S as the sum of the coefficients wᵢ of all the organization's systems. The scale coefficient K is taken from the table:

| S | K |
|---|---|
| below 300 | 1.0 |
| from 300 to below 500 | 1.05 |
| 500 or more | 1.10 |

An organization that manages many systems, especially high-level ones, thus gets a small extra multiplier.

### Step 5: overall score

X_TH = K × (a_I·X_I + a_II·X_II) / (a_I + a_II)

Here a_I and a_II are the weights of the two groups (the Annex II table gives 20% for Group I and 80% for Group II); a group that does not apply has weight 0.

*Illustrative example (assumed numbers).* If X_I = 2.5, X_II = 2.0 and K = 1.0, then with weights 20 and 80: (20×2.5 + 80×2.0) / 100 = 2.1. That is exactly the score threshold for Level 2.

### Step 6: four rating levels

The organization is placed at the highest level it reaches:

- **Level 0:** does not reach Level 1.
- **Level 1:** overall score of 1.4 or more and no information system at Level 0 (as the table is worded).
- **Level 2:** has reached Level 1 and an overall score of 2.1 or more.
- **Level 3:** has reached Level 2, an overall score of 2.7 or more, and no more than 10% of systems below Level 2. For those weaker systems, the organization must apply suitable risk management measures, for example separating them with security devices or isolating them completely at the physical level, to limit the effect on other systems.

The last condition shows the spirit of the Index: not just a nice average, but no "weak link" dragging everything down.

## Summary

- Score at the highest level reached, and every level needs an explanation and evidence; Level 1 is having a rule, Level 2 is measuring, Level 3 is improving.
- The organization's score is a weighted average by system level, multiplied by the scale coefficient K.
- The rating thresholds are 1.4, 2.1 and 2.7, plus a condition on weak systems. How to prepare evidence is discussed next in [[Preparing evidence for a self-assessment under the Cybersecurity Assurance Index: a backup example and Group III figures]].

## References

- Decision No. 1964/QĐ-TTg of 12 October 2026 of the Prime Minister, Annexes III and IV (official PDF): https://bcp.cdnchinhphu.vn/334894974524682240/2026/10/12/1964-qd-ttg-12102026-signed-1791798586779365358593.pdf
- Government web portal: https://chinhphu.vn
