import { describe, expect, it } from "vitest";
import { stageOwnerFieldFor, stageOwnerFor } from "../lib/department-stage-owners.js";

describe("department stage owners", () => {
  const owners = {
    stageOwner: "Documentation Officer",
    transireStageOwner: "Karo",
    shippingStageOwner: "Ada",
    terminalStageOwner: "Bola",
    pulloutStageOwner: "Musa",
  };

  it("uses an independent owner field for every operational department", () => {
    expect(stageOwnerFieldFor("transire_processing")).toBe("transireStageOwner");
    expect(stageOwnerFieldFor("shipping")).toBe("shippingStageOwner");
    expect(stageOwnerFieldFor("terminal")).toBe("terminalStageOwner");
    expect(stageOwnerFieldFor("pull_out")).toBe("pulloutStageOwner");
  });

  it("does not carry one department owner into another department", () => {
    expect(stageOwnerFor("transire_processing", owners)).toBe("Karo");
    expect(stageOwnerFor("shipping", owners)).toBe("Ada");
    expect(stageOwnerFor("terminal", owners)).toBe("Bola");
    expect(stageOwnerFor("pull_out", owners)).toBe("Musa");
  });

  it("keeps the legacy owner only for non-department stages", () => {
    expect(stageOwnerFor("documentation", owners)).toBe("Documentation Officer");
  });
});
