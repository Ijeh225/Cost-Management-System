"""One-off authorized live reproduction; no app fixes or financial postings.

Refuses existing fixture names. Credentials are prompted, never saved.
Creates two labelled zero-charge containers in the existing E2E Lagos branch.
Retains gate timestamps and audit records as test evidence; does not delete.
"""
import argparse
import getpass
import json
from datetime import datetime, timezone

import http.cookiejar
import urllib.error
import urllib.request


class Response:
    def __init__(self, raw):
        self.status_code = raw.code
        self.body = raw.read()

    def json(self):
        return json.loads(self.body)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class Session:
    def __init__(self):
        self.headers = {"Content-Type": "application/json"}
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, method, url, json=None, timeout=40):
        body = globals()["json"].dumps(json).encode() if json is not None else None
        req = urllib.request.Request(url, data=body, headers=self.headers, method=method)
        try:
            return Response(self.opener.open(req, timeout=timeout))
        except urllib.error.HTTPError as err:
            return Response(err)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def close(self):
        self.opener.close()


parser = argparse.ArgumentParser()
parser.add_argument("--confirm-live-test", required=True,
                    choices=["MANUAL-GATE-001-20260907"])
parser.parse_args()
base = "https://donclimaxmanagementapp.com/api"
email = input("Owner email: ")
password = getpass.getpass("Existing password: ")
session = Session()
session.headers.update({"X-Branch-Id": "2"})
auth = session.post(base + "/auth/login",
                    json={"email": email, "password": password}, timeout=40)
del password
print("Login HTTP", auth.status_code, flush=True)
auth.raise_for_status()
csrf = session.request("GET", base + "/auth/csrf")
csrf.raise_for_status()
session.headers["X-CSRF-Token"] = csrf.json()["token"]


def request(method, path, payload=None):
    response = session.request(method, base + path, json=payload, timeout=40)
    data = response.json()
    return response.status_code, data


def snapshot(data):
    c = data.get("container", data)
    keys = ["id", "containerNumber", "branchId", "status", "clientId",
            "clearingCharges", "verifiedAt", "paarReleasedAt", "transireReleasedAt",
            "doReleasedAt", "tdoReleasedAt", "pulloutReleasedAt", "gateInDate",
            "gateOutDate", "emptyGateInDate", "emptyGateOutDate", "deliveredAt"]
    return {k: c.get(k) for k in keys}


def emit(label, status, data):
    result = data if status >= 400 else snapshot(data)
    print(json.dumps({"case": label, "http": status, "result": result}), flush=True)


try:
    status, branches = request("GET", "/branches")
    assert status == 200
    rows = branches if isinstance(branches, list) else branches.get("branches", [])
    assert any(b["id"] == 2 and b["name"] == "E2E-20260901-Lagos" for b in rows)
    names = ["E2EG260907A", "E2EG260907B"]
    for name in names:
        status, found = request("GET", "/containers?search=" + name)
        assert status == 200
        rows = found if isinstance(found, list) else found.get("containers", found.get("data", []))
        assert isinstance(rows, list)
        assert not any(c["containerNumber"] == name for c in rows), "Fixture exists; do not repeat writes"

    fixtures = []
    for name in names:
        status, created = request("POST", "/containers", {
            "containerNumber": name, "blNumber": "E2E-GATE-" + name,
            "customerName": "E2E-20260907 Gate Control QA",
            "command": "PTML", "branchId": 2, "clearingCharges": 0,
            "declaration": "DUMMY MANUAL-GATE-001 negative test; no physical movement",
        })
        emit("create_fixture", status, created)
        assert status == 201
        fixtures.append(created["id"])

    a, b = fixtures
    # Admin stage setup deliberately leaves release/readiness fields empty.
    status, staged = request("PUT", f"/containers/{a}", {"status": "shipping"})
    emit("fixture_A_admin_stage_setup", status, staged)
    assert status == 200
    for ident in fixtures:
        status, before = request("GET", f"/containers/{ident}")
        emit("baseline", status, before)
        assert status == 200 and before["container"]["gateInDate"] is None

    status, data = request("PATCH", f"/containers/{a}/status", {"status": "gate_in"})
    emit("A_main_workflow_readiness_control", status, data)
    assert status == 409, "Unexpected readiness control; stop and inspect"
    status, data = request("POST", f"/containers/{a}/gate-in", {})
    emit("A_gate_in_without_releases", status, data)
    if status == 200:
        first = data.get("gateInDate")
        status, data = request("POST", f"/containers/{a}/gate-in", {})
        emit("A_repeat_gate_in", status, data)
        print(json.dumps({"case": "A_timestamp_comparison", "original": first,
                          "after_repeat": data.get("gateInDate"),
                          "overwritten": status == 200 and first != data.get("gateInDate")}), flush=True)

    status, data = request("POST", f"/containers/{b}/empty-gate-out", {})
    emit("B_empty_gate_out_missing_empty_entry_control", status, data)
    status, data = request("POST", f"/containers/{b}/empty-gate-in", {})
    emit("B_empty_entry_before_any_loaded_movement", status, data)
    status, data = request("POST", f"/containers/{b}/gate-out", {})
    emit("B_loaded_exit_without_loaded_entry", status, data)
    for ident in fixtures:
        status, final = request("GET", f"/containers/{ident}")
        emit("persisted_final", status, final)
    print("Finished UTC", datetime.now(timezone.utc).isoformat(), flush=True)
finally:
    logout = session.post(base + "/auth/logout", json={}, timeout=40)
    print("Independent API session logout HTTP", logout.status_code, flush=True)
    session.close()
