---
title: Technical content as marketing: docs, blog posts, sample code, changelogs and how to measure results
tags: technical marketing, documentation, changelog, sample code, measurement
type: process
---

> [!TLDR]
> - Documentation, technical blog posts, sample code and changelogs are all marketing content if they help engineers get real work done.
> - Each type serves a stage of the developer funnel and needs its own measure.
> - Measure meaningful behavior (running an example, calling the API again) rather than raw page views.

## Goal

After this article you will know how to use four types of technical content as a planned marketing channel, and how to measure whether they work without making up numbers. It follows the previous article in this series.

## Preparation

- Identify your main audience (backend engineers, operations people or data practitioners) and the job they are trying to do.
- Pick a few measurable events in the product, for example "create an API key", "first call succeeds", "call the API on 7 consecutive days".
- Have an analytics tool that respects privacy, and know the data policy that applies to your users.

## Steps

### Step 1: documentation as the foundation

Documentation is the most durable content because it is read again and again. Separate pages by purpose (getting started, task guides, reference, explanation) as the Diátaxis framework describes. Each page should state the version it applies to and link to a sensible next page.

Suggested measures: the number of readers who read the docs and then perform the matching product event, internal search terms that return no results (where the docs are missing something), and "was this page helpful?" feedback.

### Step 2: technical blog posts for the awareness stage

A good blog post answers a specific question that engineers really search for: how to diagnose an error, how to compare two designs, how to migrate from an older tool. It must be useful even if the reader has never used your product. The product appears only when truly relevant, and the post also covers cases where the product is not a fit.

What to avoid: thin "informational" posts written only to catch search traffic, statistics with no clear source, and one-sided comparisons with competitors. Engineers spot these very quickly.

Suggested measures: reads through to the end of the post, readers clicking on to the docs or the getting-started page, return visits.

### Step 3: sample code as a bridge to integration

A sample code repository is the shortest way to turn interest into integration. A good one:

- has a README stating requirements, run commands and the expected output;
- pins dependency versions and runs in an automated test pipeline, so it does not break silently when the product changes;
- contains no real keys or addresses, only placeholder values such as example.com;
- has a clear license so people feel safe copying it.

Suggested measures: the number of copies or forks, the number of new API keys created from the page that holds the sample code, and repeated support questions about the same example (a sign it needs fixing).

### Step 4: a changelog to keep trust after integration

A changelog is underrated marketing content. People who have integrated read it to learn whether a new version will break their code, and to see that the product is being looked after. Keep a Changelog recommends: each release has its own section, newest on top, dates in year-month-day format, and changes grouped into types such as Added, Changed, Deprecated, Removed, Fixed and Security. Combine this with Semantic Versioning (MAJOR.MINOR.PATCH) so readers know that seeing a "MAJOR" bump means to be careful.

You can automate part of this: many platforms generate release notes from merged pull requests, for example GitHub's automatically generated release notes. Still, edit the result so readers understand the impact on them, instead of just listing commit titles. The packaging and release step usually lives in a release pipeline; see [[What stages make up a CI/CD pipeline: build, test, deploy, artifacts and cache]].

Suggested measures: the number of people who upgrade after each release, and the number of support questions about surprising changes.

### Step 5: measuring results without fooling yourself

- Tie each piece of content to one funnel stage and one target event, instead of looking at total views.
- Use tracking parameters in links (for example UTM parameters) to learn where users come from, if your privacy policy allows it.
- For sample code on GitHub, the repository traffic API reports views and clones for roughly the last 14 days (it needs write access to the repository). For a longer view, store the numbers periodically.
- Do not credit everything to the last piece of content: users often read several pieces before acting. Ask new sign-ups "how did you hear about us?" to complement the numbers.
- When you cite industry figures, use only public surveys with a named source and year; if there is none, do not state a number.

## Verification

After one quarter, ask yourself:

1. For each funnel stage, is there at least one piece of content that serves it?
2. Did any content lead to a significant product event, and which content led to nothing?
3. Do the sample code and docs still work with the current version?
4. What is the most repeated support question, and does documentation already answer it?

## Common mistakes

- Writing blog posts just "to have content", without a specific audience and question.
- Letting sample code and error screenshots go stale after a few releases.
- Writing only "bug fixes and performance improvements" in the changelog, saying nothing useful to the reader.
- Measuring views and declaring success, when no one takes the next step.

## Summary

Documentation, technical blog posts, sample code and changelogs are four marketing channels that suit engineers, because they give them evidence instead of promises. Tie each type to a funnel stage and a measurable event, keep them accurate for the current version, and read the numbers with care.

## References

- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- Semantic Versioning 2.0.0: https://semver.org/
- Diátaxis, a framework for technical documentation: https://diataxis.fr/
- GitHub Docs, automatically generated release notes: https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
- GitHub Docs, REST API for repository traffic metrics: https://docs.github.com/en/rest/metrics/traffic
- Write the Docs, documentation writing guide: https://www.writethedocs.org/guide/
