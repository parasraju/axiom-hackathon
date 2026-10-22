"""Incident reports verification pipeline with deduplication and corroboration scoring."""

from __future__ import annotations

import threading
import uuid
from typing import Any, Dict, List, Optional, Set


NON_BLOCKED_KINDS: Set[str] = {
    "clear",
    "cleared",
    "open",
    "normal",
    "passable",
    "reopened",
    "safe",
}


class ReportDict(dict):
    """Dictionary representing an incident report with attribute access and serialization helpers."""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'ReportDict' object has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value

    def __delattr__(self, name: str) -> None:
        try:
            del self[name]
        except KeyError:
            raise AttributeError(f"'ReportDict' object has no attribute '{name}'")

    def model_dump(self) -> Dict[str, Any]:
        """Support Pydantic v2 model_dump() serialization."""
        return dict(self)

    def dict(self) -> Dict[str, Any]:
        """Support Pydantic v1 dict() serialization."""
        return dict(self)


class IncidentVerifier:
    """Manages citizen and operator incident reports with deduplication and corroboration scoring."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.reports: Dict[str, ReportDict] = {}

    def submit_report(
        self,
        edge_id: str,
        kind: str = "road_flooded",
        reported_minute: int = 0,
        description: str = "",
        reporter_hash: str = "anonymous",
    ) -> ReportDict:
        """Submit a new hazard report with deduplication and corroboration scoring.

        Checks existing pending reports for the same edge_id within 15 minutes.
        If a nearby report exists:
          - Increments existing report's evidence_count
          - Increases verification_score by 0.35
          - If verification_score >= 0.70, promotes status from 'pending' to 'verified'
          - Returns the updated report dictionary.
        Otherwise:
          - Creates a new report with status 'pending', verification_score 0.35, evidence_count 1
          - Returns the new report dictionary.
        """
        with self._lock:
            edge_id_str = str(edge_id)
            minute = int(reported_minute)

            # Check existing pending or active verified reports for the same edge_id within 15 minutes
            for rep in self.reports.values():
                if (
                    rep.get("edge_id") == edge_id_str
                    and rep.get("status") in ("pending", "verified")
                    and abs(rep.get("reported_minute", 0) - minute) <= 15
                ):
                    # Corroborating evidence
                    rep["evidence_count"] += 1
                    new_score = round(rep["verification_score"] + 0.35, 2)
                    rep["verification_score"] = min(1.0, new_score)

                    if rep["verification_score"] >= 0.70 and rep.get("status") == "pending":
                        rep["status"] = "verified"

                    if description and not rep.get("description"):
                        rep["description"] = description

                    # Track corroborating reporter hashes
                    corroborators = rep.setdefault("corroborating_reporters", [])
                    if reporter_hash not in corroborators:
                        corroborators.append(reporter_hash)

                    return rep

            # Else, create new report
            report_id = f"rep_{uuid.uuid4().hex[:8]}"
            new_report = ReportDict(
                id=report_id,
                report_id=report_id,
                reporter_hash=reporter_hash,
                edge_id=edge_id_str,
                kind=kind,
                description=description,
                reported_minute=minute,
                status="pending",
                verification_score=0.35,
                evidence_count=1,
                operator_name=None,
                reviewed_by=None,
                notes="",
                corroborating_reporters=[reporter_hash],
            )
            self.reports[report_id] = new_report
            return new_report

    def review_report(
        self,
        report_id: str,
        decision: str,
        operator_name: str = "Authority_Officer",
        notes: str = "",
    ) -> Optional[ReportDict]:
        """Operator manual review of an incident report.

        decision:
          'verify' -> status='verified', verification_score=1.0
          'reject' -> status='rejected', verification_score=0.0
        """
        with self._lock:
            rep = self.reports.get(report_id)
            if not rep:
                return None

            dec = decision.strip().lower()
            if dec in ("verify", "verified"):
                rep["status"] = "verified"
                rep["verification_score"] = 1.0
            elif dec in ("reject", "rejected"):
                rep["status"] = "rejected"
                rep["verification_score"] = 0.0
            else:
                raise ValueError(
                    f"Invalid decision '{decision}'. Expected 'verify' or 'reject'."
                )

            rep["operator_name"] = operator_name
            rep["reviewed_by"] = operator_name
            if notes:
                rep["notes"] = notes
            return rep

    def get_verified_blocked_edges(self) -> Set[str]:
        """Return set of edge IDs currently verified as blocked/flooded."""
        with self._lock:
            blocked: Set[str] = set()
            for rep in self.reports.values():
                if rep.get("status") == "verified":
                    kind = str(rep.get("kind", "")).lower()
                    if kind in NON_BLOCKED_KINDS:
                        continue
                    blocked.add(str(rep.get("edge_id")))
            return blocked

    def list_reports(
        self,
        status_filter: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[ReportDict]:
        """List reports, optionally filtered by status."""
        filter_val = status_filter if status_filter is not None else status
        with self._lock:
            if filter_val and filter_val != "all":
                return [r for r in self.reports.values() if r.get("status") == filter_val]
            return list(self.reports.values())

    def get_report(self, report_id: str) -> Optional[ReportDict]:
        """Retrieve a single report by ID."""
        with self._lock:
            return self.reports.get(report_id)

    def clear(self) -> None:
        """Clear all stored reports."""
        with self._lock:
            self.reports.clear()
