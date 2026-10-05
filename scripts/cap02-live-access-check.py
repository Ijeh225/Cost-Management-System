"""Bounded CAP-02 checks for existing Operations QA user 14; no credentials saved.

Valid but forbidden review/profile requests must return 403. No success is
expected from any mutation. Never change an account role or reset a password.
"""
import argparse
import getpass
import http.cookiejar
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--confirm", required=True, choices=["CAP02-ACCESS-20261005"])
parser.parse_args()
base = "https://donclimaxmanagementapp.com/api"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
headers = {"Content-Type": "application/json", "X-Branch-Id": "2"}


def request(method, path, payload=None, expected=200, binary=False):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        code, raw = response.code, response.read()
    print(json.dumps({"method": method, "path": path, "http": code, "expected": expected}), flush=True)
    assert code == expected, f"Unexpected HTTP response for {path}; stop and inspect before repeating"
    return raw if binary else json.loads(raw)


password = getpass.getpass("Existing Operations QA test password: ")
request("POST", "/auth/login", {"email": "e2e.operations.20260904@donclimax.test", "password": password})
del password
try:
    headers["X-CSRF-Token"] = request("GET", "/auth/csrf")["token"]
    me = request("GET", "/auth/me")
    user = me.get("user", me)
    assert user["id"] == 14 and user["branchId"] == 2
    assert user["accessProfile"]["authorityLevel"] == "staff"
    before = request("GET", "/containers/32/document-readiness")
    assert before["canReview"] is False and before["canConfigure"] is False
    assert {9, 10, 11}.issubset({doc["id"] for doc in before["documents"]})
    assert request("GET", "/documents/11", binary=True).startswith(b"%PDF")
    assert request("GET", "/containers/33/document-readiness")["configured"] is False
    doc = next(d for d in before["documents"] if d["id"] == 10)
    review = {"expectedReviewId": doc["review"]["id"], "status": "reviewed", "documentType": "release",
              "issuer": "Forbidden controlled request", "expiresOn": None,
              "acceptedFields": {"identifier": "", "amount": "", "date": "", "text": ""},
              "notes": "Must be rejected before any write", "sourceChecked": True}
    request("POST", "/containers/32/document-readiness/10/review", review, expected=403)
    request("POST", "/containers/32/document-readiness/profiles",
            {"name": "Must not be created", "jobType": "QA", "cargoType": "QA", "requiredTypes": ["release"]}, expected=403)
    request("POST", "/containers/32/document-readiness/apply",
            {"profileId": 1, "expectedChecklistId": before["applications"][0]["application"]["id"]}, expected=403)
    for scope in ["all", "1", "3"]:
        headers["X-Branch-Id"] = scope
        request("GET", "/containers/24/document-readiness", expected=404)
        request("GET", "/containers/25/documents", expected=404)
        assert request("GET", "/containers/32/document-readiness")["canReview"] is False
    headers["X-Branch-Id"] = "2"
    for path in ["/banks", "/invoices", "/payment-schedules", "/users"]:
        request("GET", path, expected=403)
    after = request("GET", "/containers/32/document-readiness")
    for key in ["documents", "history", "applications", "profiles", "items"]:
        assert after[key] == before[key], f"Unexpected change in {key}; investigate before retry"
    print("PASS: fresh staff CAP-02 read scope, PDF retrieval, forbidden writes and unchanged evidence", flush=True)
finally:
    request("POST", "/auth/logout", {})
    opener.close()
