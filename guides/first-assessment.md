# Trace a ClaimLens assessment

This walkthrough uses the ClaimLens web app and its recorded Studionet deployment to show what an assessment does and what the result means. ClaimLens is an experimental research aid: validator agreement is not proof that a claim is true. Do not use it for medical, legal, financial, employment, or other high-impact decisions.

## Open the app and inspect a recorded result

Open the [ClaimLens app](https://thunkybin.github.io/genlayer-claimlens/). Its network selector defaults to Studionet, and its contract field is prefilled with the demo contract:

`0x56Be71883DC0154c28a471c1B82481ABfEB21D5F`

This is a hosted, temporary development deployment, not a persistent testnet deployment. The app reads the assessment count and then loads the latest record. You do not need to connect a wallet to read results; a wallet is requested only when you submit a new assessment.

The repository README records a successful assessment with ID `2`, alongside its [Studionet transaction](https://explorer-studio.genlayer.com/tx/0x3377bdcc19f70159fa02e96b956636078be5f6ebcc98951d8c2e32576a12fa9a) and the [deployed contract](https://explorer-studio.genlayer.com/address/0x56Be71883DC0154c28a471c1B82481ABfEB21D5F). The README reported three stored assessments at the time of that write. If later writes have increased the count, the app will show the newer latest assessment; use GenLayer Studio's read call `get_assessment(2)` to inspect ID 2 specifically. The contract's `get_assessment_count()` is a count, so the first record is ID `0` and a count of three means IDs `0`, `1`, and `2` exist.

The explorer links let you check the deployment and transaction receipt. To read the stored assessment itself, use the app or call the contract's read-only `get_assessment(assessment_id)` method in Studio. A read does not submit a transaction.

## Submit a new assessment

Only submit a public, non-sensitive claim that can be checked against independent public pages. The historical demo example in the README is:

```text
Claim: The current documentation lists the Bradbury chain ID as 4221.

Sources:
https://docs.genlayer.com/developers/networks
https://explorer-bradbury.genlayer.com
```

Network details can change, and a page's rendered text can change too. Check the source pages before submitting; this example documents a past demo and does not promise the same result today.

In the app, choose the network where the contract is deployed, check the contract address, enter a claim of 1–280 characters, and add two or three distinct HTTPS source URLs. The browser form checks the claim length, source count, HTTPS scheme, and exact URL duplicates. The contract also applies its own checks: each URL must be at most 2,048 characters and pass its basic public-host rules; fragments are removed and hostnames are lowercased before fetching, so URLs that differ only by a fragment or hostname case are duplicates.

Connect an EIP-1193 wallet only if you want to write a new assessment. When you submit, the app asks for confirmation and then your wallet displays the network and any required fee. Approve only if those details are expected. The contract fetches the pages and runs the assessment, so finalization can take time and use test GEN. After the transaction finalizes successfully, the app refreshes the latest stored assessment and provides a transaction link. If a transaction hash exists but the app reports an error or stalls, inspect that transaction's receipt before considering another submission.

## Read the result carefully

The stored record contains these fields:

- `claim`: the submitted claim after trimming surrounding whitespace.
- `sources`: the canonicalized source URLs. The record stores URLs, not the fetched page excerpts.
- `verdict`: `SUPPORTED`, `REFUTED`, `MIXED`, or `INSUFFICIENT`.
- `rationale`: a short explanation from the leader's model, limited to 500 characters. It is stored for context but is not part of validator agreement.
- `sources_used`: the number of usable, unique excerpts, from zero to three. This can be lower than the number of URLs submitted.
- `consensus_rule`: the rule label `validators_agree_on_verdict_and_unique_source_count`.

For each URL, the contract accepts a response only when the fetch succeeds with an HTTP 2xx status and produces non-empty UTF-8 text. It examines at most the first 6,000 decoded characters. Before counting an excerpt, it lowercases the text and collapses whitespace. If two pages produce identical truncated excerpts after that normalization, only the first excerpt is counted and sent as evidence; the later duplicate contributes an empty excerpt. For example, two URLs that mirror the same page can produce `sources_used: 1` even though both returned successfully. With fewer than two unique usable excerpts, the contract records `INSUFFICIENT` without asking the model to assess the claim.

When there are at least two unique excerpts, the leader's assessment uses the claim and fetched excerpts as untrusted data, with instructions to ignore any directions embedded in them. Validators independently repeat the fetch and model assessment. The contract accepts the result only when validators agree on both the verdict and `sources_used`. They do not compare the rationale, and the record does not preserve the excerpts themselves. Pages can change between fetches, so the sources, verdict, count, and stored explanation should be read together and checked against the linked pages.

`SUPPORTED`, `REFUTED`, and `MIXED` are model labels for the fetched evidence; inspect the linked pages to understand the assessment. `INSUFFICIENT` is recorded automatically when fewer than two unique excerpts are usable, and the model is also instructed to use it when relevant evidence is missing or a conflict cannot be resolved. Validator consensus means validators produced the same verdict and unique-source count under this contract's rules. It does not establish that the pages are accurate or that the verdict is true.

## Limits and safe use

Use sources you can inspect and trust, and read the evidence pages yourself. Public pages can be stale, incomplete, misleading, or prompt-injected. The contract performs basic URL syntax/host checks, but it cannot verify DNS resolution, DNS rebinding, or redirect destinations handled by the network fetch service. Those checks are not a guarantee that every destination is safe. Each assessment makes multiple web requests and LLM calls; it can be slow and consume testnet GEN. Consult the [official GenLayer network documentation](https://docs.genlayer.com/developers/networks) for current network and faucet details, and remember that the linked Studionet deployment is temporary.

For implementation details, see [`contracts/claim_lens.py`](../contracts/claim_lens.py), the [direct-mode tests](../tests/direct/test_claim_lens.py), and the [project README](../README.md).
