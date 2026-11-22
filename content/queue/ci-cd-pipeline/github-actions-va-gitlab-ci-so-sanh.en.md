---
title: GitHub Actions and GitLab CI for the same Node.js project: writing two pipelines side by side
tags: github actions, gitlab ci, ci/cd, node.js, yaml
type: lab
---

> [!TLDR]
> - For the same Node.js project, we write a lint, test and build pipeline with two tools: `.github/workflows/ci.yml` and `.gitlab-ci.yml`.
> - The main difference: GitHub Actions is organised by jobs and ready-made actions, while GitLab CI is organised by stages and uses `image` for the runtime environment.
> - Both offer a cache keyed on the lock file and artifacts to pass the `dist/` folder between jobs.

## Goal

After this article you can write a complete CI pipeline on both GitHub Actions and GitLab CI for the same Node.js project, and see where the two tools are alike and where they differ. The concepts of artifact and cache were explained in the first article of this series (about pipeline stages, artifacts and cache).

## Preparation

- A Node.js project with `package.json` and `package-lock.json`, and the scripts `lint`, `test` and `build` (build produces the `dist/` folder). These script names are assumptions of this article; change them to match your project.
- A GitHub and/or GitLab account, with one repository on each holding the project.
- Basic YAML: indent with spaces (never tabs), and lists start with a `-`.

The examples use Node.js 22 and an Ubuntu 24.04 runner. Check action and image version numbers against the official documentation, because they are updated over time.

## Steps

### Step 1: the pipeline on GitHub Actions

Create the file `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7
```

Reading it part by part:

- `on` says when to run: on every push to `main` and on every pull request.
- `jobs` are groups of steps that run in parallel by default; `needs: test` makes the `build` job wait for `test` to finish and pass.
- `uses` calls a ready-made *action*, `run` runs a shell command.
- `cache: npm` in `actions/setup-node` automatically caches the npm libraries, with a key based on the lock file.
- `actions/upload-artifact` saves `dist/` as an artifact, kept for 7 days.

### Step 2: the pipeline on GitLab CI

Create the file `.gitlab-ci.yml` at the root of the repository:

```yaml
image: node:22

stages:
  - test
  - build

default:
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/

before_script:
  - npm ci --cache .npm --prefer-offline

test:
  stage: test
  script:
    - npm run lint
    - npm test

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
```

Reading it part by part:

- `image` says which container runs the job; on GitHub we choose `runs-on` and install Node with an action, while on GitLab we usually choose an image that already has Node.
- `stages` sets the order; jobs in the same stage run in parallel, and a later stage runs only when the previous stage passed.
- `cache` with `key: files:` builds the key from the contents of `package-lock.json`; we point npm at a `.npm/` folder inside the project so GitLab can store it.
- `artifacts` with `expire_in` keeps `dist/` for a week and automatically hands it to jobs in later stages.

### Step 3: run it and add conditions

Push the files to the repository. GitHub shows the result in the Actions tab, GitLab in the Build, Pipelines section (menu names may vary between versions). To limit a job to the default branch, GitLab uses `rules`:

```yaml
build:
  stage: build
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - npm run build
```

On GitHub, you add `if: github.ref == 'refs/heads/main'` to the relevant job.

## Quick comparison

| Item | GitHub Actions | GitLab CI |
| --- | --- | --- |
| Configuration file | `.github/workflows/*.yml` (several files) | `.gitlab-ci.yml` (one root file) |
| Main unit | job, with dependencies via `needs` | stage containing jobs |
| Runtime environment | `runs-on` plus setup actions | `image` per job |
| Reuse | actions from the marketplace | `include`, templates |
| Cache | `actions/cache` or the `cache` option of a setup action | `cache` block with `key`, `paths` |
| Artifact | `actions/upload-artifact` | `artifacts` block |

Neither tool is absolutely "better": choose based on where you already keep your code.

## Verification

- Deliberately break a test and push: the `build` job must not run.
- Run it a second time without changing `package-lock.json`: the log must report that the cache was restored and the dependency install step should be faster.
- Open the pipeline result page and download the `dist` artifact.

## Common errors

- **Wrong YAML indentation or tabs**: the tool reports a syntax error as soon as it reads the file.
- **`npm ci` complains about a missing `package-lock.json`**: commit the lock file to the repository.
- **The `build` job cannot see `dist/`**: you forgot to declare the artifact, or the path does not match the real build folder.
- **The cache never hits**: the cache key changes every time (for example, using the time as the key) or the cache path is not the folder npm really uses.
- **Writing passwords directly into the file**: use Secrets (GitHub) or CI/CD variables (GitLab). Next, the article [[Zero-downtime deployment and rollback in a pipeline: rolling, blue/green and canary]] covers the deploy step.

## References

- GitHub Docs, Workflow syntax for GitHub Actions: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- GitHub Docs, Caching dependencies to speed up workflows: https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows
- GitLab Docs, CI/CD YAML syntax reference: https://docs.gitlab.com/ci/yaml/
- GitLab Docs, Caching in GitLab CI/CD: https://docs.gitlab.com/ci/caching/
- GitLab Docs, Job artifacts: https://docs.gitlab.com/ci/jobs/job_artifacts/
