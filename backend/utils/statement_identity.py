"""Best-effort extraction of a borrower's identity from bank statement text.

Deterministic (no LLM). Used by the bank statement analyzer to return name / address /
Estonian personal ID so the admin app can pre-fill the new-client form. The result is
returned to the caller but NOT stored with the analysis record (personal ID is sensitive).
"""
import re
from datetime import date
from typing import Optional

ID_LABEL = re.compile(
    r"(isikukood|personal\s*(?:id|code|number|identification)|id[\s-]*code|national\s*id|reg(?:istri)?kood)",
    re.IGNORECASE,
)
NAME_LABEL = re.compile(
    r"^(?:kliendi\s+nimi|konto\s+omanik|kontoomanik|omaniku\s+nimi|omanik|account\s+holder|account\s+owner|"
    r"client\s+name|customer\s+name|nimi|name)\s*[:\-–]\s*(.+)$",
    re.IGNORECASE,
)
ADDRESS_LABEL = re.compile(
    r"^(?:aadress|postiaadress|elukoha\s+aadress|elukoht|address|postal\s+address|home\s+address)\s*[:\-–]\s*(.*)$",
    re.IGNORECASE,
)
ID_RE = re.compile(r"(?<!\d)[1-8]\d{10}(?!\d)")


def check_isikukood(raw: Optional[str]) -> dict:
    """Validate an Estonian personal ID (G YYMMDD SSS C). Returns {valid, reason?, birth_date?}."""
    code = re.sub(r"\s+", "", str(raw or ""))
    if not code:
        return {"valid": False, "reason": "empty"}
    if not re.fullmatch(r"[1-8]\d{10}", code):
        return {"valid": False, "reason": "format"}
    g = int(code[0])
    century = 1800 if g <= 2 else 1900 if g <= 4 else 2000 if g <= 6 else 2100
    try:
        born = date(century + int(code[1:3]), int(code[3:5]), int(code[5:7]))
    except ValueError:
        return {"valid": False, "reason": "date"}
    d = [int(c) for c in code]
    check = sum(w * x for w, x in zip([1, 2, 3, 4, 5, 6, 7, 8, 9, 1], d)) % 11
    if check == 10:
        check = sum(w * x for w, x in zip([3, 4, 5, 6, 7, 8, 9, 1, 2, 3], d)) % 11
        if check == 10:
            check = 0
    if check != d[10]:
        return {"valid": False, "reason": "checksum"}
    return {"valid": True, "birth_date": born.isoformat()}


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\u00a0", " ")).strip()


def split_name(raw: Optional[str]) -> tuple:
    s = _clean(raw or "")
    s = _clean(re.sub(r"\b\d{8,}\b", "", s).replace("(", " ").replace(")", " "))
    if not s:
        return "", ""
    upper = s == s.upper() and s != s.lower()

    def fix(x: str) -> str:
        x = _clean(x)
        return x.title() if upper else x

    if "," in s:
        last, _, rest = s.partition(",")
        return fix(rest), fix(last)
    parts = fix(s).split(" ")
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]


def find_personal_id(text: str) -> Optional[dict]:
    lines = (text or "").splitlines()
    labelled, other = [], []
    for i, line in enumerate(lines):
        has_label = bool(ID_LABEL.search(line))
        near = line + ("\n" + lines[i + 1] if has_label and i + 1 < len(lines) else "")
        for m in ID_RE.findall(near):
            (labelled if has_label else other).append(m)
    for pool in (labelled, other):
        for c in pool:
            if check_isikukood(c)["valid"]:
                return {"id": c, "valid": True}
    if labelled:
        return {"id": labelled[0], "valid": False}
    return None


def extract_identity(text: str, analysis: Optional[dict] = None) -> dict:
    lines = [_clean(l) for l in (text or "").splitlines() if _clean(l)]
    first = last = ""
    for line in lines:
        m = NAME_LABEL.match(line)
        if m and re.search(r"[^\W\d_]", m.group(1)) and len(m.group(1)) < 80:
            first, last = split_name(m.group(1))
            if first or last:
                break
    if not (first or last) and analysis and analysis.get("account_holder"):
        first, last = split_name(analysis["account_holder"])

    address = ""
    for i, line in enumerate(lines):
        m = ADDRESS_LABEL.match(line)
        if not m:
            continue
        a = _clean(m.group(1))
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if nxt and len(nxt) < 50 and re.match(r"^\d{4,5}\b|^[A-ZÕÄÖÜŠŽ][\w\- ]+$", nxt) and not (
            ADDRESS_LABEL.match(nxt) or NAME_LABEL.match(nxt) or ID_LABEL.search(nxt)
        ):
            a = _clean(f"{a}, {nxt}" if a else nxt)
        if a:
            address = a
            break

    pid = find_personal_id(text)
    return {
        "first_name": first,
        "last_name": last,
        "address": address,
        "personal_id": pid["id"] if pid else "",
        "personal_id_valid": bool(pid and pid["valid"]),
    }
