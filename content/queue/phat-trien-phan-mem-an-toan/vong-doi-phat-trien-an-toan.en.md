---
title: The secure software development lifecycle: building security into every step instead of waiting until the end
tags: secure development, SSDF, code review, penetration testing, OWASP
type: note
---

> [!TLDR]
> - Security is cheapest when it is considered while requirements are written, not when release is close.
> - Every phase (requirements, design, coding, testing, acceptance, operations) has a few small, repeatable tasks.
> - Code review, automated scanning and penetration testing complement each other; none replaces the others.

## Introduction

Many teams treat security as a "checkpoint" at the end of a project: finish the feature, then ask someone to hunt for bugs before release day. This usually gets expensive. A design flaw found late forces a rework of the whole processing flow, and with the deadline close, people tend to accept "temporary" risk.

The idea behind a **secure software development lifecycle** (SSDLC) is simple: put a few small security tasks into each familiar phase of the project. This article walks through each phase in plain language, with generic examples that are not tied to anyone's own systems.

Two public documents are worth reading as a frame of reference:

- **NIST SP 800-218**, the Secure Software Development Framework (SSDF) version 1.1, published by the US National Institute of Standards and Technology in 2022. It groups practices into four sets: Prepare the Organization, Protect the Software, Produce Well-Secured Software and Respond to Vulnerabilities.
- **OWASP SAMM** (Software Assurance Maturity Model) helps a team assess its maturity in software security and pick the next improvement.

You do not need to adopt everything. Choosing a few practices that fit your team size and doing them consistently works far better than a huge process nobody follows.

## Phase 1: security requirements

When you write functional requirements, write the non-functional security requirements too. Some useful questions:

- Which data is sensitive (passwords, personal data, payment information), and how is it stored, transmitted and logged?
- Who may do what? Which roles may view, edit and delete?
- Which events must the system record so they can be investigated later?

**OWASP ASVS** (Application Security Verification Standard) is a checklist split into three levels (1, 2, 3) of increasing strictness. A team can choose one level as its target and use its items as verifiable requirements, instead of writing a vague "the system must be secure".

## Phase 2: design and threat modeling

**Threat modeling** sounds heavy, but a light version needs only a short meeting and a data flow diagram:

1. Draw the components: users, the application, the database, external services.
2. Draw the **trust boundaries**, the places where data moves from a less trusted zone (browser, internet) into a more trusted one (internal servers).
3. For each flow that crosses a boundary, ask the questions suggested by **STRIDE**: Spoofing identity, Tampering with data, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
4. Record the risks and the decision for each: mitigate, accept, transfer or drop the feature.

Example: an API that lets users upload files. STRIDE quickly leads to questions like "are the file type and size checked?", "who may upload?", "where is the file stored and can it be executed?". These questions are cheap at design time and expensive after an incident.

## Phase 3: coding and code review

During coding, three habits bring the most benefit:

- **Safe conventions of the language and framework**: use parameterized queries instead of concatenating SQL strings, encode output when inserting into HTML, use existing cryptography libraries instead of inventing your own.
- **Code review with a security checklist**: the reviewer asks not only "does it work" but also "is the input validated", "are permissions checked on the server side", "are secrets written to logs".
- **Static analysis (SAST)** automated in the pipeline: a tool reads the source code and warns about known dangerous patterns. Scan results are noisy, so someone must triage them to keep the team from going numb to warnings.

Human review catches logic and design flaws that tools do not understand; tools do not get tired and do not miss repeated patterns. The two complement each other.

## Phase 4: testing, including penetration testing

Beyond normal unit and integration tests, a project can add:

- **Dynamic testing (DAST)**: a tool sends unusual requests to the running application in a test environment and observes the responses.
- **Dependency checking (SCA)**: finds published vulnerabilities in third-party libraries. This topic has its own article: [[Tracking vulnerabilities in dependencies and handling end-of-life (EOL) components]].
- **Penetration testing**: a skilled person or team tries to attack the system as a bad actor would, within a scope and time agreed in writing. The **OWASP Web Security Testing Guide** describes how web applications are tested and is a good reference for understanding what testers will do.

One important note: only run penetration tests on your own systems or systems you are explicitly allowed to test, and preferably in a test environment or at pre-announced times so live service is not disrupted. Test results should be recorded as a list of findings with severity, an owner and a deadline.

## Phase 5: acceptance before release

Acceptance is the moment to answer "is it safe enough to release?" with evidence, not gut feeling. A compact checklist may include:

| Item | Question |
| --- | --- |
| Requirements | Are the chosen security requirements met? |
| Risks | Have high risks from the threat model been handled or accepted in writing? |
| Defects | Are serious findings from scans and the penetration test closed? |
| Secrets | Do the code and configuration contain keys or passwords? (see [[Secrets in code repositories and CI/CD: never commit keys, scan for leaks and rotate on exposure]]) |
| Operations | Are there enough logs to investigate, and a way to roll back? |

A decision to "accept the risk" should carry a name and a review deadline, because a risk that is ignored without an owner gets forgotten.

## Phase 6: operations and response

Software does not stop needing security at release. SSDF devotes a whole set to **responding to vulnerabilities**: having a channel to receive vulnerability reports, a process to assess and patch, and lessons learned so the same kind of flaw does not recur. For a small team this may be just a clear security contact address, one responsible person and a post-incident note template.

## Where to start

Do not try to do everything in one quarter. A practical path:

1. Add a "security" section to the requirements template and the code review template.
2. Turn on automated scanning (SAST, SCA, secret scanning) in CI, at first warning only, not blocking.
3. Hold a light threat modeling session for the next important feature.
4. Schedule penetration testing periodically or before major releases.
5. After a few months, use OWASP SAMM to see how far you have come.

## Summary

Secure development is not a tool but a habit of spreading security work across the whole lifecycle. Clear requirements, light threat modeling, code review with a checklist, automated scanning, scoped penetration testing and evidence-based acceptance: each link is small, but together they significantly reduce the number of flaws that reach users.

## References

- NIST SP 800-218, Secure Software Development Framework (SSDF) Version 1.1: https://csrc.nist.gov/pubs/sp/800/218/final
- OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Software Assurance Maturity Model (SAMM): https://owasp.org/www-project-samm/
- OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling
- OWASP Web Security Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
- OWASP Top 10: https://owasp.org/Top10/
