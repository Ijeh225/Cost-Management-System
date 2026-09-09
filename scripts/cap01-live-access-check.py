"""Bounded read-only CAP-01 check for existing Operations QA user 14.

Requires the already reserved task 2/3 controls on job 26. Never creates records,
stores credentials/cookies, or posts money. Session is logged out in finally.
"""
import argparse
import getpass
import http.cookiejar
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--confirm", required=True, choices=["CAP01-ACCESS-20260909"])
parser.parse_args()
base = "https://donclimaxmanagementapp.com/api"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
headers = {"Content-Type": "application/json", "X-Branch-Id": "2"}


def request(method, path, payload=None, expected=200):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        code = response.code
        data = json.loads(response.read())
    print(json.dumps({"method": method, "path": path, "branchHeader": headers["X-Branch-Id"],
                      "http": code, "expected": expected}), flush=True)
    assert code == expected, f"Unexpected response for {path}"
    return data


password = getpass.getpass("Controlled Operations QA password: ")
request("POST", "/auth/login", {"email": "e2e.operations.20260904@donclimax.test", "password": password})
del password
try:
    headers["X-CSRF-Token"] = request("GET", "/auth/csrf")["token"]
    me = request("GET", "/auth/me")
    user = me.get("user", me)
    assert user["id"] == 14 and user["branchId"] == 2
    print(json.dumps({"authenticatedUserId": user["id"], "branchId": user["branchId"]}), flush=True)
    overview = request("GET", "/containers/26/overview")
    assert overview["finance"] is None
    assert {t["id"] for t in overview["tasks"]} == {2, 3}
    assert all(a["section"] == "container_review" for a in overview["approvals"])
    tasks = request("GET", "/containers/26/tasks")
    assert {t["id"]: t["assignedStaffId"] for t in tasks} == {2: 14, 3: 13}
    assert all(t["status"] == "pending" for t in tasks)
    queue = request("GET", "/my-tasks")
    assert [t["id"] for t in queue["dailyQueue"]] == [2]
    assert queue["dailyQueue"][0]["branchId"] == 2
    assert all(c["clearingCharges"] == c["totalCost"] == c["grossProfit"] == 0
               for c in queue["assignedContainers"])
    for header in ["all", "1", "3"]:
        headers["X-Branch-Id"] = header
        scoped = request("GET", "/my-tasks")
        assert [t["id"] for t in scoped["dailyQueue"]] == [2]
        request("GET", "/containers/24/overview", expected=404)
        request("GET", "/containers/25/overview", expected=404)
    headers["X-Branch-Id"] = "2"
    for path in ["/containers/24/tasks", "/containers/25/tasks"]:
        request("GET", path, expected=404)
    for path in ["/banks", "/invoices", "/invoices/8", "/payment-schedules", "/users"]:
        request("GET", path, expected=403)
    assert request("GET", "/containers/26/tasks") == tasks
    print("PASS: personal queue, non-finance response, forged branch headers, direct API denials; task records unchanged", flush=True)
finally:
    request("POST", "/auth/logout", {})
    opener.close()
