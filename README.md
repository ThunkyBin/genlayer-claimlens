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
4. GenLayer consensus accepts the result only when validators agree on the verdict and unique usable source count.
5. The contract stores the verdict and the leader’s short rationale under an assessment ID.

Validator consensus covers the verdict and the number of unique usable source excerpts (whitespace and letter case are normalized). The leader's explanatory rationale is stored for context and is not independently compared; treat it as an unverified model summary.

## Use responsibly

This is an experimental research aid, not a truth oracle. Web pages can be incomplete, misleading, stale, or prompt-injected. Consensus means validators agreed on a model-produced label under this contract’s rules; it does not prove the underlying claim is true.

Use only public, non-sensitive claims and sources. Do not use this prototype for medical, legal, financial, employment, or other high-impact decisions. Each assessment performs multiple web requests and LLM calls, so it can be slow and consume testnet GEN.

The contract applies strict basic URL checks: HTTPS only, ASCII DNS names, no URL credentials, non-default ports, local suffixes, or IP-literal hosts (including common hexadecimal and numeric forms). This contract cannot verify DNS resolution, rebinding, or redirect destinations enforced by the GenLayer fetch service. Use only public, non-sensitive sources; do not treat this prototype as production-ready until the network's outbound-fetch and redirect safeguards have been independently verified.

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
    .\scripts\check.ps1

The local check script runs GenVM safety/SDK validation, type checking, and fast mocked direct-mode contract tests. It can be used when GitHub does not start hosted jobs.

## Web interface

The static app is in `frontend/`. It supports read-only assessment lookup and lets a user submit a review through their own EIP-1193 wallet. It never stores wallet keys. Every write requires an explicit confirmation in the app; the wallet shows any required fee before the user approves the transaction.

    cd frontend
    npm ci
    npm run dev

To publish without a GitHub Actions runner, build with `npm run build` from `frontend/`. Vite writes the GitHub Pages site to `docs/`; publish the `main` branch's `/docs` directory. For a Vercel root deployment, run `npm run build:vercel` from `frontend/` and deploy its `dist/` output. The app requires a ClaimLens contract deployed separately on the selected network; the Studionet test deployment is recorded below.

The browser app offers Bradbury, Asimov, and Studionet. Verify current network details in the official [GenLayer network documentation](https://docs.genlayer.com/developers/networks). Writes can require test GEN and may take time to finalize; reads do not submit a transaction.

This repository includes the GenLayer Codex skills for contract authoring, linting, and CLI deployment under .agents/skills. They were installed from the official [GenLayer skills repository](https://github.com/genlayerlabs/skills).

## Deploy on a GenLayer test network

1. Open the official GenLayer Studio at https://studio.genlayer.com.
2. Select a test network supported by the Studio, then load contracts/claim_lens.py.
3. Deploy the ClaimLens contract with no constructor arguments.
4. Call assess with a claim and at least two public source URLs.
5. Read the returned assessment ID with get_assessment.

Check current RPC, chain ID, and faucet information in the official [GenLayer network documentation](https://docs.genlayer.com/developers/networks). Bradbury is the recommended production-like test network; Asimov is for infrastructure testing. Both currently list chain ID 4221.

### Verified Studionet deployment

- Network: hosted Studionet, chain ID 61999 (temporary development network; not the persistent Bradbury testnet).
- Contract: `0x56Be71883DC0154c28a471c1B82481ABfEB21D5F` ([Explorer](https://explorer-studio.genlayer.com/address/0x56Be71883DC0154c28a471c1B82481ABfEB21D5F)).
- Deployment transaction: `0x0711c89d30641b0a6e9781c5c2cb3b81254dcbbde1112941f84bd65fab43d757` ([Explorer](https://explorer-studio.genlayer.com/tx/0x0711c89d30641b0a6e9781c5c2cb3b81254dcbbde1112941f84bd65fab43d757)).
- Successful assessment: ID `1`, verdict `SUPPORTED`; transaction `0xd0995c2bc651ec399476357cc24b6dfbee2d49b264f3195838afe7bfacc0d26c` ([Explorer](https://explorer-studio.genlayer.com/tx/0xd0995c2bc651ec399476357cc24b6dfbee2d49b264f3195838afe7bfacc0d26c)).
- On-chain `get_assessment_count()` returned `3` after a further full-consensus write. Assessment ID `2` finalized with verdict `SUPPORTED`, citing two official GenLayer documentation sources; transaction `0x3377bdcc19f70159fa02e96b956636078be5f6ebcc98951d8c2e32576a12fa9a` ([Explorer](https://explorer-studio.genlayer.com/tx/0x3377bdcc19f70159fa02e96b956636078be5f6ebcc98951d8c2e32576a12fa9a)). The earlier ID `0` result is `INSUFFICIENT` because the rendered documentation shell omitted the relevant text.
- The writes used the hosted Studio account. Its built-in faucet credited `10` test GEN before the ID `2` write. This account is separate from the user's OKX wallet; no OKX wallet was connected or funded.

## Example input

Claim:

    The current documentation lists the Bradbury chain ID as 4221.

Sources, separated by a newline:

    https://docs.genlayer.com/developers/networks
    https://explorer-bradbury.genlayer.com

The verdict can be MIXED or INSUFFICIENT if the sources do not contain enough aligned evidence.

## License

MIT. See LICENSE.
