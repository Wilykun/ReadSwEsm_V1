---
name: Replit global .env ignore
description: Why a root .env can remain ignored after changing the project's .gitignore.
---

In this workspace, Git's global excludes file can ignore `.env` independently of the project `.gitignore`. Removing the project-level ignore entry may not make a root `.env` stageable; check `git check-ignore -v .env` and add an explicit root negation when the user has chosen to track it.

**Why:** The workspace-wide excludes file took precedence in observed Git behavior, so a project-only rule change gave a false impression that the file was ready to upload.

**How to apply:** When `.env` is intentionally tracked for a project, verify the effective rule with `git check-ignore`; use `!/.env` in the project `.gitignore` if the global exclude still applies. Follow the user's project-specific choice and keep actual credentials out of Git.
