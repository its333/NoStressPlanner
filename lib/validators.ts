// lib/validators.ts
import { z } from 'zod';

// Event creation schema
export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long').regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, 'Title contains invalid characters'),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  voteDeadline: z.string().datetime('Invalid vote deadline'),
  quorum: z.number().int().min(1, 'Quorum must be at least 1').max(100, 'Quorum too high'),
  requireLoginToAttend: z.boolean().optional().default(false),
  attendeeNames: z.array(z.object({
    label: z.string().min(1, 'Attendee name required').max(50, 'Name too long').regex(/^[a-zA-Z0-9\s\-_.,!?]+$/, 'Name contains invalid characters'),
    slug: z.string().min(1, 'Slug required').max(50, 'Slug too long').regex(/^[a-zA-Z0-9_-]+$/, 'Invalid slug format')
  })).min(1, 'At least one attendee required').max(50, 'Too many attendees')
});

// Vote schema
export const voteSchema = z.object({
  in: z.boolean()
});

// Day block schema
export const dayBlockSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')),
  anonymous: z.boolean().optional().default(false)
});

// Alias for backward compatibility
export const blocksSchema = dayBlockSchema;

// Join event schema
export const joinEventSchema = z.object({
  attendeeNameId: z.string().cuid('Invalid attendee name ID format').optional(),
  nameSlug: z.string().min(1, 'Name slug required').max(50, 'Slug too long').regex(/^[a-zA-Z0-9_-]+$/, 'Invalid slug format'),
  displayName: z.string().min(1, 'Display name required').max(100, 'Display name too long').optional(),
  timeZone: z.string().max(50, 'Timezone too long').optional()
});

// Switch name schema
export const switchNameSchema = z.object({
  attendeeNameId: z.string().cuid('Invalid attendee name ID format')
});

// Phase change schema
export const phaseChangeSchema = z.object({
  phase: z.enum(['VOTE', 'PICK_DAYS', 'RESULTS', 'FINALIZED', 'FAILED'])
});

// Alias for backward compatibility
export const phaseSchema = phaseChangeSchema;

// Final date schema
export const finalDateSchema = z.object({
  finalDate: z.string().refine((val) => {
    // Accept both YYYY-MM-DD and ISO format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    return dateRegex.test(val) || isoRegex.test(val);
  }, 'Invalid date format - use YYYY-MM-DD or ISO format')
});

// Show results schema
export const showResultsSchema = z.object({
  showResults: z.boolean()
});

// Export types
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type DayBlockInput = z.infer<typeof dayBlockSchema>;
export type JoinEventInput = z.infer<typeof joinEventSchema>;
export type SwitchNameInput = z.infer<typeof switchNameSchema>;
export type PhaseChangeInput = z.infer<typeof phaseChangeSchema>;
export type FinalDateInput = z.infer<typeof finalDateSchema>;
export type ShowResultsInput = z.infer<typeof showResultsSchema>;