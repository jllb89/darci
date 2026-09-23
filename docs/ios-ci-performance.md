# iOS CI performance

## Scope and safety constraints

This report covers only the standalone `.github/workflows/ios.yml` workflow and its generated Xcode project inputs. Server CI and deployment remain unchanged. The workflow still has `contents: read`, path filtering, superseded-run cancellation, project generation through XcodeGen, secret-free loopback test configuration, serial unit/UI execution, and failure uploads for `.xcresult` diagnostics.

The full `DARCiMobile` scheme remains mandatory: 110 unit tests and 12 UI tests. There are no skipped or selected-only tests, blanket retries, `continue-on-error`, larger runners, staging credentials, or production credentials.

## GitHub baseline (measured)

Source: commit `105a3e1e9ba2ab84565bd344903f8f7c168ce5de`, [run 35775145255](https://github.com/jllb89/darci/actions/runs/35775145255), [job 106906352230](https://github.com/jllb89/darci/actions/runs/35775145255/job/106906352230), 2026-09-22. This was the only iOS workflow run at the initial inspection; it had no prior warm restore.

The job ran on `macos-26-arm64` with Xcode 26.6 (build 17F113) and an iPhone 17 Pro running iOS 26.5. Total job time was 16m46s.

| Phase | Measured time | Evidence/interpretation |
| --- | ---: | --- |
| Checkout, Node, generation, cache-key setup, cold cache lookup | 14s | GitHub step timestamps. XcodeGen 2.46.0 installation and generation took 5s. |
| Simulator inventory / Xcode simulator initialization | 1m58s | `19:39:28`–`19:41:26`. This was selection/initialization, not UI-test execution. |
| Package resolution | 48.9s | `Resolve Package Graph` at `19:41:38.119` through resolved packages at `19:42:27.050`. |
| Dependency graph and compilation/build | about 1m54s | Resolved packages at `19:42:27.050` through final build activity at `19:44:21.348`. The old command did not enable Xcode's build timing summary, so this is a log-boundary measurement rather than summed compiler-task timing. |
| Simulator/test-runner startup before unit tests | about 2m54s | Final build activity at `19:44:21.348` through unit-suite start at `19:47:14.985`. |
| Unit tests | 42.5s wall, 32.0s test execution | 110 tests, zero failures. |
| Transition from unit to UI bundle | 17.4s | Unit suite ended at `19:47:57.497`; UI suite started at `19:48:14.893`. |
| UI tests | 5m48.5s | 12 tests, zero failures. |
| Test shutdown/result processing | about 1m16s | UI suite ended at `19:54:03.402`; Xcode's test observer ended at `19:55:19.790`. |
| Remaining command/step overhead | about 29s | Xcode startup before package resolution, result-bundle finalization, and the gap between command completion and the GitHub step boundary. |
| Final cache save | 21s | GitHub step timestamp; the 552,282,158-byte upload itself finished in about 5s after archive creation. |

The Xcode test operation reported 658.439s (10m58.4s) from build completion through test teardown. The 14m08s GitHub build/test step therefore was not “UI tests”: UI execution accounted for 5m48.5s, while package resolution, compilation, simulator/test startup, unit tests, bundle transition, and teardown accounted for the rest.

### Baseline cache behavior and size

The cache lookup explicitly logged `Cache not found`; the cache API showed one entry whose `createdAt` and `lastAccessedAt` were identical. There is no evidence that the baseline cache was ever restored, so its build products cannot be called CI-proven reusable.

The single cache combined Swift packages and all DerivedData under a commit-specific key with a dependency-prefix fallback. It uploaded 552,282,158 bytes (526.7 MiB compressed). Because every new commit produced another full immutable entry, unchanged package artifacts would be uploaded again alongside incremental products.

On the local validation machine, the analogous fresh directories were 1.4 GiB of Swift packages and 507 MiB across the selected build/module/stat-cache directories. At zstd level 3 they compressed to 361 MiB and 153 MiB respectively. These are local sizes, not GitHub cache measurements, but they show that package artifacts dominate and should have a stable lock-keyed lifetime while the smaller build cache may vary by commit.

## First candidate run and evidence-driven correction

A concurrent production-readiness task committed and pushed the shared working tree while this work was under validation. That automatically ran an intermediate iOS candidate at commit `c5acd9b6e5e2b5e5cbe7b255cdd185ae5efb89ea`: [run 35786349739](https://github.com/jllb89/darci/actions/runs/35786349739), [job 106943981658](https://github.com/jllb89/darci/actions/runs/35786349739/job/106943981658). This task did not commit, push, or dispatch that run.

The intermediate candidate passed all 110 unit and 12 UI tests, but its cold job took 19m26s, 2m40s slower than baseline. It is not treated as a successful performance result.

| Intermediate candidate phase | Measured time/result |
| --- | ---: |
| Pinned simulator selection/start | 8s by GitHub step timing |
| Locked-package cache lookup | 1m03s, cold miss |
| Incremental-build cache lookup | 2s, cold miss |
| Generic `build-for-testing` | 7m26s |
| Package resolution within build | 46.6s |
| Post-resolution build | about 4m52s |
| Xcode timing summary | SwiftCompile: 380.790s aggregate; asset catalog: 120.122s |
| `test-without-building` step | 9m28s |
| Xcode test operation | 8m19.9s |
| Unit tests | 110 passed in 28.023s wall |
| UI tests | 12 passed in 5m32.3s wall |
| Build cache save | 19s; 169,190,776 bytes (161.4 MiB) |
| Package cache save | 19s; 376,460,685 bytes (359.0 MiB) |

The generic build was the regression: compared with the baseline's roughly 1m54s concrete-device build, it spent about 4m52s after package resolution. It also incurred a second package-graph pass during `test-without-building`. The current workflow therefore removes the split/generic experiment and returns to one concrete-device `xcodebuild test`. It keeps the independently supported improvements described below. The 161.4 MiB and 359.0 MiB uploads confirm that the split cache boundaries match the local size estimate; the main storage benefit is avoiding a new 359 MiB package upload on every commit, not making the first cold save faster.

## Changes

- Added a tracked `apps/mobile/Package.resolved` and made `make -C apps/mobile generate` copy it into the generated workspace. CI requires that the copy matches and builds with `-onlyUsePackageVersionsFromResolvedFile` plus `-skipPackageUpdates`. Fresh runners now use the same dependency revisions even though the generated `.xcodeproj` remains ignored.
- Pinned CI to Xcode 26.6, the iOS 26.5 runtime, and iPhone 17 Pro instead of accepting the runner default and newest phone/runtime. A missing pinned toolchain or runtime fails clearly.
- Starts the exact simulator before cache restoration and compilation, allowing boot to continue while cache actions and the concrete-device build proceed. Xcode remains responsible for waiting if the asynchronous boot is not yet ready.
- Split the old cache into a stable OS/architecture/lockfile Swift-package cache and an Xcode/XcodeGen/workflow/spec/lock/commit incremental-build cache. The build cache contains only `Build`, `ModuleCache.noindex`, and `SDKStatCaches.noindex`; index data and logs are excluded. This reduces repeated per-commit cache churn from the 526.7 MiB combined baseline to the measured 161.4 MiB build portion when packages are unchanged.
- Runs one concrete-device `xcodebuild test`, so package resolution and build setup are not duplicated. Test-bundle parallelism remains disabled to avoid extra simulator clones and shared-state risk; it could save at most the much smaller unit-test portion of the baseline.
- Requests `-showBuildTimingSummary` and disables the compiler index store in CI. Xcode 26.6 emitted the summary for the rejected split build; Xcode 26.2 did not emit one for the final combined `test` command, so future GitHub logs must confirm whether 26.6 reports it for that action.
- Preserved the failure `.xcresult` upload from the single build/test command.

## Local verification (measured, not a GitHub before/after)

Local validation used Xcode 26.2 and iOS 26.2 on the development Mac, not the GitHub runner. The project and DerivedData destinations were clean for the first pass. The Swift package destination was also new, although host-level download caches may have been warm. These numbers demonstrate correctness and incremental reuse; they must not be presented as expected GitHub timings.

The final single-command workflow shape was run twice:

| Local phase | Clean destination | Warm destination |
| --- | ---: | ---: |
| Concrete-device `xcodebuild test` | 4m22.30s | 3m43.46s |
| Unit suite | 110 passed in 0.333s wall | 110 passed in 0.289s wall |
| UI suite | 12 passed in 201.939s wall | 12 passed in 200.863s wall |
| Xcode test operation | 3m40.0s | 3m37.8s |

Both final passes completed with 110 unit tests and 12 UI tests, zero failures. The 38.84s reduction in the warm command is the local evidence that locked packages and incremental products are reusable; the repeated serial UI suite remained stable. The successful result bundles were about 56 MiB locally.

For comparison, the rejected local split experiment took 4m36.3s clean and 3m45.3s warm. The corrected single-command shape was 14.0s faster clean and 1.8s faster warm on the same machine, while being simpler and avoiding duplicate package-graph work.

Static validation:

- `actionlint .github/workflows/ios.yml`
- `node --test scripts/workflow-structure.test.mjs`
- clean XcodeGen generation plus byte-for-byte comparison of the canonical and generated `Package.resolved`
- `git diff --check` on scoped files

## Measured gains, estimates, and remaining limitations

Measured and retained: exact dependencies, a reproducible toolchain/runtime/device, 110/12 coverage, a stable 359.0 MiB package-cache boundary, a 161.4 MiB incremental-build boundary, successful clean and warm local final commands, and full diagnostics. Measured and rejected: the generic build/split-test candidate, whose cold GitHub run regressed from 16m46s to 19m26s.

The current corrected single-command workflow has not been run on GitHub. Starting the simulator early may overlap boot with package/cache/build work; a package-cache hit should avoid the 46–49s cold fetch/checkouts; and a build-cache hit should reduce compilation. Those are estimates until a corrected remote run exists. The local 4m22s clean command shows that a roughly four-minute developer-machine experience is realistic, but it is not a promise for a cold GitHub native build.

The 12 serial UI tests remain the irreducible majority of test execution. Splitting unit and UI tests across paid or additional runners was rejected: it would duplicate runner setup/build transfer for at most about 43 seconds of baseline unit-suite overlap and would complicate simulator-state isolation. Enabling Xcode bundle parallelism was also rejected without evidence because it creates simulator clones for a small theoretical saving.

The package cache remains large because Sentry's binary artifacts dominate it, but it is now saved once per lockfile rather than once per commit. The incremental cache remains commit-specific with a compatible-prefix restore; GitHub must still confirm its actual restore time and cross-commit reuse. XcodeGen is installed from Homebrew, but its actual version participates in the build-cache boundary. The current cache key also includes the workflow so changes to build flags do not restore an incompatible prefix.

The next validation step requires explicit approval to commit/push the corrected workflow and run it twice. The first run should hit the already-populated package cache but use a new workflow-scoped build key; the second run at the same commit should exercise exact package and build hits. Record cache restore/save times, package resolution, build timing summary, simulator readiness, the 110/12 counts, and total job elapsed time before making any stronger performance claim.
