import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import { WorkforceProfileCreateSchema } from '../src/workforce.js';

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
  });
});
