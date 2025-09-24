import { describe, expect, it } from 'vitest';

import { finalDateSchema, joinEventSchema, voteSchema } from '@/lib/validators';

describe('validators', () => {
  describe('joinEventSchema', () => {
    it('requires either attendeeNameId or nameSlug', () => {
      const result = joinEventSchema.safeParse({ displayName: 'Chris' });
      expect(result.success).toBe(false);
    });

    it('accepts valid payload with attendeeNameId', () => {
      const payload = {
        attendeeNameId: 'ckv1u1h000000000000000000',
        nameSlug: 'chris',
        displayName: 'Chris',
        timeZone: 'UTC',
      };

      const result = joinEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attendeeNameId).toBe(payload.attendeeNameId);
      }
    });
  });

  describe('finalDateSchema', () => {
    it('accepts both date-only and ISO strings', () => {
      expect(finalDateSchema.parse({ finalDate: '2024-05-01' }).finalDate).toBe(
        '2024-05-01'
      );
      expect(
        finalDateSchema.parse({ finalDate: '2024-05-01T12:00:00Z' }).finalDate
      ).toBe('2024-05-01T12:00:00Z');
    });

    it('rejects invalid formats', () => {
      expect(() =>
        finalDateSchema.parse({ finalDate: '05/01/2024' })
      ).toThrow();
    });
  });

  describe('voteSchema', () => {
    it('requires the in property to be a boolean', () => {
      expect(voteSchema.parse({ in: true }).in).toBe(true);
      expect(() => voteSchema.parse({ in: 'yes' })).toThrow();
    });
  });
});
