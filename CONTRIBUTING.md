# Contribution Guidelines

ThingTalk is part of Almond and is an open project, and we welcome contributions from any interested party.
When opening an issue, pull request, or support ticket, please keep in mind the following guidelines.

## Issues and Feature Requests

If you believe you have found a bug in the documentation or the software (in any of the tested configurations),
please file a bug using GitHub issues.

If you know the bug is caused by a third-party dependency, please file a bug upstream, and also file a bug here
to urge us to update the dependency. If you don't know which component to file the bug under, please file it here
and we'll take care of it.

## Development Process

To develop a new feature or bug fix, you should fork the repository and create a new branch, based
off the `master` branch, dedicated to that feature. By convention, feature branches start with `wip/`.

After you're done with the feature, you should submit a Pull Request. Integration tests will automatically
run, and the PR will be reviewed by a member of the Almond team. You must make sure that all tests pass:
PRs will failing tests might not be reviewed, and will not be merged.

## Code of Conduct

In all interactions with the Almond project, you are expected to abide by some basic
rules of civility. The details of these rules, and how the rules are enforced, are in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

