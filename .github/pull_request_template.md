## What and why

<!-- The change, and the reason for it, in a sentence or two. -->

## Backend

<!--
CI's contract job runs this branch against a live backend. To choose which
backend branch, put a line of its own in this description that reads
backend-ref, a colon, and the branch, tag or commit — for example the line
"backend-ref: feat/some-branch" without the quotes. Without that line the job
uses a backend branch with the same name as this one if there is one, and
master otherwise. After adding or changing the line, use "Re-run all jobs":
"Re-run failed jobs" keeps the backend ref already picked. Say here if the
backend pull request has to merge first.
-->

## Checks

- [ ] `./verify.sh` passes (the gates CI runs, including the diner bundle)
- [ ] New hy/ru strings are listed as provisional in `packages/i18n/TRANSLATIONS.md`
- [ ] Docs describing the changed behaviour are updated (`README.md`, `apps/diner/README.md`)

## Phone QA

<!-- Needed when apps/diner changes. The checklist: apps/diner/docs/PHONE-QA.md -->

Phone QA: pass/fail + device —
