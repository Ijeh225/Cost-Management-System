import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => {
  const usersTable = { name: "users" };
  const branchesTable = { name: "branches" };
  return {
    usersTable,
    branchesTable,
    db: { select: vi.fn() },
  };
});

vi.mock("@workspace/db", () => databaseMock);

import { requireFinanceAccess, signToken } from "../lib/auth.js";

type TestUser = {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  sessionToken: string;
  branchId: number;
  authorityLevel: string;
  jobFunction: string;
  workspaceAccess: string;
  accessProfileMigratedAt: Date;
  canUpload: boolean;
};

function authenticatedFinanceApi(user: TestUser) {
  databaseMock.db.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => [table === databaseMock.usersTable ? user : { isActive: true }],
      }),
    }),
  }));

  const app = express();
  app.use(cookieParser());
  app.get("/finance", requireFinanceAccess, (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

function createUser(jobFunction: "accounts" | "delivery"): TestUser {
  return {
    id: jobFunction === "accounts" ? 1001 : 1002,
    email: `${jobFunction}@example.test`,
    name: `Test ${jobFunction}`,
    isActive: true,
    sessionToken: `${jobFunction}-session`,
    branchId: 1,
    authorityLevel: "staff",
    jobFunction,
    workspaceAccess: JSON.stringify([jobFunction === "accounts" ? "accounts" : "delivery"]),
    accessProfileMigratedAt: new Date("2026-09-04T00:00:00.000Z"),
    canUpload: false,
  };
}

beforeEach(() => {
  databaseMock.db.select.mockReset();
});

describe("finance API access middleware", () => {
  it("returns a real HTTP 403 to an authenticated non-finance department user", async () => {
    const user = createUser("delivery");
    const response = await request(authenticatedFinanceApi(user))
      .get("/finance")
      .set("Cookie", `cost_analysis_session=${signToken(user.id, user.sessionToken)}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "You do not have permission to access this resource." });
  });

  it("continues to allow an authenticated Accounts user", async () => {
    const user = createUser("accounts");
    const response = await request(authenticatedFinanceApi(user))
      .get("/finance")
      .set("Cookie", `cost_analysis_session=${signToken(user.id, user.sessionToken)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
