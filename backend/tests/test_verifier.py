"""Unit tests for IncidentVerifier in backend/app/reports/verifier.py."""

import concurrent.futures
import pytest
from app.reports.verifier import IncidentVerifier, ReportDict


def test_submit_first_report():
    verifier = IncidentVerifier()
    rep = verifier.submit_report(
        edge_id="edge_A_B",
        kind="road_flooded",
        reported_minute=10,
        description="Water 2 feet deep near crossing",
        reporter_hash="hash_user_1",
    )

    assert isinstance(rep, dict)
    assert isinstance(rep, ReportDict)
    assert rep["id"].startswith("rep_")
    assert rep.id == rep["id"]
    assert rep["edge_id"] == "edge_A_B"
    assert rep["kind"] == "road_flooded"
    assert rep["reported_minute"] == 10
    assert rep["description"] == "Water 2 feet deep near crossing"
    assert rep["reporter_hash"] == "hash_user_1"
    assert rep["status"] == "pending"
    assert rep["verification_score"] == 0.35
    assert rep["evidence_count"] == 1
    assert "edge_A_B" not in verifier.get_verified_blocked_edges()


def test_corroboration_within_15_minutes():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(
        edge_id="edge_1",
        kind="blocked",
        reported_minute=20,
        description="Fallen tree",
        reporter_hash="reporter_1",
    )
    assert r1.status == "pending"
    assert r1.verification_score == 0.35
    assert r1.evidence_count == 1

    # Second report within 15 minutes (at minute 28, diff=8 <= 15)
    r2 = verifier.submit_report(
        edge_id="edge_1",
        kind="blocked",
        reported_minute=28,
        description="Tree still blocking both lanes",
        reporter_hash="reporter_2",
    )

    # Must be deduplicated/corroborated onto the same report
    assert r2.id == r1.id
    assert r2["id"] == r1["id"]
    assert r2.evidence_count == 2
    assert r2["evidence_count"] == 2
    assert r2.verification_score == 0.70
    assert r2.status == "verified"
    assert "edge_1" in verifier.get_verified_blocked_edges()


def test_no_corroboration_beyond_15_minutes():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(
        edge_id="edge_2",
        kind="flooded",
        reported_minute=10,
    )
    assert r1.status == "pending"

    # Second report at minute 30 (diff=20 > 15)
    r2 = verifier.submit_report(
        edge_id="edge_2",
        kind="flooded",
        reported_minute=30,
    )
    assert r2.id != r1.id
    assert r1.evidence_count == 1
    assert r2.evidence_count == 1
    assert r1.status == "pending"
    assert r2.status == "pending"


def test_different_edges_do_not_corroborate():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(edge_id="edge_X", kind="hazard", reported_minute=10)
    r2 = verifier.submit_report(edge_id="edge_Y", kind="hazard", reported_minute=12)
    assert r1.id != r2.id
    assert r1.evidence_count == 1
    assert r2.evidence_count == 1


def test_operator_review_verify():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(edge_id="edge_rev_1", kind="blocked", reported_minute=5)
    assert r1.status == "pending"

    reviewed = verifier.review_report(
        report_id=r1.id,
        decision="verify",
        operator_name="Officer_Smith",
        notes="Confirmed by CCTV",
    )
    assert reviewed is not None
    assert reviewed.status == "verified"
    assert reviewed["status"] == "verified"
    assert reviewed.verification_score == 1.0
    assert reviewed["operator_name"] == "Officer_Smith"
    assert reviewed["notes"] == "Confirmed by CCTV"
    assert "edge_rev_1" in verifier.get_verified_blocked_edges()


def test_operator_review_reject():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(edge_id="edge_rev_2", kind="blocked", reported_minute=5)
    assert r1.status == "pending"

    reviewed = verifier.review_report(
        report_id=r1.id,
        decision="reject",
        operator_name="Officer_Jones",
    )
    assert reviewed is not None
    assert reviewed.status == "rejected"
    assert reviewed.verification_score == 0.0
    assert reviewed["operator_name"] == "Officer_Jones"
    assert "edge_rev_2" not in verifier.get_verified_blocked_edges()


