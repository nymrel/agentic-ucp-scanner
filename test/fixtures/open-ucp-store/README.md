# Synthetic Open UCP interoperability fixture

Generated with `UCPManifestBuilder` from `nymrel/open-ucp` manifest source at
`2bbf3569c61b6a6be3a6a03a451d87f2e1b4db76`. All merchant fields were explicitly
replaced with synthetic values; `verified` is false and `machineTrustScore` is 0.
The timestamp is fixed for deterministic tests. The placeholder payment address
must never be used for a transaction. No model, provider, merchant, buyer or
payment request was executed to create this fixture.

The fixture is served from `.well-known/ucp.json`, matching Open UCP's adapter
location. It exercises normalization and discovery only. The package's own
validator and this scanner's heuristic are separate contracts, and this fixture
is not evidence of external protocol conformance or a working payment rail.
