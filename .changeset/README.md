# Changesets

A changeset says what a PR changes for users and how much it moves the version. Add one with a PR
that changes the app (not for docs-only or tooling-only PRs):

```sh
hutch pm exec -- changeset                                        # asks
hutch pm exec -- changeset add --patch busybodies -m "Fix the coffee queue."
```

While we're on 0.x, use `minor` for new things and `patch` for fixes. Write the message for
someone reading the release notes. Merging to `main` adds it to the "Version Packages" release PR;
merging that PR tags and publishes the release (see `docs/decisions.md`, "releases with
Changesets").
