# Workflow

How changes reach the device. Mandatory reading before any code change.

## main is the deploy target

GitHub Pages serves `main`, and the user may be measuring a batch from it at
any moment. A broken `main` is a broken app in someone's hands, not a broken
build.

## What goes straight to main, and what does not

Small, low risk changes go straight to `main`.

Anything touching the worker, the segmentation pipeline, the homography, or the
session lifecycle goes on a branch named `work/<short-name>` and merges only
when the maintainer says so.

## Before any push to main

`npm run lint`, `npm test`, `npm run build` and `npm run check:bundle` must all
pass, and the real output must be reported to the maintainer. Not a summary.
The output.

## Verified state

A merged commit is unverified until the maintainer confirms it on the device.
Once he confirms, it is tagged `verified-YYYY-MM-DD-<short-sha>`. The most
recent such tag is the known good state.

An agent cannot create that tag. GitHub refuses `refs/tags` from agent
credentials, so the agent prints the two commands with the real date and sha
filled in, and the maintainer runs them:

```
git tag verified-YYYY-MM-DD-<short-sha> <short-sha>
git push origin verified-YYYY-MM-DD-<short-sha>
```

Until the maintainer has run them the commit is untagged, whatever an agent
reported.

## Rollback

If the maintainer reports the app is broken, revert `main` to the most recent
verified tag first, and diagnose afterwards. Never debug forward on a broken
`main`.

## One work item per commit

Do not mix a code change with unrelated documentation edits.

## Stop and say so

If a change turns out larger than described, or rests on an assumption that
does not hold, stop and tell the maintainer before continuing.
