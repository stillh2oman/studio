import test from "node:test";
import assert from "node:assert/strict";
import { PlanportLedgerImportPackageSchemaV1 } from "./v1";

test("PlanPort -> Ledger import schema v1 validates minimal payload", () => {
  const payload = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceApp: "PlanPort",
    sourceRecordIds: {
      planportClientId: "abc",
      planportProjectId: "def",
      planportHubPath: "individualClients/abc/projects/def",
    },
    client: {
      name: "John Doe",
      accessCode: "DOE2026",
    },
    project: {
      name: "Test Project",
    },
  };

  const parsed = PlanportLedgerImportPackageSchemaV1.safeParse(payload);
  assert.equal(parsed.success, true);
});

