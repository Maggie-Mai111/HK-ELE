#!/usr/bin/env python3
"""Read-only data service reused by the HK-ELE public deployment candidate."""

from __future__ import annotations

from collections import defaultdict
import json
import sqlite3
import unicodedata
from pathlib import Path

from .teacher_export import teacher_list_xlsx


API_VERSION = "hk-ele-public-deployment-api/6.0.0"
DB_NAME = "hkele_general_source_corrected_candidate_local_product_20260914_v1.sqlite"
PAGE_SIZES = {10, 25, 50, 100}
SORTS = {
    "overall": "f.overall_frequency_order IS NULL,f.overall_frequency_order ASC,f.baseword_key ASC",
    "hk": "f.current_hk_frequency_rank IS NULL,f.current_hk_frequency_rank ASC,f.baseword_key ASC",
    "az": "f.display_family COLLATE NOCASE ASC,f.baseword_key ASC",
}
SCOPES = {
    "core": "f.candidate_member=1",
    "broader": "f.reference_member=1",
    "full": "1=1",
    "main": "f.candidate_member=1",
    "extended": "f.reference_member=1",
}


def norm(value: str) -> str:
    return unicodedata.normalize("NFKC", str(value or "").strip()).casefold()


class ReadOnlyConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, traceback):
        try:
            return bool(super().__exit__(exc_type, exc, traceback))
        finally:
            self.close()


