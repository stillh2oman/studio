import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeEmail, planportHubMatchKeys, ledgerResidentialMatchKeys } from './merge-utils';

describe('merge-utils', () => {
  it('normalizes emails', () => {
    assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com');
  });

  it('produces matching keys for ledger and planport when email aligns', () => {
    const firm = 'boss1';
    const lk = ledgerResidentialMatchKeys(firm, { email: 'x@y.com', name: 'Jane Doe' });
    const pk = planportHubMatchKeys(firm, { email: 'X@Y.COM', husbandName: 'Jane', wifeName: 'Doe' });
    assert.ok(lk.some((k) => pk.includes(k)));
  });
});
