# ClaimLens

ClaimLens is a research prototype for checking a public claim against two or three public web sources with a GenLayer Intelligent Contract.

The contract fetches each source, asks an LLM for a structured assessment, and has validators independently repeat the assessment. The on-chain result is one of:

- SUPPORTED
- REFUTED
- MIXED
- INSUFFICIENT

ClaimLens is deliberately non-custodial: it has no token balances, payments, or payout logic.

## How it works

1. A caller submits a claim and two or three HTTPS source URLs.
2. The contract fetches bounded text excerpts from those sources.
3. The leader and validators independently assess the same evidence.
4. GenLayer consensus accepts the result only when validators agree on the verdict.
5. The contract stores the verdict and the leader’s short rationale under an assessment ID.

The validator consensus covers the verdict. The explanatory rationale is stored for context and may differ between model runs.

## Use responsibly

This is an experimental research aid, not a truth oracle. Web pages can be incomplete, misleading, stale, or prompt-injected. Consensus means validators agreed on a model-produced label under this contract’s rules; it does not prove the underlying claim is true.

Use only public, non-sensitive claims and sources. Do not use this prototype for medical, legal, financial, employment, or other high-impact decisions. Each assessment performs multiple web requests and LLM calls, so it can be slow and consume testnet GEN.

The contract applies basic URL checks: HTTPS only, no URL credentials, localhost, local suffixes, or IP-literal hosts. This is not a full SSRF defense. Deploy only to a test network and review the source before use.

## Contract interface

- assess(claim, source_urls_text) writes a new assessment and returns its ID.
- get_assessment(assessment_id) returns the stored JSON record, or an empty string if it does not exist.
- get_assessment_count() returns the number of stored assessments.

Pass source URLs as newline-separated text. The contract accepts two or three distinct URLs, each no longer than 2,048 characters. Claims are limited to 280 characters.

## Development

Requirements: Python 3.12 or newer.

    python -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install -r requirements-dev.txt
    genvm-lint check contracts/claim_lens.py
    genvm-lint typecheck contracts/claim_lens.py

The GenVM linter performs fast safety checks and validates the contract against the SDK version declared in its dependency header.

This repository includes the GenLayer Codex skills for contract authoring, linting, and CLI deployment under .agents/skills. They were installed from the official [GenLayer skills repository](https://github.com/genlayerlabs/skills).

## Deploy on a GenLayer test network

1. Open the official GenLayer Studio at https://studio.genlayer.com.
2. Select a test network supported by the Studio, then load contracts/claim_lens.py.
3. Deploy the ClaimLens contract with no constructor arguments.
4. Call assess with a claim and at least two public source URLs.
5. Read the returned assessment ID with get_assessment.

Check current RPC, chain ID, and faucet information in the official [GenLayer network documentation](https://docs.genlayer.com/developers/networks). Bradbury is the recommended production-like test network; Asimov is for infrastructure testing. Both currently list chain ID 4221.

## Example input

Claim:

    The current documentation lists the Bradbury chain ID as 4221.

Sources, separated by a newline:

    https://docs.genlayer.com/developers/networks
    https://explorer-bradbury.genlayer.com

The verdict can be MIXED or INSUFFICIENT if the sources do not contain enough aligned evidence.

## License

MIT. See LICENSE.
