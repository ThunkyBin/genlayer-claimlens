"""Controlled direct-mode evaluation of ClaimLens validator agreement."""

import json

import pytest


CONTRACT = "contracts/claim_lens.py"
SOURCES = [
    ("https://one.example/a", r"one\.example/a"),
    ("https://two.example/b", r"two\.example/b"),
    ("https://three.example/c", r"three\.example/c"),
]
LEADER_BODIES = [
    "The official notice confirms the claim for this example.",
    "A second report also confirms the claim for this example.",
    "A third record confirms the same claim for this example.",
]


@pytest.mark.parametrize(
    ("case", "validator_bodies", "validator_verdict", "expected_agreement"),
    [
        (
            "changed evidence, same verdict and excerpt count",
            [
                "A later page describes an unrelated event.",
                "A different report discusses another subject.",
                "A third page contains new unrelated text.",
            ],
            "SUPPORTED",
            True,
        ),
        (
            "same excerpt count, different verdict",
            LEADER_BODIES,
            "REFUTED",
            False,
        ),
        (
            "same verdict, fewer usable excerpts",
            ["Changed evidence one.", "Changed evidence two.", None],
            "SUPPORTED",
            False,
        ),
    ],
    ids=["different-evidence-accepted", "different-verdict-rejected", "different-count-rejected"],
)
def test_consensus_compares_only_verdict_and_unique_excerpt_count(
    direct_vm,
    direct_deploy,
    case,
    validator_bodies,
    validator_verdict,
    expected_agreement,
):
    """Change validator fetches after the leader result and observe the gate."""
    contract = direct_deploy(CONTRACT)

    for (_, pattern), body in zip(SOURCES, LEADER_BODIES, strict=True):
        direct_vm.mock_web(pattern, {"status": 200, "body": body})
    direct_vm.mock_llm(
        r".*",
        json.dumps({"verdict": "SUPPORTED", "rationale": "Leader rationale."}),
    )

    assessment_id = contract.assess(
        "Three public sources support this example claim.",
        "\n".join(url for url, _ in SOURCES),
    )
    record = json.loads(contract.get_assessment(assessment_id))
    assert record["verdict"] == "SUPPORTED"
    assert record["sources_used"] == 3

    direct_vm.clear_mocks()
    for (_, pattern), body in zip(SOURCES, validator_bodies, strict=True):
        if body is None:
            response = {"status": 503, "body": "Unavailable."}
        else:
            response = {"status": 200, "body": body}
        direct_vm.mock_web(pattern, response)
    direct_vm.mock_llm(
        r".*",
        json.dumps({"verdict": validator_verdict, "rationale": "Validator rationale."}),
    )

    assert direct_vm.run_validator() is expected_agreement, case