def test_operator_review_nonexistent():
    verifier = IncidentVerifier()
    result = verifier.review_report("rep_nonexistent", "verify")
    assert result is None


def test_operator_review_invalid_decision():
    verifier = IncidentVerifier()
    r = verifier.submit_report(edge_id="edge_test", reported_minute=0)
    with pytest.raises(ValueError):
        verifier.review_report(r.id, "maybe")


def test_list_reports_filtering():
    verifier = IncidentVerifier()
    r1 = verifier.submit_report(edge_id="e1", reported_minute=10)  # pending
    r2 = verifier.submit_report(edge_id="e2", reported_minute=10)
    verifier.review_report(r2.id, "verify")  # verified
    r3 = verifier.submit_report(edge_id="e3", reported_minute=10)
    verifier.review_report(r3.id, "reject")  # rejected

    all_reports = verifier.list_reports()
    assert len(all_reports) == 3

    pending_reports = verifier.list_reports(status_filter="pending")
    assert len(pending_reports) == 1
    assert pending_reports[0].id == r1.id

    verified_reports = verifier.list_reports(status_filter="verified")
    assert len(verified_reports) == 1
    assert verified_reports[0].id == r2.id

    # Test status parameter alias
    rejected_reports = verifier.list_reports(status="rejected")
    assert len(rejected_reports) == 1
    assert rejected_reports[0].id == r3.id

    # Test 'all' filter returns everything
    assert len(verifier.list_reports(status_filter="all")) == 3


def test_get_verified_blocked_edges_filtering():
    verifier = IncidentVerifier()
    # 1. Blocked kind auto-verified
    verifier.submit_report(edge_id="edge_flood", kind="road_flooded", reported_minute=10)
    verifier.submit_report(edge_id="edge_flood", kind="road_flooded", reported_minute=15)

    # 2. Blocked kind manually verified
    r2 = verifier.submit_report(edge_id="edge_closure", kind="bridge_closed", reported_minute=5)
    verifier.review_report(r2.id, "verify")

    # 3. Clear report verified -> should NOT be in blocked edges
    r3 = verifier.submit_report(edge_id="edge_clear", kind="clear", reported_minute=5)
    verifier.review_report(r3.id, "verify")

    # 4. Pending report -> should NOT be in blocked edges
    verifier.submit_report(edge_id="edge_pending", kind="blocked", reported_minute=5)

    # 5. Rejected report -> should NOT be in blocked edges
    r5 = verifier.submit_report(edge_id="edge_rejected", kind="blocked", reported_minute=5)
    verifier.review_report(r5.id, "reject")

    blocked = verifier.get_verified_blocked_edges()
    assert "edge_flood" in blocked
    assert "edge_closure" in blocked
    assert "edge_clear" not in blocked
    assert "edge_pending" not in blocked
    assert "edge_rejected" not in blocked


def test_thread_safety_concurrent_submissions():
    verifier = IncidentVerifier()

    def submit_task(edge_idx: int, minute: int):
        return verifier.submit_report(
            edge_id=f"edge_{edge_idx}",
            kind="road_flooded",
            reported_minute=minute,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = []
        # Submit 20 reports for edge_0 within 15 mins -> should all corroborate onto 1 report
        for i in range(20):
            futures.append(executor.submit(submit_task, 0, 10))
        for f in concurrent.futures.as_completed(futures):
            f.result()

    rep = verifier.get_report(list(verifier.reports.keys())[0])
    assert rep is not None
    assert rep.status == "verified"
    assert rep.evidence_count == 20
    assert rep.verification_score == 1.0


def test_report_dict_compatibility():
    verifier = IncidentVerifier()
    r = verifier.submit_report(edge_id="e_compat", reported_minute=5)

    # Dict subscripting
    assert r["edge_id"] == "e_compat"
    r["custom_field"] = 42
    assert r["custom_field"] == 42

    # Attribute access
    assert r.edge_id == "e_compat"
    assert r.custom_field == 42
    r.custom_attr = "hello"
    assert r["custom_attr"] == "hello"

    # model_dump() and dict()
    d = r.model_dump()
    assert isinstance(d, dict)
    assert d["edge_id"] == "e_compat"
    assert r.dict()["edge_id"] == "e_compat"
