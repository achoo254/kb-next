---
title: Reading technology survey data correctly: respondent bias, sample size and year-over-year comparisons
tags: surveys, bias, statistics, technology trends, reading data
type: note
---

> [!TLDR]
> - Public surveys are usually self-selected samples: respondents do not represent all engineers.
> - Before trusting a number, ask: who answered, how were they recruited, how many are there, and how was the question worded.
> - Year-over-year comparisons only mean something when the questions and recruitment stay the same; small differences are often just noise.

## Introduction

A line like "X% of developers use tool Y" spreads easily and is misread just as easily. This article helps you ask a few questions before using a number, based on public surveys such as the Stack Overflow Developer Survey and the CNCF Annual Survey. The previous article, the article on five public data sources, introduced the sources; this one explains how to read them.

## Point 1: Respondents are not everyone

The results page of the Stack Overflow Developer Survey 2025 reports over 49,000 responses from 177 countries, of which the United States makes up 20.4%, Germany 8.6% and India 7.2%. That is a very large sample, but large does not mean representative. People who fill in a Q&A site's survey are usually people who already know and use that site, so those who do not use it are missing. This is called **self-selection bias**: people who choose to take part differ from those who do not.

An imagined example: if a survey about container tools is only sent through a cloud native community group, the share using containers in the results will almost certainly be higher than the real share in the whole industry. The CNCF Annual Survey 2024 had 750 participants from the cloud native community; its results say something about that community, and you should only generalise beyond it with extra evidence.

## Point 2: Sample size and subgroups

A sample of 49,000 sounds huge, but when you slice by a small group (one country, one role, a less common language) the number of people left can be very small. For small groups, proportions swing more. Practical rules:

1. Always look for the number of people in **the group you care about**, not only the total.
2. If the report does not give the subgroup sample size, do not compare two proportions that differ by a few percentage points and conclude one side is ahead.
3. With a small sample such as 750 people, treat the result as a hint about direction, not an exact figure.

## Point 3: What the question asks, and whom

The same technology can be measured in many ways: "used in the past year", "used the most", "want to use next year", "admired". The Stack Overflow Survey separates groups such as admired, desired and currently used technologies. These three numbers are not interchangeable: a tool can be **wanted** by many people yet **used** at work by few.

So when you quote a figure, state which question it answers. "27% of respondents say they want to use X" is very different from "27% of engineers use X" (this figure only illustrates the wording and is not real data).

## Point 4: Activity and words differ

Activity data such as Octoverse counts what people do on GitHub in a specific period: the Octoverse 2025 year runs from 1 September 2024 to 31 August 2025. The report also states that its language ranking uses contributor counts, and that other indices use different methods and may order languages differently. The same question "which language is the most popular" can have several answers depending on how it is measured; that is not a contradiction but a difference in definition.

Google Trends is different again: the 0–100 values are relative within the chosen region and time, not search counts. A chart that "drops" from 100 to 60 does not mean searches fell by 40%; it is relative to the peak within the time range you chose.

## Point 5: Comparing across years

To say "up" or "down" you need the same question, the same recruitment method and the same set of options. Surveys often add or change questions from year to year; the Stack Overflow Survey 2025, for example, states that its new focus is AI tools and agents. If the sample changes (say one country makes up a larger share), the overall proportion changes even when each group's behaviour does not.

A quick checklist for comparisons:

- Is the question worded the same?
- Were options added or removed?
- Are the number of people and the mix by country similar?
- Is the difference larger than a few percentage points? If it differs by only one or two points, treat it as "no meaningful change".

## Point 6: When to be suspicious

Slow down when you meet a figure with no source, no year, no sample size, or one used to prove exactly what the person quoting it wants. If you cannot find the original report, do not use it. Only quote figures you have opened and read on the original page.

## Summary

Public surveys are a useful signal, not absolute truth. Ask who answered, what was asked, how it was measured, how large the sample is and whether it can be compared. Once you can read them properly, the last step is to turn signals into decisions, as the article [[Turning trend signals into content and product decisions]] describes.

## References

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [CNCF Annual Survey 2024](https://www.cncf.io/reports/cncf-annual-survey-2024/)
- [GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Google Trends: how the data is normalised](https://support.google.com/trends/answer/4365533)
- [Wikipedia: Self-selection bias](https://en.wikipedia.org/wiki/Self-selection_bias)
