import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Client, Contractor, Project } from '@/lib/types';
import {
  mapInternalClientToCanonical,
  mapInternalContractorToCanonical,
  mapInternalProjectToCanonical,
  mapCanonicalToInternalClientView,
  mapCanonicalToInternalContractorView,
  mapCanonicalToInternalProjectView,
} from './internal-mappers';
import {
  mapPlanportResidentialHubToCanonical,
  mapPlanportProjectToCanonical,
  mapCanonicalToPlanportProjectPatch,
} from './portal-mappers';
import {
  sharedClientDocIdForLedger,
  sharedClientDocIdForPlanportHub,
  sharedProjectDocIdForLedger,
} from './ids';

describe('internal mappers', () => {
  it('round-trips client id and display fields', () => {
    const legacyId = 'cl_abc';
    const c: Client = {
      id: legacyId,
      name: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      secondaryClientName: '',
      email: 'j@example.com',
      phoneNumber: '555',
      isContractor: false,
      accessCode: 'AB12',
      additionalStakeholders: [],
      permitPdfDownloads: true,
      initialProjectName: '',
      associatedProjectIds: [],
      projectAddress: '1 Main St',
      projectRenderingUrl: '',
      assignedContractorId: '',
      discountEligibility: '',
      hiddenFromDatabase: false,
    };
    const firm = 'firm1';
    const canon = mapInternalClientToCanonical(firm, c);
    const back = mapCanonicalToInternalClientView(canon, legacyId);
    assert.equal(back.id, legacyId);
    assert.equal(back.name, 'Jane Doe');
    assert.equal(back.email, 'j@example.com');
    assert.equal(back.projectAddress, '1 Main St');
    assert.equal(sharedClientDocIdForLedger(firm, 'clients', legacyId).startsWith('sc_leg_cl_'), true);
  });

  it('maps project contractor link only when shared contractor id provided', () => {
    const p: Project = {
      id: 'p1',
      name: 'Kitchen',
      clientId: 'cl1',
      hiddenFromCards: false,
      contractorId: 'gc1',
      status: '3d Modeling',
      address: '',
      constructionCompany: '',
      hourlyRate: 0,
      hasHourlyDiscount: false,
      currentHeatedSqFt: 0,
      createdAt: '2020-01-01T00:00:00.000Z',
      nature: [],
      designer: 'Jeff Dillon',
      renderingUrl: '',
    };
    const firm = 'firm1';
    const withoutGc = mapInternalProjectToCanonical(firm, p, { sharedResidentialId: 'sc_res' });
    assert.equal(withoutGc.contractorClientId, undefined);
    const withGc = mapInternalProjectToCanonical(firm, p, {
      sharedResidentialId: 'sc_res',
      sharedContractorId: 'sc_gc',
    });
    assert.equal(withGc.contractorClientId, 'sc_gc');
  });

  it('preserves ledger client/contractor ids in extension for round-trip', () => {
    const p: Project = {
      id: 'p1',
      name: 'Bath',
      clientId: 'cl_z',
      hiddenFromCards: true,
      contractorId: 'co_z',
      status: 'Initial Meeting',
      address: '9 Oak',
      constructionCompany: 'BuildCo',
      hourlyRate: 10,
      hasHourlyDiscount: true,
      currentHeatedSqFt: 100,
      createdAt: '2021-05-05T00:00:00.000Z',
      nature: [],
      designer: 'Kevin Walthall',
      renderingUrl: 'https://x.test/r.png',
    };
    const canon = mapInternalProjectToCanonical('firmX', p, {
      sharedResidentialId: 'sr1',
      sharedContractorId: 'sr2',
    });
    const back = mapCanonicalToInternalProjectView(canon, 'p1');
    assert.equal(back.clientId, 'cl_z');
    assert.equal(back.contractorId, 'co_z');
    assert.equal(back.hiddenFromCards, true);
    assert.equal(back.hourlyRate, 10);
  });

  it('round-trips contractor', () => {
    const k: Contractor = {
      id: 'gc1',
      companyName: 'GC LLC',
      logoUrl: '',
      billingEmail: 'b@gc.com',
      contacts: [{ name: 'Bob', title: 'PM', email: 'bob@gc.com', phone: '' }],
      accessCode: 'ZZ99',
      permitPdfDownloads: false,
      qualifiesForDiscount: true,
    };
    const canon = mapInternalContractorToCanonical('firm1', k);
    const back = mapCanonicalToInternalContractorView(canon, k.id);
    assert.equal(back.companyName, 'GC LLC');
    assert.equal(back.billingEmail, 'b@gc.com');
  });
});

describe('portal mappers', () => {
  it('sets contractorClientId for projects under a GC hub', () => {
    const gcShared = sharedClientDocIdForPlanportHub('generalContractors', 'gc1');
    const proj = mapPlanportProjectToCanonical(
      'firm1',
      'generalContractors',
      'gc1',
      { id: 'p1', name: 'Tower' },
      { sharedContractorId: gcShared },
    );
    assert.equal(proj.contractorClientId, gcShared);
  });

  it('builds canonical residential hub and project patch', () => {
    const hub = mapPlanportResidentialHubToCanonical('firm1', {
      id: 'hub1',
      husbandName: 'A',
      wifeName: 'B',
      email: 'a@b.com',
      accessCode: 'pp1',
    });
    assert.equal(hub.accountKind, 'residential');
    assert.equal(hub.planportHubId, 'hub1');
    const proj = mapPlanportProjectToCanonical(
      'firm1',
      'individualClients',
      'hub1',
      { id: 'pr1', name: 'Addition', address: '2 Elm' },
      { sharedResidentialId: 'sc_pp_ind_hub1' },
    );
    assert.ok(proj.planportProjectPath?.includes('projects/pr1'));
    const patch = mapCanonicalToPlanportProjectPatch(proj);
    assert.equal(patch.name, 'Addition');
    assert.equal(patch.address, '2 Elm');
  });

  it('deterministic ledger project id', () => {
    const id = sharedProjectDocIdForLedger('firm_x', 'proj_1');
    assert.ok(id.startsWith('sp_leg_'));
    assert.ok(id.includes('firm_x'));
    assert.ok(id.includes('proj_1'));
  });
});
