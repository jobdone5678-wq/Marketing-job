import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanContractSchema, ChooseContractSchema } from '../../src/lib/ai/structured-contracts.ts';

test('Structured Contracts: Schema validation for Plan and Choose', async (t) => {
  await t.test('PlanContractSchema accepts valid FreeHire plan output with fieldId, label, value, action', () => {
    const validPlan = {
      fills: [
        {
          label: 'Full Name',
          value: 'Jane Doe',
          fieldId: 'field_1',
          evidenceIds: ['name.full_name'],
          action: 'fill'
        },
        {
          label: 'Gender',
          value: null,
          fieldId: 'field_2',
          evidenceIds: [],
          action: 'defer_combobox'
        }
      ]
    };
    const parsed = PlanContractSchema.parse(validPlan);
    assert.equal(parsed.fills.length, 2);
    assert.equal(parsed.fills[0].action, 'fill');
    assert.equal(parsed.fills[1].value, null);
  });

  await t.test('PlanContractSchema rejects malformed plan output', () => {
    assert.throws(() => {
      PlanContractSchema.parse({ fills: [{ label: 123 }] });
    });
    assert.throws(() => {
      PlanContractSchema.parse({ invalid: true });
    });
    assert.throws(() => {
      PlanContractSchema.parse({
        fills: [{ label: 'Email', value: 'a@b.com', action: 'unknown_action' }]
      });
    });
  });

  await t.test('ChooseContractSchema accepts choice string, null, evidenceIds and reason', () => {
    const validChoice = {
      choice: 'United States',
      evidenceIds: ['location.country'],
      reason: 'Candidate resides in US'
    };
    const parsed = ChooseContractSchema.parse(validChoice);
    assert.equal(parsed.choice, 'United States');

    const nullChoice = { choice: null, reason: 'Profile does not support' };
    const parsedNull = ChooseContractSchema.parse(nullChoice);
    assert.equal(parsedNull.choice, null);
  });

  await t.test('ChooseContractSchema rejects malformed choice output', () => {
    assert.throws(() => {
      ChooseContractSchema.parse({ choice: 123 });
    });
    assert.throws(() => {
      ChooseContractSchema.parse({ choice: 'Valid', evidenceIds: 'not-an-array' });
    });
  });
});
