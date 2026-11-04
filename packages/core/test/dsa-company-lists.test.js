import test from 'node:test';
import assert from 'node:assert/strict';
import { companyFrequency, familyOf, isCompanyList, listFrequency } from '@chestha/core';

/**
 * The company lists arrive in bulk — over four hundred of them — into a
 * weighting scheme designed around ten. These tests pin the rule that keeps
 * the second from destroying the first.
 */

test('every company list shares one family', () => {
  assert.equal(familyOf('company:amazon'), 'company');
  assert.equal(familyOf('company:google'), 'company');
  assert.equal(familyOf('company:some-startup'), 'company');
});

test('curated families are untouched by the company rule', () => {
  assert.equal(familyOf('blind-75'), 'blind');
  assert.equal(familyOf('neetcode-150'), 'neetcode');
  assert.equal(familyOf('leetcode-75'), 'leetcode-official');
});

test('an unknown non-company list still gets its own family', () => {
  assert.equal(familyOf('something-else'), 'other:something-else');
});

test('forty companies count as one family, not forty', () => {
  // This is the regression the shared family exists to prevent: without it
  // this question would outrank a Blind 75 + NeetCode question forty to two.
  const memberships = Array.from({ length: 40 }, (_, i) => ({
    listId: `company:acme-${i}`,
    slug: 'two-sum',
  }));
  const frequency = listFrequency(memberships, 'two-sum');
  assert.equal(frequency.lists, 40, 'raw list count should still be honest');
  assert.equal(frequency.families, 1, 'but they must weigh as one family');
});

test('company reach is reported separately from curated reach', () => {
  const memberships = [
    { listId: 'blind-75', slug: 'two-sum' },
    { listId: 'company:amazon', slug: 'two-sum' },
    { listId: 'company:google', slug: 'two-sum' },
    { listId: 'company:amazon', slug: 'other-question' },
  ];
  assert.equal(companyFrequency(memberships, 'two-sum').companies, 2);
  // The curated number must not absorb the company lists.
  assert.equal(listFrequency(memberships, 'two-sum').families, 2); // blind + company
});

test('a membership dropped from its source stops counting', () => {
  const memberships = [
    { listId: 'company:amazon', slug: 'two-sum' },
    { listId: 'company:google', slug: 'two-sum', removedFromSource: true },
  ];
  assert.equal(companyFrequency(memberships, 'two-sum').companies, 1);
});

test('company list ids are recognised by prefix, not by a hardcoded list', () => {
  assert.ok(isCompanyList('company:a-company-that-did-not-exist-yesterday'));
  assert.ok(!isCompanyList('blind-75'));
  assert.ok(!isCompanyList(null));
});

test('rubbish input does not throw', () => {
  assert.equal(companyFrequency(null, 'two-sum').companies, 0);
  assert.equal(companyFrequency([{}, null], 'two-sum').companies, 0);
});
