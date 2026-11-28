---
title: Turning trend signals into content and product decisions
tags: technology trends, technical content, product decisions, technical marketing
type: process
---

> [!TLDR]
> - A trend is only valuable when it leads to a concrete decision: what to write, what to support, what to build first.
> - A compact process: set the question, gather signals from several sources, rate their reliability, pick one small experiment, measure and review.
> - Do not chase whichever keyword is hot; ask what problems your readers actually face.

## Goal

After this article you will have a five-step process for turning trend data into decisions about technical content or a product, plus a log you can reuse. It assumes you already know the data sources and their limits; if not, read the article on reading survey data first.

## Preparation

- A clear decision question, for example: "This quarter, should we write a guide for tool A or tool B?" or "Should our library support language C?"
- A spreadsheet or notes file to store the source, year, link and the date you read it.
- Access to your own numbers (page reads, on-site searches, user questions), because your own data is often worth more than general trends.

## Steps

### Step 1: Write the decision question before looking for numbers

Without a question you will only collect interesting numbers. Write down: what the decision is, who the reader is, and what "right" means (for example: more readers finish the article, or more people try the product).

### Step 2: Gather signals from at least three types of source

Choose sources of different nature: a survey (what people say), activity data such as Octoverse or package downloads (what people do), and search data such as Google Trends (what people are curious about). Record each signal with its source, year and way of measuring. With npm, for example, you can fetch daily downloads to see the direction:

```bash
curl -s https://api.npmjs.org/downloads/range/last-month/express
```

Replace `express` with the package you care about. npm's documentation says these are day-by-day download counts; remember that a download is not necessarily a user.

### Step 3: Rate reliability

For each signal, quickly rate high, medium or low based on: is the origin clear, is the sample large enough, does it agree with other sources. For example, Google Trends only gives relative search interest, so if it is all you have, reliability is low to medium. When two sources of different kinds point the same way, raise the reliability.

### Step 4: Pick one small experiment

Instead of "investing heavily in the trend", choose something cheap and reversible: one guide, one sample project, one experimental section in the docs. Write the hypothesis: "If readers care about this topic, the article will get more complete reads and related questions than a typical article." This is how to test content before expanding; for measuring the effect of technical content, see [[Technical content as marketing: docs, blog posts, sample code, changelogs and how to measure results]].

### Step 5: Measure, review and record

Set a review date, for instance after one quarter. Record what you saw, even when the hypothesis was wrong. A compact log:

| Signal | Source, year | Reliability | Decision | Review date |
|---|---|---|---|---|
| (signal name) | (name, year) | high/medium/low | (what you will do) | (date) |

## Checking

Before locking in the decision, ask yourself:

- Do at least two sources of different kinds support it?
- Could my real readers have this problem, or do I only see it in the news?
- If this trend disappeared after six months, would my content still have value? Foundational content (principles, how to diagnose errors) usually lasts longer than content tied to one version.
- Does every number I quote have a source and a year?

## Common mistakes

- **Chasing the peak:** when you write after a topic has peaked, there are usually already many similar articles.
- **Confusing curiosity with need:** many searches do not mean many people will use or pay.
- **Using a single source:** each source has its own distortion, as the article on five public data sources explained.
- **Quoting unchecked figures:** if you cannot open the original report, do not use it.
- **Ignoring your own data:** user questions and on-site numbers often say more than any general trend.

If you build a product for engineers, put this result next to [[The developer funnel: from awareness to trial, integration and payment]] to see which signal affects which stage of the funnel.

## References

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Google Trends: how the data is normalised](https://support.google.com/trends/answer/4365533)
- [npm: download counts API documentation](https://github.com/npm/registry/blob/main/docs/download-counts.md)
