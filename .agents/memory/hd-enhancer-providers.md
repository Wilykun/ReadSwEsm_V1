---
name: Free image enhancer reliability
description: Observed availability and privacy tradeoffs for no-key image enhancement providers.
---

As of 13 October 2026, `api.alwayscodex.my.id` failed DNS resolution (`ENOTFOUND`) from this workspace, and the older SparkPix `free-hd-upscale` API path returned 404. The existing iLoveIMG public-web scraper successfully enhanced synthetic PNG and WebP inputs at 2× and 4×, returning valid JPEG buffers. It is a scraped web flow rather than a supported anonymous API and may change or enforce free-use limits.

**Why:** Public enhancement endpoints change, sleep, or rate-limit; relying on one without a fresh test can break `.hd` again or send user images to unnecessary hosts.

**How to apply:** Test candidate services with non-personal synthetic images and validate output bytes before integrating. Prefer passing buffers directly to the enhancer and use Sharp locally for optional resizing instead of uploading the same image to a separate public image host.
