---
description: "Used for unit testing either python or javascript code."
applyTo: "*"
---

1. Use the `Makefile`. It has targets for running all tests, or just python or javascript tests.
2. For Python, use `make pycheck`.
3. For JavaScript, use `make jscheck`.
4. Before finishing work, you MUST test everything, regardless of whether you have made changes to the code or not. This is to ensure that your changes have not introduced any regressions and that everything is working as expected.
5. If you encounter any test failures, you should investigate and fix them before proceeding. This may involve debugging code, reviewing the test cases, etc, even if the failures are not directly related to your changes. The goal is to maintain a stable and reliable codebase. It is everyone's responsibility to ensure that all tests pass before any changes are merged into the main branch.
6. To check the entire codebase, run `make check`. This will run both the Python and JavaScript tests to ensure that everything is working correctly.