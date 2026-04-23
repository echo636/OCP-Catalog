import { z } from 'zod';

// Descriptor Packs for the channel / 招商 / 代理 scenario.
//
// These live in the app rather than packages/ocp-schema because there is
// no second consumer yet. If a future channel-provider needs the same
// schemas, lift them up per the rule in docs/repo-architecture.md.

export const CHANNEL_OPPORTUNITY_CORE_PACK = 'ocp.channel.opportunity.core.v1';
export const CHANNEL_COMMISSION_PACK = 'ocp.channel.commission.v1';
export const CHANNEL_COVERAGE_PACK = 'ocp.channel.coverage.v1';
export const CHANNEL_QUALIFICATION_PACK = 'ocp.channel.qualification.v1';
export const CHANNEL_CONTACT_PACK = 'ocp.channel.contact.v1';

export const CHANNEL_OBJECT_TYPE = 'channel_opportunity';

export const opportunityCorePackSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  operator_name: z.string().optional(),
  industry: z.string().optional(),
  opportunity_url: z.string().url().optional(),
  opportunity_status: z.enum(['open', 'waitlist', 'closed']).optional(),
  image_urls: z.array(z.string().url()).optional(),
}).strict();

export const commissionPackSchema = z.object({
  // Supported pricing / share arrangements for the招商方.
  model: z.enum(['revshare', 'flat_fee', 'tiered', 'per_lead', 'custom']),
  // Primary commission rate as a percentage (0..100). For revshare / tiered
  // this is the headline rate; for flat_fee it may be undefined.
  rate_percent: z.number().min(0).max(100).optional(),
  flat_fee_amount: z.number().min(0).optional(),
  flat_fee_currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  settlement_cycle_days: z.number().int().min(1).optional(),
  minimum_payout_amount: z.number().min(0).optional(),
  notes: z.string().optional(),
}).strict();

export const coveragePackSchema = z.object({
  regions: z.array(z.string().min(1)).default([]),
  industries: z.array(z.string().min(1)).default([]),
  languages: z.array(z.string().min(1)).default([]),
}).strict();

export const qualificationPackSchema = z.object({
  level: z.enum(['none', 'basic', 'verified', 'enterprise']).default('none'),
  requires_business_license: z.boolean().optional(),
  requires_prior_experience: z.boolean().optional(),
  minimum_budget_amount: z.number().min(0).optional(),
  minimum_budget_currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  notes: z.string().optional(),
}).strict();

export const contactPackSchema = z.object({
  // Sensitive — surfaced only through Resolve action bindings, never in the
  // search projection.
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  contact_url: z.string().url().optional(),
}).strict();

export const CHANNEL_PACK_VALIDATORS: Record<string, z.ZodTypeAny> = {
  [CHANNEL_OPPORTUNITY_CORE_PACK]: opportunityCorePackSchema,
  [CHANNEL_COMMISSION_PACK]: commissionPackSchema,
  [CHANNEL_COVERAGE_PACK]: coveragePackSchema,
  [CHANNEL_QUALIFICATION_PACK]: qualificationPackSchema,
  [CHANNEL_CONTACT_PACK]: contactPackSchema,
};
