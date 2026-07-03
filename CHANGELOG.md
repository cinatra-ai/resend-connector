# Changelog

All notable changes to this project are documented here, derived from the
project's merged pull request and release-tag history.

## v0.1.2 — 2026-06-23

- ci: add truthful-attribution-gate in WARN mode (#15)
- ci: adopt the reusable extension->host IoC conformance gate (org-wide rollout) (#16)
- ci: tag-driven GitHub release on v* (#17)
- ci: adopt secret-scan-gate (#18)
- release: v0.1.2 (#19)

## v0.1.1 — 2026-06-13

- ci: adopt source-leak-gate (#1)
- ci: adopt source-leak-gate (#2)
- chore: add .gitignore (#3)
- ci: adopt org gates — SHA-pin all uses: refs, bump source-leak-gate to v0.1.0, add actions-pinned + gitignore gate callers (#4)
- chore: keep internal planning notes untracked (#5)
- Self-bind host deps at serverEntry activation; mark the definition instance-scoped (#6)
- chore: npm files allowlist + source-archive export-ignore hygiene (#56 standard) (#7)
- ci(release): grant contents: write + pin reusable workflow to .github HEAD (#8)
- chore: Configure Renovate (#9)
- ci: repin reusable release workflow (immutable-safe decoration + corrected build-input provisioning) (#11)
- release: resend-connector v0.1.1 (republish on corrected serverEntry build pipeline) (#12)
- ci: repin reusable release workflow to .github@21f807e7 (#13)
- resend-connector: pin required dep edge to exact promoted version (#14)

## v0.1.0 — 2026-06-03

- Initial release.

## Unreleased

- docs(readme): expand README to the org standard (#20) (#21)
- ci: adopt source-leak-gate (#22)
- ci: adopt source-leak-gate (#23)
- chore: strip private engineering-tracker refs from public source (#24)
- chore: strip private tracker references from workflow comments (#27)
- ci(release): pin reusable-extension-release to gated v0.1.1 (release-approval wall) (#28)
- chore: add cinatra.vendor and displayName connector metadata (#30)
- chore(deps): declare cinatra.consumes for closure-gate enrollment (#31)
- test: add unit tests for mail-send safety logic (#29) (#32)
- chore(deps): declare cross-extension dependency as a semver range (#33)

