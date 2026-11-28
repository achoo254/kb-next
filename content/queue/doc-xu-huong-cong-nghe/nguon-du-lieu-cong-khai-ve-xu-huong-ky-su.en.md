---
title: Five public data sources for seeing what engineers care about
tags: technology trends, surveys, Octoverse, Google Trends, npm
type: note
---

> [!TLDR]
> - Each trend data source answers a different question: surveys ask "what do you say", activity data shows "what do you do", and search shows "what are you curious about".
> - Five easy-to-reach sources: the Stack Overflow Developer Survey, GitHub Octoverse, Google Trends, package download statistics (npm) and the CNCF Annual Survey.
> - No single source is enough; write down the source, the year and the way of measuring before you use a number.

## Introduction

When you build a product, write documentation or plan content for engineers, the first question is usually: "What do people care about right now?" Answers based on gut feeling are easily skewed, because we only see the people around us. Fortunately, there are many free, public data sources. This article introduces five of them and explains what each one measures and what it does not. The next article, [[Reading technology survey data correctly: respondent bias, sample size and year-over-year comparisons]], goes deeper into how to read them properly.

The figures in this article follow the source pages as of November 2026; they change every year, so open the source again when you use them.

## 1. Stack Overflow Developer Survey

This is an annual survey run by Stack Overflow. The 2025 edition is the fifteenth; according to its results page it has over 49,000 responses from 177 countries, with 62 questions about 314 technologies and a new focus on AI tools, AI agents and large language models.

It measures **what respondents say**: the languages they use, the tools they want to use, how satisfied they are at work. Its strength is a multi-year series with many repeated questions, so comparisons are possible. Its weakness is that respondents choose to take part (see the next article).

## 2. GitHub Octoverse

Octoverse is GitHub's annual report based on real activity on the platform, mostly public activity. The "Octoverse 2025 year" runs from 1 September 2024 to 31 August 2025. The report says more than 36 million developers joined GitHub in that year, and that by August 2025 TypeScript had become the language with the most monthly contributors on GitHub, ahead of Python and JavaScript.

It measures **what people do**: who contributes, in which language. Note that the report itself says its language ranking is based on contributor counts, while other indices use different methods and may rank languages in a different order. It also only sees what lives on GitHub, not code hosted elsewhere.

## 3. Google Trends

Google Trends shows search interest over time and by region. According to Google's help page, each data point is divided by the total searches of that region and time range, then scaled to 0–100; the values are **relative**, not absolute search counts. A keyword with very few searches may show as 0, and small random noise is added to protect privacy.

It measures **what people are curious about**. A sudden spike only shows search interest; it does not prove the technology is "winning". Be careful with ambiguous keywords as well (for example "Go" or "Rust").

## 4. Package download statistics

Registries such as npm publish download counts per package and period through a public API. According to npm's documentation, you can get a total for a period or day-by-day figures, the earliest data is from 10 January 2015, and logs are processed once a day shortly after midnight UTC.

An example command to get a package's downloads over the last week (replace `express` with the package you need):

```bash
curl -s https://api.npmjs.org/downloads/point/last-week/express
```

It measures **actual usage within that registry's ecosystem**. Limitation: one download is not one user; continuous integration systems download the same package again and again. So look at the trend over time rather than comparing two packages of a different nature in absolute terms.

## 5. CNCF Annual Survey

The CNCF (Cloud Native Computing Foundation) surveys the cloud native community every year. According to the report page, the 2024 edition ran in autumn 2024, had 750 participants and was published on 1 April 2025; the page notes that one quarter of respondents said nearly all of their development and deployment uses cloud native techniques. This source is useful for infrastructure, Kubernetes and the related ecosystem, but its sample is smaller and leans towards people who already care about cloud native.

## Putting the sources together

| Source | What it measures | Main weakness |
|---|---|---|
| Stack Overflow Survey | What people say | Self-selected participants |
| GitHub Octoverse | What people do | Only sees GitHub |
| Google Trends | What people search | Relative, ambiguous terms |
| Package downloads | Actual usage | Automated downloads |
| CNCF Survey | The cloud native community | Small sample, topic bias |

When three sources of different kinds point the same way, you have a much more trustworthy signal than when you have only one.

## Summary

Treat each source as a pair of glasses with its own distortion. When you quote a figure, always write down the source, the year and the way it was measured. The next steps are learning to read survey data properly and then turning signals into decisions; the next two articles in this planet cover both.

## References

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Google Trends: how the data is normalised](https://support.google.com/trends/answer/4365533)
- [npm: download counts API documentation](https://github.com/npm/registry/blob/main/docs/download-counts.md)
- [CNCF Annual Survey 2024](https://www.cncf.io/reports/cncf-annual-survey-2024/)
