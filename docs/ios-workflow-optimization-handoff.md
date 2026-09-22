# Prompt: optimize DARCi iOS CI without weakening validation

Work in `/Users/jorge/Desktop/darci`. Implement and verify improvements to the iOS GitHub Actions workflow. Another task is handling production-readiness acceptance; keep this task scoped to iOS CI and coordinate through narrow file changes. Do not edit the production-readiness roadmap or server deployment workflow.

## Baseline to inspect, not assume

- Workflow: `.github/workflows/ios.yml`; app specification: `apps/mobile/project.yml`; generation: `make -C apps/mobile generate`.
- `.xcodeproj` is intentionally gitignored. Fresh runners must generate it with XcodeGen.
- Latest known successful baseline: commit `105a3e1e9ba2ab84565bd344903f8f7c168ce5de`, run `35775145255`, job `106906352230`. Read actual logs and any newer runs before changing anything.
- That job took 16m46s: simulator selection/Xcode initialization 1m58s; build/test 14m08s; final cache save ~21s. Determine how much time belongs to package resolution, compilation, simulator boot, unit tests, UI tests and caching. Do not attribute the entire build/test duration to UI tests.
- Runner `macos-26`, currently uses runner-default Xcode and the newest available iPhone simulator. Node 24. Full unit/UI suite: latest local baseline 110 unit tests + 12 UI tests. Verify counts in current CI logs.
- Existing cache covers `$RUNNER_TEMP/darci-ios-build`, keyed by OS, architecture, Xcode version, project/package-lock hashes and commit, with a dependency-prefix fallback. Inspect whether the first run was cold, whether subsequent restores hit, whether restored build products are reusable, and whether the cache is excessively large. Do not assume the cache is effective because its step succeeded.
- iOS is already independent of server CI/deployment. Keep it independent. Path filters and cancellation of superseded runs are intentional.

## Work required

1. Measure the baseline using GitHub job logs/step timings and Xcode timing diagnostics. Record cold versus warm behavior and dependency/cache sizes.
2. Implement the smallest evidence-backed improvements: reproducible Xcode/runtime selection; package-resolution reuse/lock handling; appropriate cache boundaries; incremental compilation; simulator startup strategy; test scheduling. Evaluate unit/UI parallelization or build-for-testing/test-without-building only if it actually reduces elapsed time without introducing shared-state races, duplicate builds or costly runner expansion.
3. Preserve all existing unit/UI tests, especially auth/session, PDF readability, billing and largest-text/keyboard accessibility cases. Existing phone-auth UI tests explicitly select US country and synchronize formatted input. Do not delete assertions, skip tests, add blanket retries, use `continue-on-error`, or inflate timeouts to hide failures. Do not add paid/larger runners without asking.
4. Preserve secret-free test configuration, least-privilege GitHub permissions, Xcode project generation and failure `.xcresult` artifacts. Never load `.env.staging`/production credentials into test jobs. Do not log secrets or upload app-user data.
5. Add/update focused workflow regression tests where appropriate. `scripts/workflow-structure.test.mjs` asserts iOS remains separate and cached; preserve that contract. Run actionlint and relevant tests; verify an actual clean project generation/build/test and a warm-cache run where possible.
6. Document changes and measured before/after results in a new `docs/ios-ci-performance.md`. Separate measured gains from estimates. Keep full-suite coverage explicit. Aim to get close to the former four-minute experience where technically realistic, but do not promise that for a cold full native build without measurements.

## Boundaries and handoff

- Preserve unrelated changes from the production-readiness task. Limit edits to `.github/workflows/ios.yml`, narrowly necessary iOS build/test configuration, dedicated workflow tests and the performance report. Ask before touching shared server-CI/deployment logic or application behavior.
- Do not commit, push, dispatch workflows, deploy, alter AWS/Supabase/Stripe, or create TestFlight/App Store releases without explicit approval. If a GitHub warm/cold comparison needs a pushed branch or dispatch, prepare the change and ask for that specific approval.
- Finish with the root causes, changed files, exact validation results, measured cold/warm timings, remaining limitations and the next action needed. A faster run obtained by losing test coverage is not success.
