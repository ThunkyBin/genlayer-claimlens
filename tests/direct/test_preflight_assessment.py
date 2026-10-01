import pytest

from scripts.preflight_assessment import validate_assessment_inputs


def test_preflight_returns_canonical_contract_arguments():
    result = validate_assessment_inputs(
        "  A public claim  ",
        ["https://ONE.example/a#section", "https://two.example/b"],
    )

    assert result["claim"] == "A public claim"
    assert result["source_urls"] == ["https://one.example/a", "https://two.example/b"]
    assert result["call"] == {
        "method": "assess",
        "args": ["A public claim", "https://one.example/a\nhttps://two.example/b"],
    }


@pytest.mark.parametrize(
    ("claim", "sources", "message"),
    [
        ("  ", ["https://one.example/a", "https://two.example/b"], "Claim must contain"),
        ("x" * 281, ["https://one.example/a", "https://two.example/b"], "Claim must contain"),
        ("A claim", ["https://one.example/a"], "Provide two or three source URLs"),
        (
            "A claim",
            ["https://one.example/a#first", "https://ONE.example/a#second"],
            "Source URLs must be distinct",
        ),
        (
            "A claim",
            ["http://one.example/a", "https://two.example/b"],
            "Sources must be public HTTPS URLs",
        ),
    ],
)
def test_preflight_rejects_inputs_the_contract_will_reject(claim, sources, message):
    with pytest.raises(ValueError, match=message):
        validate_assessment_inputs(claim, sources)
