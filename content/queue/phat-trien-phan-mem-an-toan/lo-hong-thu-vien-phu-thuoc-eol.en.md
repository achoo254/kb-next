---
title: Tracking vulnerabilities in dependencies and handling end-of-life (EOL) components
tags: dependencies, vulnerabilities, SBOM, EOL, Dependabot
type: note
---

> [!TLDR]
> - Most of the code in a modern application is other people's libraries, so their vulnerabilities are your vulnerabilities.
> - Three habits are needed: know what you use (inventory, SBOM), know which vulnerabilities are published, and have an update process.
> - End-of-life (EOL) components no longer receive patches; plan a replacement, an upgrade or a clearly documented risk mitigation.

## Introduction

When you run `npm install` or `pip install`, you pull in not only the library you chose but the whole chain of libraries it needs, called **transitive dependencies**. Even a small project can pull in hundreds of packages. When one of them has a vulnerability, your application is affected even though you never wrote a line of related code.

The OWASP Top 10 has a whole category for this problem: **A06:2021 Vulnerable and Outdated Components**. This article explains how to track library vulnerabilities and what to do when a component is no longer supported. It is the SCA (software composition analysis) step mentioned in the article on the secure software development lifecycle.

## Step 1: know what you use

You cannot patch what you do not know you have. The first source of truth is the version-locking files (lockfiles) such as `package-lock.json` or a pinned `requirements.txt`. Commit them to the repository and use them for reproducible installs, for example `npm ci` instead of `npm install` in CI.

A more standardized form of inventory is an **SBOM** (Software Bill of Materials): a file listing components, their versions and their origin. Two common formats are **CycloneDX** and **SPDX**. An SBOM is useful because when a new vulnerability is announced, you look up the inventory and answer within minutes the question "do we use that component, at which version, in which product?".

Do not forget components beyond language libraries: base container images, operating system packages, runtimes (Node.js, Python, the JVM) and bundled databases and web servers.

## Step 2: know which vulnerabilities are published

Publicly disclosed vulnerabilities usually have a **CVE** (Common Vulnerabilities and Exposures) identifier and sit in advisory databases. You do not need to look them up by hand; tools match the versions you use against these databases:

- **`npm audit`** checks a Node.js project's dependency tree against the npm advisory database. A few ways to use it:

  ```bash
  npm audit                      # full report
  npm audit --omit=dev           # only runtime dependencies, skipping development-only ones
  npm audit --audit-level=high   # fail (non-zero exit code) only for high severity or above
  ```

  The `--audit-level` option is handy for setting a gate in CI: the build turns red only when a vulnerability is serious enough. Read `npm audit --help` for the npm version you have installed, because options can differ between releases.
- **Dependabot** from GitHub sends *alerts* when a repository uses a dependency with a known vulnerability, and can open pull requests to bump versions automatically. An example configuration for periodic updates in `.github/dependabot.yml`:

  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
  ```

- **OSV** (osv.dev) is an open-source vulnerability database with scanning tools and an API for lookups by package and version. For Python, the `pip-audit` tool does something similar for PyPI packages. **OWASP Dependency-Check** is another option that supports many ecosystems.

Whichever tool you use, put the results where the responsible person will actually see them: the team's alert channel, a task list, or a blocking step in CI.

## Step 3: triage first, then patch

Not every alert is equally urgent. A report can have dozens of entries, and if everything is "red", the team will ignore everything. A reasonable way to triage:

1. **Is the vulnerable code actually used?** A vulnerability in a function the application never calls, or in a package used only during development, usually carries lower risk.
2. **Can it be exploited from outside?** A component on the path that handles user-submitted data has higher priority than one that runs internally.
3. **Severity** (usually the CVSS score in the advisory) plus whether public exploit information exists.
4. **Is there a fix?** If so, upgrade the version. If not, look at the mitigations the author's advisory lists (disable a feature, change a setting, block at an application firewall).

When upgrading, prefer patch releases first, as they are less likely to break things than major releases. Always run the test suite after upgrading, and record the decision for items deliberately left unresolved, with an owner and a review date.

## End-of-life (EOL) components

**EOL** (End of Life) is the point from which the developer stops releasing patches, including security patches. EOL components are especially dangerous because when a new vulnerability is found there will be no official fix, while attackers can still exploit it.

A few useful things to know:

- Every project has its own release policy. For example, in Node.js only even-numbered releases become long-term support (LTS), while Ubuntu LTS has 5 years of standard security support, and Ubuntu Pro's Expanded Security Maintenance (ESM) extends patching for more packages. Look up the policy of the exact component you use instead of guessing.
- **endoflife.date** is a site aggregating end-of-support dates for many products. It is a community source, so for important decisions cross-check against the project's official pages.
- In practice, store the EOL dates of the main components in your inventory, then set reminders early (for example six months ahead) to leave time for upgrades.

Once you find an EOL or soon-to-be-EOL component, the options, in the usual order of preference, are:

1. **Upgrade** to a version that is still supported.
2. **Replace** it with another library that is still maintained, if the original project has been abandoned.
3. **Buy extended support** from the vendor, if available (for example ESM for operating system packages).
4. **Mitigate temporarily**: isolate the component (separate network, least privilege), monitor it closely, and record the risk in the risk register with a clear deadline. This is only a stopgap, not a solution.

Forking and patching an EOL library yourself should be a last resort, because you take on security maintenance that the whole community would normally do.

## Habits worth having

- Pin versions with lockfiles and install with reproducible commands in CI.
- Scan dependencies on every build and on a schedule (even when the code has not changed, since new vulnerabilities appear every day).
- Update regularly in small steps, instead of piling up one big upgrade every few years.
- Use fewer dependencies: every added package is one more thing to track. Think twice before adding a package just to use one small function.
- Take packages only from official sources and check package names carefully, since bad actors have published look-alike package names to trick people into installing them.

## Summary

Dependencies are part of your code in terms of risk, even though you did not write them. Take inventory, scan regularly, triage alerts with reasoning and update in small steps. For EOL components, do not wait for an incident: record the end-of-support date in the inventory, plan an upgrade or replacement early and assign an owner to every exception.

## References

- OWASP Top 10:2021, A06 Vulnerable and Outdated Components: https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/
- npm Docs, npm-audit: https://docs.npmjs.com/cli/v10/commands/npm-audit
- GitHub Docs, About Dependabot alerts: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts
- OSV, Open Source Vulnerabilities: https://osv.dev/
- OWASP Dependency-Check: https://owasp.org/www-project-dependency-check/
- CycloneDX: https://cyclonedx.org/
- SPDX: https://spdx.dev/
- endoflife.date: https://endoflife.date/
- Ubuntu, Expanded Security Maintenance: https://ubuntu.com/security/esm
- Node.js, Previous releases (LTS policy): https://nodejs.org/en/about/previous-releases
- pip-audit: https://pypi.org/project/pip-audit/
