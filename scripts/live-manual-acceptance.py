"""Guarded one-off live acceptance for the 2026-09-07 manual fixes.

Uses a new labelled fixture and leaves previous failure evidence unchanged.
Prompts for existing credentials; never saves cookies/passwords. No money posted.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import http.cookiejar
import json
import threading
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--confirm", required=True, choices=["LIVE-MANUAL-ACCEPTANCE-20260907"])
parser.parse_args()
base = "https://donclimaxmanagementapp.com/api"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
headers = {"Content-Type": "application/json", "X-Branch-Id": "2"}


def request(method, path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        raw = opener.open(req, timeout=40)
    except urllib.error.HTTPError as error:
        raw = error
    with raw:
        return raw.code, json.loads(raw.read())


def checked(method, path, payload=None, expected=200):
    code, data = request(method, path, payload)
    print(json.dumps({"method": method, "path": path, "http": code,
                      "error": data.get("error") if isinstance(data, dict) else None}), flush=True)
    assert code == expected, f"Unexpected HTTP {code}, expected {expected}: {path}"
    return data


def container(ident):
    return checked("GET", f"/containers/{ident}")["container"]


def timestamps(c):
    return {key: c.get(key) for key in ["status", "gateInDate", "gateOutDate", "emptyGateInDate", "emptyGateOutDate", "emptyReturnDate", "updatedAt"]}


email = input("Owner email: ")
password = getpass.getpass("Existing password: ")
checked("POST", "/auth/login", {"email": email, "password": password})
del password
headers["X-CSRF-Token"] = checked("GET", "/auth/csrf")["token"]
try:
    original = {}
    original_audit = {}
    for ident, name in [(28, "E2EI260907"), (29, "E2EG260907A"), (30, "E2EG260907B")]:
        c = container(ident)
        assert c["containerNumber"] == name and c["branchId"] == 2
        original[ident] = timestamps(c)
        original_audit[ident] = checked("GET", f"/containers/{ident}/audit")
    checked("POST", "/containers/29/gate-in", {}, 409)
    checked("POST", "/containers/30/gate-out", {}, 409)
    checked("POST", "/containers/30/empty-gate-in", {}, 409)
    checked("POST", "/containers/30/empty-gate-out", {}, 409)

    name = "E2ER260907"
    found = checked("GET", "/containers?search=" + name)
    rows = found if isinstance(found, list) else found.get("containers", found.get("data", []))
    assert not any(c["containerNumber"] == name for c in rows), "Acceptance fixture exists; do not repeat writes"
    client = checked("GET", "/clients/9")
    assert client["name"] == "E2E-20260907 Manual Rate QA" and float(client["agreedClearingRate"]) == 90
    created = checked("POST", "/containers", {
        "containerNumber": name, "blNumber": "E2E-ACCEPTANCE-260907",
        "customerName": "E2E-20260907 Manual Rate QA", "clientId": 9,
        "command": "PTML", "branchId": 2, "clearingCharges": 100,
        "declaration": "DUMMY MANUAL gate/invoice acceptance; no physical movement or payment",
    }, 201)
    ident = created["id"]
    print("NEW_ACCEPTANCE_CONTAINER", ident, flush=True)
    checked("POST", f"/containers/{ident}/verify", {})
    checked("PATCH", f"/containers/{ident}/status", {"status": "shipping"})
    before = timestamps(container(ident))
    for event in ["gate-in", "gate-out", "empty-gate-in", "empty-gate-out"]:
        checked("POST", f"/containers/{ident}/{event}", {}, 409)
    assert timestamps(container(ident)) == before
    print("Missing-release/entry rejects leave fixture unchanged: PASS", flush=True)

    checked("PATCH", f"/containers/{ident}", {
        "paarNumber": "E2E-PAAR-ACCEPTANCE-260907",
        "paarReleasedAt": datetime.now(timezone.utc).isoformat(),
    })
    for stage in ["transire_processing", "shipping", "terminal", "pull_out"]:
        checked("POST", f"/containers/{ident}/stage-action", {"stage": stage, "action": "mark_released"})

    results = {}
    for event, field in [("gate-in", "gateInDate"), ("gate-out", "gateOutDate"),
                         ("empty-gate-in", "emptyGateInDate"), ("empty-gate-out", "emptyGateOutDate")]:
        if event == "gate-out":
            checked("POST", f"/containers/{ident}/empty-gate-in", {}, 409)
        if event == "empty-gate-in":
            checked("POST", f"/containers/{ident}/empty-gate-out", {}, 409)
        barrier = threading.Barrier(2)
        def attempt(_):
            barrier.wait(timeout=10)
            return request("POST", f"/containers/{ident}/{event}", {})
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(attempt, [0, 1]))
        codes = sorted(code for code, _ in responses)
        print(json.dumps({"concurrent_event": event, "http": codes}), flush=True)
        assert codes == [200, 409]
        recorded = next(data[field] for code, data in responses if code == 200)
        checked("POST", f"/containers/{ident}/{event}", {}, 409)
        assert container(ident)[field] == recorded
        results[field] = recorded

    final = container(ident)
    assert final["emptyReturnDate"] == final["emptyGateOutDate"]
    audit = checked("GET", f"/containers/{ident}/audit")
    counts = Counter(row["action"] for row in audit if row["action"].endswith("_recorded") and "gate" in row["action"])
    assert counts == {"gate_in_recorded": 1, "gate_out_recorded": 1, "empty_gate_in_recorded": 1, "empty_gate_out_recorded": 1}
    for old in original:
        assert timestamps(container(old)) == original[old]
        assert checked("GET", f"/containers/{old}/audit") == original_audit[old]
    print(json.dumps({"result": "PASS", "containerId": ident, "timestamps": results,
                      "gate_audit_counts": counts, "prior_fixtures_unchanged": True}), flush=True)
finally:
    checked("POST", "/auth/logout", {})
    opener.close()
