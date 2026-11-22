---
title: Secrets in code repositories and CI/CD: never commit keys, scan for leaks and rotate on exposure
tags: secrets management, CI/CD, git, GitHub Actions, key rotation
type: lab
---

> [!TLDR]
> - Secrets (passwords, tokens, private keys) must not live in the code repository; keep them only in the platform's secret store or a secrets manager.
> - Block leaks early with `.gitignore`, a pre-commit hook and secret scanning in CI; once a secret has leaked, treat it as compromised and rotate it.
> - In CI/CD, grant least privilege, never print secrets to logs and pin third-party action versions.

## Goal

After this article you can:

- Explain why a secret that has entered git history can no longer be considered safe.
- Set up `.gitignore` and a simple pre-commit hook that blocks `.env` files.
- Use secrets in a CI/CD pipeline (for example GitHub Actions) correctly.
- Have a ready procedure for when you suspect a key has leaked.

This article follows on from the article on the secure software development lifecycle: there, secrets are one item on the acceptance checklist; here we see how to satisfy that item.

## Preparation

- An Ubuntu 24.04 LTS machine with `git` (version 2.43 or later ships with Ubuntu 24.04; check with `git --version`).
- A scratch directory. Every value in this article is a fake example, not a real key.
- For the CI part: a GitHub repository with Actions enabled.

## What a secret is and why a repository is a poor place to keep it

A **secret** is any value that lets whoever holds it act in your place: a database password, an API key, an access token, an SSH or TLS private key, a webhook signing string.

A code repository is a poor place for them for three reasons:

1. **Git history is practically permanent.** Deleting a line in a new commit does not delete it from old commits. Every clone, every branch and every fork carries that history.
2. **Repositories are widely shared.** More people can read the code than need to know the production password.
3. **Repositories are easily exposed.** A private repository accidentally made public, or a leaked backup, brings every secret inside with it.

The practical rule: **code lives in the repository, secrets live outside it**, and the application receives secrets at run time through environment variables, mounted files or a secrets manager. The idea of separating configuration from the image is also what [[ConfigMaps and Secrets: separating configuration from your application image on Kubernetes]] presents for Kubernetes.

## Steps

### Step 1: create a test repository and `.gitignore`

```bash
mkdir demo-secrets && cd demo-secrets
git init
printf 'DB_PASSWORD=example-not-real\n' > .env
printf '.env\n.env.*\n!.env.example\n' > .gitignore
printf 'DB_PASSWORD=\n' > .env.example
git status --short
```

`git status` shows only `.gitignore` and `.env.example`; the `.env` file is ignored. The `.env.example` file contains variable names but no values, so newcomers know what to configure.

Check why a file is ignored:

```bash
git check-ignore -v .env
```

The command prints the rule in `.gitignore` that matched.

**Important note:** `.gitignore` only affects files that are *not yet tracked*. If `.env` was ever committed, adding it to `.gitignore` is not enough. To stop tracking it (keeping the file on disk):

```bash
git rm --cached .env
```

But this only stops tracking from new commits on; the old history still contains the secret, see Step 4.

### Step 2: add a pre-commit hook to block `.env` files

A hook is a script git runs before creating a commit. Create `.git/hooks/pre-commit`:

```bash
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
# Block the commit if a .env or .env.* file is staged (except .env.example)
if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'; then
  echo "Commit blocked: a .env file is staged." >&2
  exit 1
fi
HOOK
chmod +x .git/hooks/pre-commit
```

Try it: `git add -f .env` then `git commit -m test`. The commit is blocked and the hook prints the file name. Remove it from the staging area with `git rm --cached .env`.

A local hook is only the first safety net: anyone can bypass it (`git commit --no-verify`) and it does not travel with `git clone`. So you also need a check on the server side, see Step 3.

### Step 3: scan for secrets in CI and on the platform

Two complementary approaches:

