import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import {
  SessionWorkforceRosterSchema,
  WorkforceProfileCreateSchema,
  WorkforceProfileSummarySchema,
} from '../src/workforce.js';

describe('workforce contracts', () => {
  it('accepts only minimal operational profile fields', () => {
    const profile = {
      email: 'staff@example.test',
      first_name: 'Morgan',
      last_name: 'Lee',
      status: 'ACTIVE',
      workforce_type: 'STAFF',
    };
    expect(Value.Check(WorkforceProfileCreateSchema, profile)).toBe(true);
    expect(
      Value.Check(WorkforceProfileCreateSchema, { ...profile, background_check: 'passed' }),
    ).toBe(false);
    expect(Value.Check(WorkforceProfileCreateSchema, { ...profile, notes: 'private' })).toBe(false);
    expect(
      Value.Check(WorkforceProfileCreateSchema, { ...profile, email: ' staff@example.test ' }),
    ).toBe(true);
  });

  it('accepts catalog-length session names and complete display names', () => {
    const profile = {
      assignment_count: 0,
      current_session_names: ['s'.repeat(160)],
      display_name: `${'p'.repeat(100)} ${'l'.repeat(100)}`,
      first_name: 'Morgan',
      id: '291622b0-9265-46a5-8dba-e2618e9fe9cf',
      last_name: 'Lee',
      next_session_names: [],
      preferred_name: null,
      status: 'ACTIVE',
      version: 1,
      workforce_type: 'STAFF',
    };
    expect(Value.Check(WorkforceProfileSummarySchema, profile)).toBe(true);
    expect(
      Value.Check(SessionWorkforceRosterSchema, {
        assignments: [],
        ends_on: '2028-01-07',
        session_id: profile.id,
        session_name: 's'.repeat(160),
        starts_on: '2028-01-01',
      }),
    ).toBe(true);
  });
});
