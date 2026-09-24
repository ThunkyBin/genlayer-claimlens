import json

import pytest


CONTRACT = "contracts/claim_lens.py"


def test_empty_contract_state(direct_deploy):
    contract = direct_deploy(CONTRACT)

    assert int(contract.get_assessment_count()) == 0
    assert contract.get_assessment(0) == ""


@pytest.mark.parametrize(
    "claim",
    ["", "   ", "x" * 281],
)
def test_assess_rejects_empty_or_oversized_claim(direct_vm, direct_deploy, claim):
    contract = direct_deploy(CONTRACT)

    with direct_vm.expect_revert("Claim must contain 1 to 280 characters"):
        contract.assess(claim, "https://one.example/a\nhttps://two.example/b")


@pytest.mark.parametrize(
    ("sources", "expected"),
    [
        ("", "Provide two or three distinct source URLs."),
        ("https://one.example/a", "Provide two or three distinct source URLs."),
        (
            "https://one.example/a\nhttps://two.example/b\nhttps://three.example/c\nhttps://four.example/d",
            "Provide two or three distinct source URLs.",
        ),
        ("https://one.example/a\nhttps://one.example/a", "Source URLs must be distinct."),
        (
            "https://one.example/a#first-section\nhttps://one.example/a#second-section",
            "Source URLs must be distinct.",
        ),
        ("https://ONE.example/a\nhttps://one.example/a", "Source URLs must be distinct."),
    ],
)
def test_assess_rejects_wrong_source_count_or_duplicates(direct_vm, direct_deploy, sources, expected):
    contract = direct_deploy(CONTRACT)

    with direct_vm.expect_revert(expected):
        contract.assess("A public claim", sources)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/article",
        "https://user:pass@example.com/article",
        "https://example.com:443/article",
        "https://localhost/article",
        "https://worker.localhost/article",
        "https://service.internal/article",
        "https://127.0.0.1/article",
        "https://0177.0.0.1/article",
        "https://0x7f.0.0.1/article",
        "https://10.0.0.1/article",
        "https://169.254.169.254/latest/meta-data/",
        "https://example..com/article",
        "https://-example.com/article",
        "https://example_.com/article",
        "https://éxample.com/article",
    ],
)
def test_assess_rejects_non_public_or_malformed_hosts(direct_vm, direct_deploy, url):
    contract = direct_deploy(CONTRACT)

    with direct_vm.expect_revert("Sources must be public HTTPS URLs"):
        contract.assess("A public claim", f"{url}\nhttps://two.example/article")


def test_assess_stores_agreed_verdict_and_leader_rationale(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"one\.example/a", {"status": 200, "body": "The first source supports the claim."})
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": "The second source supports the claim."})
    direct_vm.mock_llm(
        r".*",
        json.dumps({"verdict": "SUPPORTED", "rationale": "Both sources contain matching evidence."}),
    )

    assessment_id = contract.assess(
        "Both sources support this example claim.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert int(assessment_id) == 0
    assert int(contract.get_assessment_count()) == 1
    assert record["verdict"] == "SUPPORTED"
    assert record["rationale"] == "Both sources contain matching evidence."
    assert record["sources_used"] == 2
    assert record["consensus_rule"] == "validators_agree_on_verdict_and_unique_source_count"


def test_assess_returns_insufficient_when_two_sources_are_not_usable(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"one\.example/a", {"status": 503, "body": "Temporarily unavailable."})
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": "   "})

    assessment_id = contract.assess(
        "A claim without usable evidence.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert record["verdict"] == "INSUFFICIENT"
    assert record["sources_used"] == 0


def test_assess_does_not_count_duplicate_source_excerpts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"one\.example/a", {"status": 200, "body": "Identical copied source text."})
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": " identical   copied\nsource text. "})

    assessment_id = contract.assess(
        "A claim repeated by two URLs.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert record["verdict"] == "INSUFFICIENT"
    assert record["sources_used"] == 1


def test_assess_handles_a_source_fetch_exception(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": "Only one source returned evidence."})

    assessment_id = contract.assess(
        "A claim with an unavailable source.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert record["verdict"] == "INSUFFICIENT"
    assert record["sources_used"] == 1


def test_assess_handles_an_llm_exception(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"one\.example/a", {"status": 200, "body": "Evidence from source one."})
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": "Evidence from source two."})

    assessment_id = contract.assess(
        "A claim with unavailable model review.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert record["verdict"] == "INSUFFICIENT"
    assert record["sources_used"] == 2
    assert record["rationale"] == "The source review could not be completed."


def test_validator_rejects_a_different_unique_source_count(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    urls = ["https://one.example/a", "https://two.example/b", "https://three.example/c"]
    for index, url in enumerate(urls, start=1):
        host = url.split("//", 1)[1].split(".", 1)[0]
        direct_vm.mock_web(rf"{host}\.example", {"status": 200, "body": f"Evidence source {index}."})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "SUPPORTED", "rationale": "The sources support the claim."}))

    contract.assess("A claim supported by three sources.", "\n".join(urls))

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"one\.example", {"status": 503, "body": "Unavailable."})
    direct_vm.mock_web(r"two\.example", {"status": 200, "body": "Evidence source 2."})
    direct_vm.mock_web(r"three\.example", {"status": 200, "body": "Evidence source 3."})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "SUPPORTED", "rationale": "Two sources support the claim."}))

    assert direct_vm.run_validator() is False


def test_assess_normalizes_unrecognized_llm_verdict_to_insufficient(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(r"one\.example/a", {"status": 200, "body": "Public evidence from source one."})
    direct_vm.mock_web(r"two\.example/b", {"status": 200, "body": "Public evidence from source two."})
    direct_vm.mock_llm(r".*", json.dumps({"verdict": "CERTAIN", "rationale": "Untrusted model result."}))

    assessment_id = contract.assess(
        "A public claim.",
        "https://one.example/a\nhttps://two.example/b",
    )
    record = json.loads(contract.get_assessment(assessment_id))

    assert record["verdict"] == "INSUFFICIENT"
    assert record["sources_used"] == 2
