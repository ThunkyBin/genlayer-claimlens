# ClaimLens consensus-boundary evaluation

This controlled review examines what ClaimLens validators currently agree on. It is based on contract revision `39f8691`, the direct-mode contract, and deterministic web/LLM mocks. It does not measure factual accuracy or test GenLayer's live fetch infrastructure.

## Observed consensus rule

`assess_sources` fetches each submitted URL again when the validator runs and builds a fresh excerpt set ([`contracts/claim_lens.py`](../contracts/claim_lens.py#L52)). It decodes each successful response and limits the excerpt to 6,000 characters. For counting, it lowercases the excerpt and collapses whitespace; identical normalized excerpts count once ([lines 63–83](../contracts/claim_lens.py#L63)).

The validator compares the leader's verdict and unique excerpt count with its own result ([lines 142–162](../contracts/claim_lens.py#L142)). It does not compare the excerpt text, source identity, or rationale. Consequently, matching verdict/count means agreement on those two fields under the contract's rules; it does not establish that leader and validator saw identical evidence. A changed rationale can also pass.

The new direct-mode evaluation test, [`tests/direct/test_consensus_boundary.py`](../tests/direct/test_consensus_boundary.py), changes mocked fetch results only after the leader has produced its result. It observes three cases:

- Different source text with the same verdict and count is accepted by the validator.
- The same count with a different verdict is rejected.
- The same verdict with fewer usable excerpts is rejected.

The existing [`test_validator_rejects_a_different_unique_source_count`](../tests/direct/test_claim_lens.py#L161) independently covers count disagreement. These are controlled contract-level observations; mock agreement does not imply real-world truth or source reliability.

## Source independence and deduplication

Submitted URLs are canonicalized by dropping fragments and lowercasing the host, then compared for URL equality ([`_canonical_source_url` and the distinctness check](../contracts/claim_lens.py#L42)). This rejects host-case and fragment-only variants. After fetching, duplicate detection uses the entire bounded excerpt, not publisher, registrable domain, canonical-page metadata, or semantic similarity. Two different pages on one host can therefore count separately when their excerpts differ; near-duplicates can count separately too. `sources_used` is a count of unique normalized excerpts, not a verified count of independent publishers.

[`test_assess_does_not_count_duplicate_source_excerpts`](../tests/direct/test_claim_lens.py#L116) confirms that identical text still counts once despite case and whitespace differences. The current tests do not establish publisher independence or detect copied/near-duplicate articles.

## URL allowlist and fetch limits

`_is_public_https_url` requires the literal `https://` prefix, an ASCII DNS-style host with multiple valid labels, and rejects credentials, colons, local suffixes, and numeric/IP-like hosts ([`contracts/claim_lens.py`](../contracts/claim_lens.py#L197)). The test [`test_assess_rejects_non_public_or_malformed_hosts`](../tests/direct/test_claim_lens.py#L71) covers HTTP, credentials, explicit port 443, localhost and local suffixes, common IPv4/octal/hex forms, malformed labels, and a link-local metadata address.

The implementation's colon check rejects every explicit port, including `:443`. During this review, the README wording was corrected to say “explicit ports.” The allowlist is syntactic: the contract does not resolve DNS, detect rebinding/CNAME changes, or inspect the final destination after redirects. The README states this limitation; the direct-mode tests do not exercise DNS or redirect handling because those behaviors belong to the network fetch service.

## Prompt-injection handling

The prompt labels the claim and excerpts as untrusted data, says to ignore instructions embedded in excerpts, and requires evidence-based classification ([`contracts/claim_lens.py`](../contracts/claim_lens.py#L93)). This is a mitigation in prompt wording, not a deterministic sandbox around model interpretation. The repository currently has no direct-mode test that injects adversarial instructions into a fetched excerpt and checks the resulting behavior. That boundary remains unmeasured here.

## Verification

The focused evaluation passed all three cases under Python 3.12.14 and `genlayer-test` 0.29.2. After adding the independent contributor-tool tests, the complete direct-mode suite passed 41 tests in the shared checkout. These are mocked contract tests, not a live-network or factual-accuracy evaluation. No contract logic or live network behavior was changed by this review.
