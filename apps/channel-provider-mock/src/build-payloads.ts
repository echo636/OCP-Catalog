import type { CommercialObject, ProviderRegistration } from '@ocp-catalog/ocp-schema';
import { channelMockConfig } from './config';
import type { DemoOpportunity } from './demo-opportunities';

const OPPORTUNITY_CORE_PACK = 'ocp.channel.opportunity.core.v1';
const COMMISSION_PACK = 'ocp.channel.commission.v1';
const COVERAGE_PACK = 'ocp.channel.coverage.v1';
const QUALIFICATION_PACK = 'ocp.channel.qualification.v1';
const CONTACT_PACK = 'ocp.channel.contact.v1';

export function buildChannelProviderRegistration(registrationVersion: number): ProviderRegistration {
  return {
    ocp_version: '1.0',
    kind: 'ProviderRegistration',
    id: `reg_${channelMockConfig.providerId}_${registrationVersion}`,
    catalog_id: channelMockConfig.catalogId,
    registration_version: registrationVersion,
    updated_at: new Date().toISOString(),
    provider: {
      provider_id: channelMockConfig.providerId,
      entity_type: 'organization',
      display_name: channelMockConfig.providerName,
      homepage: channelMockConfig.providerHomepage,
      contact_email: channelMockConfig.providerContactEmail,
      domains: [channelMockConfig.providerDomain],
    },
    object_declarations: [
      {
        guaranteed_fields: [
          `${OPPORTUNITY_CORE_PACK}#/title`,
          `${COMMISSION_PACK}#/model`,
          `${OPPORTUNITY_CORE_PACK}#/opportunity_url`,
        ],
        optional_fields: [
          `${OPPORTUNITY_CORE_PACK}#/summary`,
          `${OPPORTUNITY_CORE_PACK}#/operator_name`,
          `${OPPORTUNITY_CORE_PACK}#/industry`,
          `${OPPORTUNITY_CORE_PACK}#/opportunity_status`,
          `${OPPORTUNITY_CORE_PACK}#/image_urls`,
          `${COMMISSION_PACK}#/rate_percent`,
          `${COMMISSION_PACK}#/flat_fee_amount`,
          `${COMMISSION_PACK}#/flat_fee_currency`,
          `${COMMISSION_PACK}#/settlement_cycle_days`,
          `${COVERAGE_PACK}#/regions`,
          `${COVERAGE_PACK}#/industries`,
          `${COVERAGE_PACK}#/languages`,
          `${QUALIFICATION_PACK}#/level`,
          `${QUALIFICATION_PACK}#/requires_business_license`,
          `${QUALIFICATION_PACK}#/requires_prior_experience`,
          `${QUALIFICATION_PACK}#/minimum_budget_amount`,
          `${QUALIFICATION_PACK}#/minimum_budget_currency`,
          `${CONTACT_PACK}#/contact_name`,
          `${CONTACT_PACK}#/contact_email`,
          `${CONTACT_PACK}#/contact_phone`,
          `${CONTACT_PACK}#/contact_url`,
        ],
        sync: {
          preferred_capabilities: ['ocp.push.batch'],
          avoid_capabilities_unless_necessary: [],
          provider_endpoints: {},
        },
      },
    ],
  };
}

export function buildCommercialObject(opportunity: DemoOpportunity): CommercialObject {
  const corePayload: Record<string, unknown> = {
    title: opportunity.title,
    summary: opportunity.summary,
    operator_name: opportunity.operator_name,
    industry: opportunity.industry,
    opportunity_url: opportunity.opportunity_url,
    opportunity_status: opportunity.opportunity_status,
  };
  if (opportunity.image_urls) corePayload.image_urls = opportunity.image_urls;

  const commissionPayload: Record<string, unknown> = {
    model: opportunity.commission_model,
  };
  if (opportunity.commission_rate_percent !== undefined) {
    commissionPayload.rate_percent = opportunity.commission_rate_percent;
  }
  if (opportunity.flat_fee_amount !== undefined) commissionPayload.flat_fee_amount = opportunity.flat_fee_amount;
  if (opportunity.flat_fee_currency) commissionPayload.flat_fee_currency = opportunity.flat_fee_currency;
  if (opportunity.settlement_cycle_days !== undefined) commissionPayload.settlement_cycle_days = opportunity.settlement_cycle_days;
  if (opportunity.minimum_payout_amount !== undefined) commissionPayload.minimum_payout_amount = opportunity.minimum_payout_amount;

  const coveragePayload = {
    regions: opportunity.regions,
    industries: opportunity.industries ?? [],
    languages: opportunity.languages ?? [],
  };

  const qualificationPayload: Record<string, unknown> = {
    level: opportunity.qualification_level,
  };
  if (opportunity.requires_business_license !== undefined) qualificationPayload.requires_business_license = opportunity.requires_business_license;
  if (opportunity.requires_prior_experience !== undefined) qualificationPayload.requires_prior_experience = opportunity.requires_prior_experience;
  if (opportunity.minimum_budget_amount !== undefined) qualificationPayload.minimum_budget_amount = opportunity.minimum_budget_amount;
  if (opportunity.minimum_budget_currency) qualificationPayload.minimum_budget_currency = opportunity.minimum_budget_currency;

  const contactPayload: Record<string, unknown> = {};
  if (opportunity.contact_name) contactPayload.contact_name = opportunity.contact_name;
  if (opportunity.contact_email) contactPayload.contact_email = opportunity.contact_email;
  if (opportunity.contact_phone) contactPayload.contact_phone = opportunity.contact_phone;
  if (opportunity.contact_url) contactPayload.contact_url = opportunity.contact_url;

  const descriptors: CommercialObject['descriptors'] = [
    { pack_id: OPPORTUNITY_CORE_PACK, data: corePayload },
    { pack_id: COMMISSION_PACK, data: commissionPayload },
    { pack_id: COVERAGE_PACK, data: coveragePayload },
    { pack_id: QUALIFICATION_PACK, data: qualificationPayload },
  ];
  if (Object.keys(contactPayload).length > 0) {
    descriptors.push({ pack_id: CONTACT_PACK, data: contactPayload });
  }

  return {
    ocp_version: '1.0',
    kind: 'CommercialObject',
    id: `obj_${channelMockConfig.providerId}_${opportunity.object_id}`,
    object_id: opportunity.object_id,
    object_type: 'channel_opportunity',
    provider_id: channelMockConfig.providerId,
    title: opportunity.title,
    summary: opportunity.summary,
    status: opportunity.opportunity_status === 'closed' ? 'inactive' : 'active',
    source_url: opportunity.opportunity_url,
    descriptors,
  };
}

export function buildSyncRequest(registrationVersion: number, opportunities: DemoOpportunity[], batchId?: string) {
  return {
    ocp_version: '1.0' as const,
    kind: 'ObjectSyncRequest' as const,
    catalog_id: channelMockConfig.catalogId,
    provider_id: channelMockConfig.providerId,
    registration_version: registrationVersion,
    batch_id: batchId ?? `channel_provider_batch_${Date.now()}`,
    objects: opportunities.map(buildCommercialObject),
  };
}
