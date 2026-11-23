---
title: The developer funnel: from awareness to trial, integration and payment
tags: technical marketing, developer funnel, onboarding, integration, API
type: note
---

> [!TLDR]
> - The developer funnel has four stages: awareness, trial, integration and payment; each stage needs a different kind of content.
> - The stage that most deserves attention is usually the move from trial to integration, where users really put the product into their systems.
> - Measure each stage with specific events, not one vague number.

## Introduction

A "funnel" describes a person's journey from not knowing a product to becoming a customer. For products aimed at developers, this journey has its own quirks: people try with code rather than with a sales call, and real value only shows once the product sits inside their system. This article splits the funnel into four stages, describes what users need at each stage and how to track it. It is a mental model, not a fixed formula, and the names of the stages can differ from place to place.

It follows the previous article in this series, which explained why engineers need to verify for themselves.

## Stage 1: awareness

At this stage an engineer meets the product's name for the first time, usually while looking for a way to solve a specific problem. They search for an error, read a technical article, see a library in someone else's repository or hear a colleague mention it.

What users need: a useful answer to the problem they have, not yet an introduction to a product. So effective content at this stage is usually an article explaining the problem, a how-to for fixing an error, or an honest comparison of approaches. The product appears as one option in the story, not the main character.

How to track: reads of content pages, traffic sources, the number of people arriving at the docs from search engines.

## Stage 2: trial

This stage begins when the reader decides "let's try it". They create an account, install a library or call the API for the first time. The job is to shorten the path to the first result: a quick-start guide, a trial key, runnable examples and understandable error messages.

A point that is often missed: an error in the very first run is when users are most likely to leave. An error message that states the cause and the fix has more marketing value than a glossy home page.

How to track: the number of accounts created, the share of people whose first call or command succeeds, and the time from account creation to that point.

## Stage 3: integration

A trial is only an experiment. Integration is when the product goes into real code and a real deployment process, usually with other team members involved. This stage needs things that introductory examples cannot answer:

- Complete reference documentation that states limits, quotas and error codes.
- Guides for real situations: authentication, error handling, retries, pagination, API versions.
- A compatibility policy: when the product changes and how. A clear versioning policy, for example following Semantic Versioning, tells integrators whether an upgrade could break their code.
- A changelog so they can keep up with releases.
- A support channel that can answer technical questions.

How to track: the number of projects calling the API steadily over several days, the number of distinct call types used, the number of people from the same organization taking part. These are better signals than a single login.

## Stage 4: payment

Users are ready to pay when they see the product is already in their system and leaving would cost effort. At this point you need transparency about pricing, quotas, how invoices are calculated and what happens when a quota is exceeded. A surprise at the billing step wrecks the trust built in earlier stages.

In many organizations the person who pays is not the engineer. Engineers need material to persuade the person approving the budget: a summary of value, expected cost, and commitments about availability and security.

How to track: the conversion rate from trial to paid, the time to convert, and the steps at which people stop.

## Reading the funnel without fooling yourself

A few notes to make the numbers useful:

- **Define events clearly.** Does "trial" mean creating an account, or making the first successful call? Each definition gives a different picture.
- **Measure the rate between adjacent stages** to see where people drop off, rather than only looking at the totals at the top and bottom.
- **Combine numbers with direct observation.** Ask a few people unfamiliar with the product to go through the whole journey and say aloud what they are thinking. Numbers tell you where people drop off, and observation tells you why.
- **Respect privacy.** Collect only the data you need, tell users clearly, and follow the data protection rules that apply.
- **Do not treat the funnel as a straight line.** People go back to the docs, pause and return months later, or jump straight into the integration stage when a colleague has already chosen the product.

## Common mistakes

- Pouring all the effort into the first stage (making many people aware) while the trial and integration stages leak.
- Measuring sign-ups as if they were success, even though most have never run a single command.
- Ignoring people who have already integrated: they need change notices, upgrade guides and steady support, which is also the best marketing content for the payment stage. How to turn those materials into a planned channel is covered in [[Technical content as marketing: docs, blog posts, sample code, changelogs and how to measure results]].

## Summary

The developer funnel is a chain of four stages: awareness, trial, integration, payment. Each stage answers a different question from the engineer and needs different content. Define the measured events for each stage, find the biggest drop-off, and fix exactly that spot instead of only pulling more people into the top of the funnel.

## References

- Semantic Versioning 2.0.0: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Diátaxis, a framework for technical documentation: https://diataxis.fr/
