import test from "node:test";
import assert from "node:assert/strict";
import {
  tryParsePlanportSyncEnvelopeV2,
  buildLedgerUpsertPatchesFromEnvelopeV2,
  PLANPORT_LEDGER_SYNC_TRANSFER_VERSION,
} from "./v2";
import type { Client, Project } from "@/lib/types";

test("tryParsePlanportSyncEnvelopeV2 accepts minimal valid envelope", () => {
  const payload = {
    schemaVersion: PLANPORT_LEDGER_SYNC_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    sourceApp: "planport",
    client: {
      externalId: "cli-1",
      canonical: {
        displayName: "A & B",
        primaryEmail: "a@example.com",
        extensionPlanport: { husbandName: "A", wifeName: "B" },
      },
    },
    project: {
      externalId: "prj-1",
      clientExternalId: "cli-1",
      canonical: {
        projectName: "Lake House",
        status: "Draft Phase",
        designerName: "Jeff Dillon",
      },
    },
    mappingMeta: { direction: "planport_to_ledger" as const },
  };
  const r = tryParsePlanportSyncEnvelopeV2(payload);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.client.externalId, "cli-1");
  }
});

test("buildLedgerUpsertPatchesFromEnvelopeV2 initial create prefers PlanPort", () => {
  const envelope = tryParsePlanportSyncEnvelopeV2({
    schemaVersion: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    sourceApp: "planport",
    client: {
      externalId: "cli-1",
      canonical: { displayName: "Pat Smith", primaryEmail: "pat@x.com" },
    },
    project: {
      externalId: "prj-1",
      clientExternalId: "cli-1",
      canonical: { projectName: "P1", status: "Draft Phase" },
    },
    mappingMeta: { direction: "planport_to_ledger" },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const rep = buildLedgerUpsertPatchesFromEnvelopeV2(envelope.data, null, null);
  assert.equal(rep.wouldCreateClient, true);
  assert.equal(rep.wouldCreateProject, true);
  assert.equal(rep.clientPatch.name, "Pat Smith");
  assert.equal(rep.projectPatch.name, "P1");
});

test("buildLedgerUpsertPatchesFromEnvelopeV2 update prefers Ledger on conflict", () => {
  const envelope = tryParsePlanportSyncEnvelopeV2({
    schemaVersion: 2,
    exportedAt: "2026-01-01T00:00:00.000Z",
    sourceApp: "planport",
    client: {
      externalId: "cli-1",
      canonical: { displayName: "From PlanPort" },
    },
    project: {
      externalId: "prj-1",
      clientExternalId: "cli-1",
      canonical: { projectName: "From PlanPort" },
    },
    mappingMeta: { direction: "planport_to_ledger" },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const existingClient: Client = {
    id: "c1",
    externalId: "cli-1",
    name: "Ledger Kept",
    email: "",
    phoneNumber: "",
    accessCode: "",
    additionalStakeholders: [],
    initialProjectName: "",
    associatedProjectIds: [],
    projectAddress: "",
    projectRenderingUrl: "",
    assignedContractorId: "",
    discountEligibility: "",
    hiddenFromDatabase: false,
    permitPdfDownloads: false,
    secondaryClientName: "",
  };
  const existingProject: Project = {
    id: "p1",
    externalId: "prj-1",
    name: "Ledger Project",
    clientId: "c1",
    address: "",
    contractorId: "",
    constructionCompany: "",
    hourlyRate: 0,
    hasHourlyDiscount: false,
    currentHeatedSqFt: 0,
    createdAt: "",
    nature: [],
    designer: "Jeff Dillon",
    renderingUrl: "",
  };
  const rep = buildLedgerUpsertPatchesFromEnvelopeV2(
    envelope.data,
    existingClient,
    existingProject,
  );
  assert.equal(rep.wouldCreateClient, false);
  assert.equal(rep.clientPatch.name, "Ledger Kept");
  assert.ok(rep.clientConflicts.includes("client.name"));
  assert.equal(rep.projectPatch.name, "Ledger Project");
  assert.ok(rep.projectConflicts.includes("project.name"));
});
