---
title: What stages make up a CI/CD pipeline: build, test, deploy, artifacts and cache
tags: ci/cd, pipeline, artifacts, cache, devops
type: note
---

> [!TLDR]
> - A pipeline is a chain of automated steps that runs whenever code changes: build, test, package, then deploy.
> - An artifact is the output of one step that later steps reuse; a cache is only a temporary copy that makes runs faster.
> - Every stage must give a clear pass or fail result, and if an earlier stage breaks, later stages do not run.

## Introduction

Many software teams still deploy by hand: someone logs in to a server, pulls the new code, runs a few commands and hopes everything works. This is slow, easy to get wrong and hard to repeat. CI/CD replaces those manual tasks with a **pipeline**: a chain of automated steps that the system runs whenever code changes.

The two abbreviations are often lumped together but describe two different things:

- **CI (Continuous Integration)**: every change merged into the shared branch is built and tested automatically, so mistakes show up early while they are still small.
- **CD** usually means either *Continuous Delivery* (a tested build is always ready, and someone presses a button to release it) or *Continuous Deployment* (a build that passes the tests is deployed straight away, with no button). The two differ in whether a person triggers the release, so when reading documentation check which meaning the author uses.

This article explains the stages a pipeline typically has, then two concepts that are often confused: artifacts and cache. The next article, [[GitHub Actions and GitLab CI for the same Node.js project: writing two pipelines side by side]], writes real pipelines with two popular tools.

## Common stages

Stage names differ from place to place, but the ideas are similar. A pipeline for a web application might include:

1. **Checkout**: download the source code of the commit being examined onto the machine that runs the pipeline.
2. **Install dependencies**: for a Node.js project, for example, `npm ci`. This command installs exactly the versions recorded in the lock file (`package-lock.json`), so the result is repeatable.
3. **Static checks (lint)**: catch syntax errors and style violations before the program even runs.
4. **Build**: compile or package the code into something that can run, such as a `dist/` folder or a container image.
5. **Test**: run unit tests and, if you have them, integration tests.
6. **Package and store**: put the build output somewhere durable, such as a registry for images or an artifact store.
7. **Deploy**: put the packaged build on the target environment, usually staging first and production after.

The most important rule is that **if an earlier stage fails, later stages stop**. If the tests are red, nothing is deployed. This makes the pipeline a gate: code that has not passed the checks cannot move forward.

Another principle is **build once, use many times**. The build that was tested in step 5 must be exactly the build deployed in step 7. If each environment rebuilds on its own, what runs in production may differ from what was tested, even for the same commit.

## Artifacts: the output of a step

An **artifact** is a file or folder produced by one step and kept so that another step, or a person, can use it later. Examples:

- the `dist/` folder containing the build of a web front end;
- a `.tar.gz` or `.zip` file containing a compiled program;
- test reports or coverage reports;
- a container image pushed to a registry (a registry is commonly treated as an artifact store for images).

Each job in a pipeline usually runs on a brand-new machine (or container), so whatever the `build` job produces is **lost** when the job ends unless you save it as an artifact. If the `deploy` job later needs the build, it has to download that artifact.

Artifacts have two more benefits: you can download them to investigate when a pipeline fails, and you can keep released builds for rolling back later (see [[Zero-downtime deployment and rollback in a pipeline: rolling, blue/green and canary]]). Because they take up space, all the tools let you set a retention period.

For container images, a lean way to package them is the multi-stage Dockerfile described in [[Multi-stage Dockerfiles: heavy builds, light runtime images]].

## Cache: a temporary copy for speed

A **cache** has a different purpose: avoiding repeating slow work. For example, downloading all your npm libraries from the internet on every run is very slow. If you save the download folder from the previous run, the next run can simply restore it.

The key differences between the two concepts:

| | Artifact | Cache |
| --- | --- | --- |
| Purpose | Pass results between steps, or keep them for reuse | Run faster |
| May it be missing | No, later steps need it | Yes, if missing the run is only slower |
| Reliability | Must be correct and complete | May be deleted or stale at any time |

Because a cache can disappear, the pipeline **must not depend** on it to run correctly. If a missing cache breaks the pipeline, that data should have been an artifact.

A cache key is usually built from the contents of the dependency lock file, for example a hash of `package-lock.json`. When you add or upgrade a library, the file changes, the key changes and the system creates a new cache. When the file is unchanged, the old cache is reused. Both GitHub Actions and GitLab CI have this mechanism; the next article gives concrete examples.

## Common mistakes

- **Confusing cache with artifact**: letting the deploy job take the build from the cache. When the cache is deleted, deploy breaks.
- **Slow tests placed too early**: put cheap, fast checks (lint, unit tests) first so errors are caught early and resources are not wasted.
- **Putting secrets in the pipeline code**: passwords and access keys belong in the CI tool's secret store (secrets/variables), not written directly into the configuration file.
- **Rebuilding in every environment**: this breaks the build-once principle.

## Summary

A CI/CD pipeline turns a chain of manual chores into an automated process: checkout, install dependencies, lint, build, test, package and deploy, with each stage acting as a gate. An artifact is output you must keep so later steps can use it, while a cache only speeds things up and can vanish at any time. Understanding this difference helps you read and write pipelines correctly from the start.

## References

- GitHub Docs, Understanding GitHub Actions: https://docs.github.com/en/actions/get-started/understanding-github-actions
- GitHub Docs, Caching dependencies to speed up workflows: https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows
- GitLab Docs, Caching in GitLab CI/CD: https://docs.gitlab.com/ci/caching/
- GitLab Docs, Job artifacts: https://docs.gitlab.com/ci/jobs/job_artifacts/
