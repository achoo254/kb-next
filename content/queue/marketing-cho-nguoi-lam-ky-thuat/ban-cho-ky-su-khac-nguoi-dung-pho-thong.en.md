---
title: Selling to engineers vs. mainstream users: documentation, free trials and examples that actually run
tags: technical marketing, developers, documentation, free trial, technical products
type: note
---

> [!TLDR]
> - Engineers want to verify before they trust: they read the docs, try a free trial and run examples, not read slogans.
> - The three most persuasive things are clear documentation, a short path to a trial and examples that run right away.
> - A vague promise loses trust faster than making no promise at all.

## Introduction

When people hear "marketing", many think of ads, slogans and polished visuals. That often works for mainstream users, who choose a product based on feel, a recommendation or the interface. But for a technical product such as a library, an API, a storage service or an operations tool, the decision-maker is usually an engineer, and engineers have very different habits.

This article explains that difference and gives three concrete things that help a technical product earn trust: documentation, free trials and examples that run. It is a general explanation of how to approach content, and it does not rely on anyone's private numbers.

## How mainstream users and engineers decide differently

Mainstream users usually decide quickly, based on a few signals: is the product easy to understand, do friends use it, how much does it cost. They accept being "led" through the steps by the product.

Engineers differ in three ways:

- **They distrust advertising claims out of professional habit.** Their job is to find where systems break, so a phrase like "fastest" or "simplest" makes them ask at once: compared to what, measured how?
- **They want to verify for themselves.** Instead of trusting a friend, they open the docs, call the API, and read the source code if it is available.
- **They own the consequences.** Choosing a tool means integrating it, operating it and fixing it later. So they care about details: versions, limits, error handling, and how to get out if they need to switch vendors.

The consequence is that the persuasion channel changes completely: instead of telling a good story, you need to give them evidence they can collect on their own.

## First: documentation is the main sales page

For many technical products, the documentation is read more closely than the home page. Engineers often go straight to the docs to answer the question "can this do my job, and how long will it take me to get started?".

One easy way to organize docs is the Diátaxis framework, which separates content into four types with different purposes: tutorials, how-to guides, reference and explanation. Mixing all four on one page is a common mistake: newcomers get overwhelmed by parameter tables, while experienced readers have to wade through the teaching from scratch.

Some small but worthwhile principles:

- Write complete sentences, use consistent terminology, and state which version the docs apply to.
- Say plainly what the product limits are and what it does not do. Engineers will find the limits on their own, and they value that you said so first.
- Keep the docs in step with the product: outdated docs do more harm than missing docs, because they waste the reader's time and then their trust.

## Second: a short path to a free trial

A free trial is how engineers verify for themselves. What matters is not how many days it lasts but the distance from the decision to try to the moment they see a first result working.

Things to review:

- **Number of steps to the first result.** Every long form and every approval wait drops some of the people trying.
- **Whether a payment card is required.** This is a business decision, but know that it adds friction when people only want to try.
- **Whether the trial environment is real enough.** If the trial is cut down too far, engineers cannot evaluate what they would really use.
- **The way out.** Making data export and account deletion easy sounds counterintuitive, but it helps engineers feel safe starting.

A practical measure is "time to first value": how long does a newcomer take to get the first example running? Measure it yourself by asking someone who has never used the product to try it, and watch where they get stuck.

## Third: examples that run right away

A beautiful code snippet that does not run is the kind of content that damages credibility most. Good examples have these traits:

- **Copy, paste, run.** State the language version, libraries and operating system you tested with.
- **Small and focused.** Each example does one thing, with the expected output so readers can compare.
- **Safe sample data and addresses**, such as the domain example.com, instead of real keys or addresses.
- **Automatically tested.** If the example lives in a code repository and runs in the test pipeline, it will not silently break when the product changes.

Runnable examples also have a side effect: readers can turn them into the starting point of a real project, meaning they have begun integrating while still evaluating.

## Common mistakes

- Using absolute adjectives ("fastest", "absolutely secure") with no measurement or conditions attached.
- Hiding pricing or limits behind a "contact us" button so engineers cannot estimate costs themselves.
- Putting documentation behind a login wall, when an engineer's first move is to search and read.
- Using the same message for every audience, when the person who signs the contract and the person who writes the code care about different things.

One thing to keep in mind: in many organizations the person who pays is not the user. Engineers are often the evaluators and advocates, while the person approving the budget needs more information about cost and risk. The next piece in the series on the developer funnel, [[The developer funnel: from awareness to trial, integration and payment]], goes into this stretch of the journey.

## Summary

Selling to engineers means giving them the chance to verify for themselves. Clear documentation, a short path to a trial and runnable examples are the three things that turn promises into evidence. Use fewer slogans, state the limits plainly, and let the product prove itself.

## References

- Diátaxis, a framework for technical documentation: https://diataxis.fr/
- Write the Docs, documentation writing guide: https://www.writethedocs.org/guide/
- Google developer documentation style guide: https://developers.google.com/style
