## Summary

Describe the user-visible or operator-visible outcome and the exact scope changed.

## Risk and boundaries

- Security or network-boundary impact:
- Compatibility impact:
- Publication, deployment, account, or other external action taken: none

## Evidence

- [ ] `npm ci --ignore-scripts`
- [ ] `npm run check`
- [ ] `npm run test:coverage` when scanner, reporter, or security behavior changed
- [ ] `actionlint` and `zizmor --persona pedantic` when workflows changed
- [ ] Package or CLI consumer proof when the public surface changed

## Remaining external gates

List registry, environment, branch-protection, release, or provider work that this pull request does not prove.
