import { expect, it, vi } from "vitest";
import { bffFetch } from "../client";
import { openWorkshopConsultation } from "../agora/workshops";

vi.mock("../client", () => ({ bffFetch: vi.fn(), detectBaseUrl: vi.fn() }));

it("posts consultations to the existing plural BFF route and returns its receipt", async () => {
  const body = { consultation_type: "committee" as const, subject: "Review paper research" };
  const receipt = { data: { receipt_id: "fixture-consultation-receipt" } };
  vi.mocked(bffFetch).mockResolvedValueOnce(receipt);

  expect(await openWorkshopConsultation("workshop/one", body)).toBe(receipt);
  expect(bffFetch).toHaveBeenCalledExactlyOnceWith({
    method: "POST", path: "/bff/agora/workshops/workshop%2Fone/consultations", body,
  });
});