class Service:
    def __init__(self, database: Path):
        self.database = database.resolve()
        if not self.database.is_file():
            raise RuntimeError(f"Database not found: {self.database}")

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            f"file:{self.database.as_posix()}?mode=ro",
            uri=True,
            factory=ReadOnlyConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        return connection

    @staticmethod
    def family_dict(row: sqlite3.Row, technical: bool = False) -> dict:
        data = dict(row)
        technical_details = {
            "external_level_reference_raw": data.pop("external_level_reference_display", None),
            "vxgl_display_raw": data.pop("vxgl_display", None),
            "vxgl_unique_values_raw_json": data.pop("vxgl_unique_values_json", "[]"),
            "vxgl_varies_by_word": data.pop("vxgl_varies_by_word", None),
        }
        data["external_level_reference_display"] = data.pop("external_level_reference_teacher_display", None)
        data["external_level_teacher_labels"] = json.loads(data.pop("external_level_teacher_labels_json", "[]") or "[]")
        if technical:
            data["technical_details"] = technical_details
        for flag in (
            "is_main", "is_extended", "is_additional_extension", "member_n3724",
            "member_n4093", "member_n4495", "member_n5078", "candidate_member",
            "reference_member", "display_blocked",
        ):
            data[flag] = bool(data.get(flag))
        for flag in ("awl", "earlier_hk"):
            if data.get(flag) is not None:
                data[flag] = bool(data[flag])
        return data

    @staticmethod
    def form_dict(row: sqlite3.Row, technical: bool = False) -> dict:
        data = dict(row)
        technical_details = {
            "external_level_reference_raw": data.pop("external_level_reference", None),
            "external_level_values_raw_json": data.pop("external_level_values_json", "[]"),
            "recorded_morphology_raw": data.pop("recorded_morphology", None),
            "root_raw": data.pop("root", None),
            "root_teacher_display_package62": data.pop("root_teacher_display", None),
            "gpt_root_raw": data.pop("gpt_root_raw", None),
            "greek_latin_root_1_raw": data.pop("greek_latin_root_1_raw", None),
            "gpt_root_values_json": data.pop("gpt_root_values_json", "[]"),
            "greek_latin_root_1_values_json": data.pop("greek_latin_root_1_values_json", "[]"),
            "root_provenance_json": data.pop("root_provenance_json", None),
            "prefix_provenance_json": data.pop("prefix_provenance_json", None),
            "suffix_provenance_json": data.pop("suffix_provenance_json", None),
            "morphology_conflict": data.pop("morphology_conflict", None),
            "linguistic_review_status": data.pop("linguistic_review_status", None),
        }
        data["external_level_reference"] = data.pop("external_level_reference_teacher_display", None)
        data["external_level_teacher_labels"] = json.loads(data.pop("external_level_teacher_labels_json", "[]") or "[]")
        data["root"] = data.pop("root_teacher_display_unified", None)
        data["root_meaning"] = data.pop("root_meaning_teacher_display", None)
        if technical:
            data["technical_details"] = technical_details
        for flag in (
            "member_n3724", "member_n4093", "member_n4495", "member_n5078",
            "candidate_member", "reference_member", "morphology_conflict",
            "form_familiarity_review_required",
        ):
            if data.get(flag) is not None:
                data[flag] = bool(data[flag])
        for flag in ("awl", "earlier_hk"):
            if data.get(flag) is not None:
                data[flag] = bool(data[flag])
        return data

    def meta(self) -> dict:
        with self.connect() as connection:
            metadata = {row["key"]: row["value"] for row in connection.execute("SELECT * FROM metadata")}
        return {"api_version": API_VERSION, "database_mode": "read-only", "metadata": metadata}

    def health(self) -> dict:
        """Confirm that the registered database can be opened read-only and queried."""
        with self.connect() as connection:
            connection.execute("SELECT 1").fetchone()
        return {"status": "ok", "api_version": API_VERSION, "database_mode": "read-only"}

    def sources(self) -> dict:
        with self.connect() as connection:
            sources = [dict(row) for row in connection.execute("SELECT * FROM source_registry ORDER BY source_id")]
            fields = [dict(row) for row in connection.execute("SELECT * FROM field_guide WHERE field_name != 'linguistic_review_status' ORDER BY display_order")]
        return {"api_version": API_VERSION, "sources": sources, "fields": fields}

    def filters(self) -> dict:
        with self.connect() as connection:
            common = [dict(row) for row in connection.execute(
                "SELECT * FROM common_word_review_register ORDER BY registered_order"
            )]
            external = [row["teacher_label"] for row in connection.execute(
                "SELECT teacher_label FROM external_level_display_option ORDER BY display_order"
            )]
        return {
            "api_version": API_VERSION,
            "first_seen_options": ["Primary", "Secondary", *[f"P{i}" for i in range(1, 7)], *[f"S{i}" for i in range(1, 7)], "No record"],
            "external_level_options": external + ["No record"],
            "academic_subject_options": ["AWL", "MSVL", "English Grammar and Writing", "Health", "Mathematics", "Science", "Social Studies and History", "No record"],
            "common_word_register": {
                "count": len(common),
                "tokens": [row["token"] for row in common],
                "rows": common,
                "source_register_sha256": common[0]["source_register_sha256"] if common else None,
            },
        }

    def families(self, scope: str, sort: str, page: int, page_size: int) -> dict:
        where = SCOPES[scope] + " AND f.display_blocked=0"
        offset = (page - 1) * page_size
        with self.connect() as connection:
            available = connection.execute(f"SELECT COUNT(*) FROM family AS f WHERE {where}").fetchone()[0]
            total = connection.execute(f"SELECT COUNT(*) FROM family AS f WHERE {SCOPES[scope]}").fetchone()[0]
            rows = connection.execute(
                f"SELECT f.* FROM family AS f WHERE {where} ORDER BY {SORTS[sort]} LIMIT ? OFFSET ?",
                (page_size, offset),
            ).fetchall()
            keys = [row["baseword_key"] for row in rows]
            form_evidence_by_key: dict[str, list[sqlite3.Row]] = defaultdict(list)
            if keys:
                placeholders = ",".join("?" for _ in keys)
                evidence = connection.execute(
                    f"""SELECT baseword_key,normalized_form,root,root_meaning,prefix,suffix,
                               root_teacher_display_unified,root_meaning_teacher_display,
                               root_meaning_alignment_status,morphology_conflict
                          FROM form WHERE baseword_key IN ({placeholders})
                         ORDER BY baseword_key,
                                  CASE WHEN normalized_form=baseword_key THEN 0 ELSE 1 END,
                                  normalized_form,form_key""",
                    keys,
                )
                for form_row in evidence:
                    form_evidence_by_key[form_row["baseword_key"]].append(form_row)
            populations = {
                row["key"]: int(row["value"])
                for row in connection.execute("SELECT key,value FROM metadata WHERE key LIKE '%_count'")
                if str(row["value"]).isdigit()
            }
        families = []
        for row in rows:
            value = self.family_dict(row)
            family_forms = form_evidence_by_key.get(row["baseword_key"], [])
            display_key = norm(value["display_family"])
            representative = next((item for item in family_forms if item["normalized_form"] == display_key), None)
            representative = representative or next((item for item in family_forms if item["normalized_form"] == row["baseword_key"]), None)
            representative = representative or (family_forms[0] if family_forms else None)
            value["browse_external_level_reference"] = value.get("external_level_reference_display")
            value["browse_root"] = representative["root_teacher_display_unified"] if representative else None
            value["browse_root_meaning"] = (
                representative["root_meaning_teacher_display"]
                if representative and representative["root_meaning_alignment_status"] == "MATCHED_UNIQUE_EXACT"
                else None
            )
            value["browse_prefix"] = representative["prefix"] if representative else None
            value["browse_suffix"] = representative["suffix"] if representative else None
            families.append(value)
        return {
            "api_version": API_VERSION,
            "scope": scope,
            "sort": sort,
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "available_items": available,
            "populations": populations,
            "families": families,
        }

    def family(self, key: str) -> dict | None:
        key = norm(key)
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM family WHERE baseword_key=?", (key,)).fetchone()
            if row is None or row["display_blocked"]:
                return None
            family = self.family_dict(row, technical=True)
            forms = [self.form_dict(value, technical=True) for value in connection.execute(
                """SELECT * FROM form WHERE baseword_key=?
                   ORDER BY CASE WHEN normalized_form=baseword_key THEN 0 ELSE 1 END,normalized_form,form_key""",
                (key,),
            )]
        return {"api_version": API_VERSION, "family": family, "forms": forms}

    @staticmethod
    def exact_form_evidence(connection: sqlite3.Connection, key: str, normalized: str) -> dict | None:
        rows = connection.execute(
            "SELECT * FROM form WHERE baseword_key=? AND normalized_form=? ORDER BY form_key",
            (key, normalized),
        ).fetchall()
        if len(rows) == 1:
            return Service.form_dict(rows[0])
        fallback = connection.execute(
            """SELECT * FROM word_first_seen_evidence
               WHERE baseword_key=? AND normalized_wordform=? AND admitted=1
               ORDER BY evidence_id""",
            (key, normalized),
        ).fetchall()
        if len(fallback) != 1:
            return None
        row = fallback[0]
        return {
            "form_key": None,
            "baseword_key": key,
            "form": normalized,
            "normalized_form": normalized,
            "first_seen_hk_textbooks": row["earliest_observed_level"],
            "first_seen_mapping_basis": row["mapping_basis"],
            "first_seen_admission_status": row["admission_status"],
            "external_level_reference": None,
            "academic_subject_evidence": None,
            "awl": None,
            "msvl": None,
            "root": None,
            "root_meaning": None,
            "prefix": None,
            "suffix": None,
            "record_status": "ADMITTED_EXACT_BASEWORD_FALLBACK_NOT_A_RECORDED_BAWF_FORM",
        }

    def _search_with_connection(self, connection: sqlite3.Connection, query: str) -> dict:
        submitted, normalized = query, norm(query)
        empty = {
            "submitted_query": submitted,
            "normalized_query": normalized,
            "best_priority": None,
            "best_owner_count": 0,
            "owners": [],
            "alternatives": [],
        }
        if not normalized:
            return {"status": "UNMATCHED", **empty}
        apostrophe_normalized = normalized.translate(str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "＇": "'"}))
        if submitted == "US":
            return {
                "status": "BLOCKED", **empty,
                "identity_exception": {
                    "observed_word": submitted,
                    "current_classification": "COUNTRY_ABBREVIATION_OR_OTHER_CONTEXT_REQUIRED",
                    "current_family_owner": "trial:abbreviation:united_states (non-ranking identity)",
                    "historical_or_resource_finding": "Upper-case US is not assigned to pronoun us or legacy family u.",
                    "teacher_display": "US requires contextual classification and is not counted as the pronoun us.",
                    "action": "RETAIN_UNRESOLVED_IN_TEXT_CHECK",
                },
            }
        if apostrophe_normalized in {"i'll", "won't", "hadn't"}:
            return {
                "status": "BLOCKED", **empty,
                "identity_exception": {
                    "observed_word": submitted,
                    "current_classification": "REGISTERED_CONTRACTION_ROUTE",
                    "current_family_owner": "grammar relation; not the recorded spelling family",
                    "historical_or_resource_finding": "The final candidate evidence removed the conflicting family-frequency attribution.",
                    "teacher_display": "This contraction is retained for review and is not assigned to the similarly spelled family.",
                    "action": "RETAIN_UNRESOLVED_IN_TEXT_CHECK",
                },
            }
        if normalized == "does":
            return {
                "status": "BLOCKED", **empty,
                "identity_exception": {
                    "observed_word": submitted,
                    "current_classification": "CONTEXT_REQUIRED_DO_VERB_OR_DOE_PLURAL",
                    "current_family_owner": "context-dependent: do / doe / unresolved",
                    "historical_or_resource_finding": "The final candidate evidence assigns corpus occurrences by context; this exact-match interface does not reproduce that contextual classifier.",
                    "teacher_display": "does requires contextual classification and is retained for review here.",
                    "action": "RETAIN_UNRESOLVED_IN_TEXT_CHECK",
                },
            }
        surface_key = "trial:pronoun:i" if normalized == "i" else "trial:pronoun:us" if normalized == "us" else None
        if surface_key:
            row = connection.execute("SELECT * FROM family WHERE baseword_key=?", (surface_key,)).fetchone()
            if row is not None:
                owner = self.family_dict(row)
                owner.update({
                    "blocked": False,
                    "match_classes": ["FINAL_CANDIDATE_SURFACE_ONLY"],
                    "matched_forms": [submitted],
                    "matched_form_evidence": None,
                })
                return {
                    "status": "RESOLVED",
                    "submitted_query": submitted,
                    "normalized_query": normalized,
                    "best_priority": 0,
                    "best_owner_count": 1,
                    "owners": [owner],
                    "alternatives": [],
                    "identity_exception": None,
                }
        rows = connection.execute(
            """SELECT s.*,f.* FROM search_index AS s JOIN family AS f USING(baseword_key)
               WHERE s.normalized_query=?
               ORDER BY s.match_priority,s.baseword_key,s.source_record_id""",
            (normalized,),
        ).fetchall()
        if not rows:
            exception = connection.execute(
                "SELECT * FROM text_identity_exception WHERE observed_word=?",
                (normalized,),
            ).fetchone()
            return {
                "status": "UNMATCHED",
                **empty,
                "identity_exception": dict(exception) if exception else None,
            }
        best_priority = min(row["match_priority"] for row in rows)

        def group(values: list[sqlite3.Row]) -> list[dict]:
            output = []
            for key in sorted({row["baseword_key"] for row in values}):
                owner_rows = [row for row in values if row["baseword_key"] == key]
                first = owner_rows[0]
                owner = self.family_dict(first)
                owner.update({
                    "blocked": bool(first["display_blocked"]),
                    "match_classes": sorted({row["match_class"] for row in owner_rows}),
                    "matched_forms": sorted({row["matched_form"] for row in owner_rows if row["matched_form"]}),
                    "matched_form_evidence": self.exact_form_evidence(connection, key, normalized),
                })
                output.append(owner)
            return output

        owners = group([row for row in rows if row["match_priority"] == best_priority])
        allowed = [owner for owner in owners if not owner["blocked"]]
        status = "BLOCKED" if not allowed else "AMBIGUOUS" if len(allowed) > 1 else "RESOLVED"
        return {
            "status": status,
            "submitted_query": submitted,
            "normalized_query": normalized,
            "best_priority": best_priority,
            "best_owner_count": len(allowed),
            "owners": owners,
            "alternatives": group([row for row in rows if row["match_priority"] != best_priority]),
            "identity_exception": None,
        }

    def search(self, query: str) -> dict:
        with self.connect() as connection:
            result = self._search_with_connection(connection, query)
        result["api_version"] = API_VERSION
        return result

    def resolve_occurrences(self, payload: dict) -> dict:
        occurrences = payload.get("occurrences")
        if not isinstance(occurrences, list) or len(occurrences) > 500:
            raise ValueError("occurrences must be a list with at most 500 records")
        results = []
        with self.connect() as connection:
            for item in occurrences:
                if not isinstance(item, dict):
                    raise ValueError("every occurrence must be an object")
                result = {key: item.get(key) for key in (
                    "occurrence_id", "surface", "normalized_token", "start_offset", "end_offset",
                    "occurrence_order", "token_status", "failure_reason",
                )}
                if item.get("token_status") == "UNSUPPORTED_TOKEN" or not item.get("normalized_token"):
                    result.update({"status": "UNSUPPORTED", "best_owner_count": 0, "owners": [], "alternatives": [], "identity_exception": None})
                else:
                    search = self._search_with_connection(connection, str(item.get("surface") or item["normalized_token"]))
                    result.update({key: search.get(key) for key in (
                        "status", "best_priority", "best_owner_count", "owners", "alternatives", "identity_exception",
                    )})
                results.append(result)
        return {"api_version": API_VERSION, "occurrences": results, "occurrence_count": len(results)}