- **The platform's secret scanning.** GitHub has *secret scanning*, which finds token patterns from many providers in the repository, and *push protection*, which can block a push that contains a secret. You enable them in the repository's security settings (which features are available depends on the repository type and plan; see the GitHub documentation).
- **Open-source scanning tools** that run in CI or before pushing, such as gitleaks or trufflehog. They scan the whole commit history, not only the current directory tree. Read the documentation of the tool you choose for the command-line syntax of the exact version you use, because options change between releases.

Scanning tools can raise false positives or miss things, so this is a detection layer, not a reason to be less careful at the other layers.

### Step 4: when a secret has already entered the repository

Suppose you discover that a key was committed. The recommended order of work:

1. **Revoke and rotate immediately.** Create a new key, update where it is used, then disable the old key at the provider. This is the most important step, because you cannot know who copied the key while it was exposed.
2. **Check the old key's usage log** (if the provider has one) for unusual access.
3. **Find where it appears** in the history:

   ```bash
   git log --all --oneline -S'example-not-real'
   ```

   `-S` finds commits that change the number of occurrences of that string.
4. **Cleaning the history is secondary**, done after rotation, with a history-rewriting tool such as `git filter-repo` or BFG Repo-Cleaner.

> **Warning:** rewriting history changes every later commit ID, forces others to fix their copies and requires `git push --force`, an operation that can overwrite other people's work. Agree with the whole team and back up the repository first. Even after cleaning, treat the old key as exposed.

### Step 5: use secrets in CI/CD correctly

With GitHub Actions, secrets are stored in the repository or environment *Secrets* and accessed through the `secrets` context:

```yaml
name: deploy
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: Call the deployment API
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
        run: ./scripts/deploy.sh
```

Accompanying principles:

- **Least privilege**: declare `permissions` so `GITHUB_TOKEN` has only the access it needs, as in the example above.
- **Narrow scope**: use environment-level secrets for production and set protection rules (for example required reviewers) on that environment.
- **Do not print secrets to logs.** GitHub masks registered secret values in logs, but cannot mask every variant (for example a base64-encoded or split value). Do not `echo` secrets and do not enable verbose debug mode when it is not needed.
- **Be careful with outside code**: workflows triggered by pull requests from forks do not receive secrets by default, and you should not change that behavior for untrusted code.
- **Pin third-party actions** to a full commit SHA instead of a tag that can be moved, as recommended in GitHub's security hardening guide.
- **Prefer short-lived identities** (such as OpenID Connect with a cloud provider) over stored long-lived keys, when your platform supports it.

## Verification

- `git ls-files | grep -E '(^|/)\.env'` shows at most `.env.example`.
- Try committing a `.env` file and confirm the hook blocks it.
- In CI, check the log of a run for any secret value appearing.
- Have a short document recording: which secrets exist, who manages them, how often they are rotated and what to do on exposure.

## Common mistakes

- **Adding `.env` to `.gitignore` after it was committed**: the file is still tracked and the history still contains it.
- **Removing the key from history without rotating it**: the old key still works for anyone who copied it.
- **Using one key for every environment**: a leak in one place is a leak everywhere. Each environment should have its own key.
- **Putting secrets in command-line arguments**: they can appear in the process list and shell history. Prefer environment variables or files with restricted permissions.
- **Trusting scanning tools too much**: they miss secrets with no recognizable pattern, such as self-chosen passwords.

## Summary

Keep secrets out of the code repository, block leaks with several layers (`.gitignore`, a hook, automated scanning), give CI/CD least privilege and always have a rotation procedure ready. A leaked secret must be replaced, not hidden. A team should also remember that third-party software in the project carries its own risk, the topic of [[Tracking vulnerabilities in dependencies and handling end-of-life (EOL) components]].

## References

- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- GitHub Docs, Using secrets in GitHub Actions: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
- GitHub Docs, Security hardening for GitHub Actions: https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
- GitHub Docs, About secret scanning: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- Git documentation, gitignore: https://git-scm.com/docs/gitignore
- Git documentation, githooks: https://git-scm.com/docs/githooks
- BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
