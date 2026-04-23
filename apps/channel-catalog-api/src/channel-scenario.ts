import type {
  ActionBinding,
  CatalogManifest,
  CommercialObject,
  ObjectContract,
  SyncCapability,
} from '@ocp-catalog/ocp-schema';
import {
  numberField,
  readDescriptorField,
  stringField,
  type CatalogScenarioModule,
  type SearchProjection,
} from '@ocp-catalog/catalog-core';
import {
  CHANNEL_CONTACT_PACK,
  CHANNEL_COMMISSION_PACK,
  CHANNEL_COVERAGE_PACK,
  CHANNEL_OPPORTUNITY_CORE_PACK,
  CHANNEL_PACK_VALIDATORS,
  CHANNEL_QUALIFICATION_PACK,
} from './channel-packs';

// Scenario module for the channel / 招商 Catalog.
//
// NOTE on the filter-column aliasing below: packages/catalog-core QueryService
// hardcodes commerce filter names (category / brand / currency / availability_status
// / min_amount / max_amount) both in the Zod filter schema and in the DB
// columns used as indexed predicates. Until those are lifted into a
// scenario-neutral shape, we map channel semantics onto the same column names:
//
//   category            <- industry
//   brand               <- region (primary region)
//   currency            <- commission_model
//   availability_status <- opportunity_status
//   amount              <- commission_rate_percent
//
// Callers of /ocp/query therefore use the commerce-named filter keys, but the
// values are channel-native. The channel-native keys are also written into the
// projection so API consumers can see them in visible_attributes.

export function createChannelCatalogScenario(): CatalogScenarioModule {
  return {
    description: 'OCP Catalog node for channel / 招商 / 代理 opportunity discovery.',
    registryVisibility: 'public',
    objectContracts: buildChannelObjectContracts,
    providerSyncCapabilities: buildChannelSyncCapabilities,
    queryCapabilities: buildChannelQueryCapabilities,
    validateDescriptorPack,
    buildSearchProjection,
    buildExplainProjection,
    buildResolveActions,
  };
}

function buildChannelObjectContracts(): ObjectContract[] {
  return [
    {
      required_fields: [
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/title`,
        `${CHANNEL_COMMISSION_PACK}#/model`,
      ],
      optional_fields: [
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/summary`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/operator_name`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/industry`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/opportunity_url`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/opportunity_status`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/image_urls`,
        `${CHANNEL_COMMISSION_PACK}#/rate_percent`,
        `${CHANNEL_COMMISSION_PACK}#/flat_fee_amount`,
        `${CHANNEL_COMMISSION_PACK}#/flat_fee_currency`,
        `${CHANNEL_COMMISSION_PACK}#/settlement_cycle_days`,
        `${CHANNEL_COMMISSION_PACK}#/minimum_payout_amount`,
        `${CHANNEL_COVERAGE_PACK}#/regions`,
        `${CHANNEL_COVERAGE_PACK}#/industries`,
        `${CHANNEL_COVERAGE_PACK}#/languages`,
        `${CHANNEL_QUALIFICATION_PACK}#/level`,
        `${CHANNEL_QUALIFICATION_PACK}#/requires_business_license`,
        `${CHANNEL_QUALIFICATION_PACK}#/requires_prior_experience`,
        `${CHANNEL_QUALIFICATION_PACK}#/minimum_budget_amount`,
        `${CHANNEL_QUALIFICATION_PACK}#/minimum_budget_currency`,
        // contact.* fields are accepted but stored for Resolve-only exposure.
        `${CHANNEL_CONTACT_PACK}#/contact_name`,
        `${CHANNEL_CONTACT_PACK}#/contact_email`,
        `${CHANNEL_CONTACT_PACK}#/contact_phone`,
        `${CHANNEL_CONTACT_PACK}#/contact_url`,
      ],
      additional_fields_policy: 'allow',
    },
  ];
}

function buildChannelSyncCapabilities(): SyncCapability[] {
  return [
    {
      capability_id: 'ocp.push.batch',
      description: 'Provider pushes batched channel opportunity objects to the catalog sync API.',
      direction: 'provider_to_catalog',
      transport: 'http_push',
      sync_model: { snapshot: true, delta: false, stream: false },
      mutation_semantics: { upsert: true, delete: true },
      batching: { enabled: true, max_items: 100, max_bytes: 1048576 },
      cursoring: { enabled: false },
      streaming: { enabled: false },
      auth: { schemes: ['x-api-key'] },
      endpoint_contract: {
        hosted_by: 'catalog',
        path_hint: '/ocp/objects/sync',
        required_endpoint_fields: [],
      },
      metadata: {},
    },
  ];
}

function buildChannelQueryCapabilities(): CatalogManifest['query_capabilities'] {
  return [
    {
      capability_id: 'ocp.channel.opportunity.search.v1',
      name: 'Channel opportunity search',
      description: 'Searches channel / 招商 opportunities and returns resolvable candidates with contact bindings.',
      query_packs: [
        {
          pack_id: 'ocp.query.keyword.v1',
          description: 'Keyword-driven channel opportunity retrieval.',
          query_modes: ['keyword', 'hybrid'],
          metadata: {},
        },
        {
          pack_id: 'ocp.query.filter.v1',
          description: 'Structured filter retrieval for channel opportunities.',
          query_modes: ['filter', 'hybrid'],
          metadata: {},
        },
      ],
      input_fields: [
        { name: 'query_pack', type: 'string', required: false },
        { name: 'query_mode', type: 'string', required: false },
        { name: 'query', type: 'string', required: false },
        // See the aliasing note at the top of this file.
        { name: 'filters.category', type: 'string', required: false, description: 'industry' },
        { name: 'filters.brand', type: 'string', required: false, description: 'region' },
        { name: 'filters.currency', type: 'string', required: false, description: 'commission_model' },
        { name: 'filters.availability_status', type: 'string', required: false, description: 'opportunity_status' },
        { name: 'filters.provider_id', type: 'string', required: false },
        { name: 'filters.min_amount', type: 'number', required: false, description: 'min commission_rate_percent' },
        { name: 'filters.max_amount', type: 'number', required: false, description: 'max commission_rate_percent' },
      ],
      searchable_field_refs: [
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/title`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/summary`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/operator_name`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/industry`,
        `${CHANNEL_COVERAGE_PACK}#/industries`,
        `${CHANNEL_COVERAGE_PACK}#/regions`,
      ],
      filterable_field_refs: [
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/industry`,
        `${CHANNEL_OPPORTUNITY_CORE_PACK}#/opportunity_status`,
        `${CHANNEL_COMMISSION_PACK}#/model`,
        `${CHANNEL_COMMISSION_PACK}#/rate_percent`,
        `${CHANNEL_COVERAGE_PACK}#/regions`,
        `${CHANNEL_QUALIFICATION_PACK}#/level`,
      ],
      sortable_field_refs: [],
      supports_explain: true,
      supports_resolve: true,
      metadata: {
        scenario: 'channel_opportunity',
        filter_alias: {
          category: 'industry',
          brand: 'region',
          currency: 'commission_model',
          availability_status: 'opportunity_status',
          min_amount: 'min_commission_rate_percent',
          max_amount: 'max_commission_rate_percent',
        },
        query_hints: {
          filter_fields: ['category', 'brand', 'currency', 'availability_status', 'provider_id', 'min_amount', 'max_amount'],
          supported_query_languages: ['zh', 'en'],
          content_languages: ['zh', 'en'],
        },
      },
    },
  ];
}

function validateDescriptorPack(packId: string, data: unknown) {
  const validator = CHANNEL_PACK_VALIDATORS[packId];
  if (!validator) return { ok: true as const, data };

  const result = validator.safeParse(data);
  if (result.success) return { ok: true as const, data: result.data };

  return {
    ok: false as const,
    errors: result.error.issues.map((issue) => `${packId}${issue.path.length ? `/${issue.path.join('/')}` : ''}: ${issue.message}`),
  };
}

function buildSearchProjection(object: CommercialObject): SearchProjection {
  const coreTitle = stringField(readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/title`));
  const summary = stringField(object.summary ?? readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/summary`));
  const operatorName = stringField(readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/operator_name`));
  const industry = stringField(readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/industry`));
  const opportunityUrl = stringField(readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/opportunity_url`));
  const opportunityStatus = stringField(readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/opportunity_status`));

  const commissionModel = stringField(readDescriptorField(object, `${CHANNEL_COMMISSION_PACK}#/model`));
  const ratePercent = numberField(readDescriptorField(object, `${CHANNEL_COMMISSION_PACK}#/rate_percent`));
  const flatFeeAmount = numberField(readDescriptorField(object, `${CHANNEL_COMMISSION_PACK}#/flat_fee_amount`));
  const flatFeeCurrency = stringField(readDescriptorField(object, `${CHANNEL_COMMISSION_PACK}#/flat_fee_currency`));
  const settlementCycleDays = numberField(readDescriptorField(object, `${CHANNEL_COMMISSION_PACK}#/settlement_cycle_days`));

  const regions = stringArrayField(readDescriptorField(object, `${CHANNEL_COVERAGE_PACK}#/regions`));
  const industries = stringArrayField(readDescriptorField(object, `${CHANNEL_COVERAGE_PACK}#/industries`));
  const languages = stringArrayField(readDescriptorField(object, `${CHANNEL_COVERAGE_PACK}#/languages`));
  const primaryRegion = regions[0];

  const qualificationLevel = stringField(readDescriptorField(object, `${CHANNEL_QUALIFICATION_PACK}#/level`));
  const minimumBudgetAmount = numberField(readDescriptorField(object, `${CHANNEL_QUALIFICATION_PACK}#/minimum_budget_amount`));
  const minimumBudgetCurrency = stringField(readDescriptorField(object, `${CHANNEL_QUALIFICATION_PACK}#/minimum_budget_currency`));

  const imageUrls = readDescriptorField(object, `${CHANNEL_OPPORTUNITY_CORE_PACK}#/image_urls`);
  const primaryImageUrl = Array.isArray(imageUrls) ? stringField(imageUrls[0]) : undefined;

  // Contact fields are stored under the `__contact__` key which is stripped
  // from visible_attributes (see packages/catalog-core/src/projection.ts) but
  // remains available to buildResolveActions at Resolve time.
  const contactName = stringField(readDescriptorField(object, `${CHANNEL_CONTACT_PACK}#/contact_name`));
  const contactEmail = stringField(readDescriptorField(object, `${CHANNEL_CONTACT_PACK}#/contact_email`));
  const contactPhone = stringField(readDescriptorField(object, `${CHANNEL_CONTACT_PACK}#/contact_phone`));
  const contactUrl = stringField(readDescriptorField(object, `${CHANNEL_CONTACT_PACK}#/contact_url`));
  const hiddenContact: Record<string, string> = {};
  if (contactName) hiddenContact.contact_name = contactName;
  if (contactEmail) hiddenContact.contact_email = contactEmail;
  if (contactPhone) hiddenContact.contact_phone = contactPhone;
  if (contactUrl) hiddenContact.contact_url = contactUrl;

  const title = coreTitle ?? object.title;
  const text = [
    title,
    summary,
    operatorName,
    industry,
    commissionModel,
    qualificationLevel,
    ...regions,
    ...industries,
    ...languages,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ').toLowerCase();

  const qualityTier = deriveQualityTier({
    summary,
    operatorName,
    industry,
    ratePercent,
    hasImage: Boolean(primaryImageUrl),
    hasOpportunityUrl: Boolean(opportunityUrl),
    regionCount: regions.length,
  });

  return {
    title,
    ...(summary ? { summary } : {}),
    ...(operatorName ? { operator_name: operatorName } : {}),

    // Channel-native keys.
    ...(industry ? { industry } : {}),
    ...(primaryRegion ? { region: primaryRegion } : {}),
    ...(regions.length > 0 ? { regions } : {}),
    ...(industries.length > 0 ? { covered_industries: industries } : {}),
    ...(languages.length > 0 ? { languages } : {}),
    ...(commissionModel ? { commission_model: commissionModel } : {}),
    ...(ratePercent !== undefined ? { commission_rate_percent: ratePercent } : {}),
    ...(flatFeeAmount !== undefined ? { flat_fee_amount: flatFeeAmount } : {}),
    ...(flatFeeCurrency ? { flat_fee_currency: flatFeeCurrency } : {}),
    ...(settlementCycleDays !== undefined ? { settlement_cycle_days: settlementCycleDays } : {}),
    ...(opportunityStatus ? { opportunity_status: opportunityStatus } : {}),
    ...(opportunityUrl ? { opportunity_url: opportunityUrl } : {}),
    ...(qualificationLevel ? { qualification_level: qualificationLevel } : {}),
    ...(minimumBudgetAmount !== undefined ? { minimum_budget_amount: minimumBudgetAmount } : {}),
    ...(minimumBudgetCurrency ? { minimum_budget_currency: minimumBudgetCurrency } : {}),
    ...(primaryImageUrl ? { primary_image_url: primaryImageUrl } : {}),
    quality_tier: qualityTier,

    // Commerce-named aliases so the hardcoded QueryService filters work.
    ...(industry ? { category: industry } : {}),
    ...(primaryRegion ? { brand: primaryRegion } : {}),
    ...(commissionModel ? { currency: commissionModel } : {}),
    ...(opportunityStatus ? { availability_status: opportunityStatus } : {}),
    ...(ratePercent !== undefined ? { amount: ratePercent } : {}),

    ...(object.source_url ? { source_url: object.source_url } : {}),
    ...(Object.keys(hiddenContact).length > 0 ? { __contact__: hiddenContact } : {}),
    provider_id: object.provider_id,
    object_id: object.object_id,
    text,
  };
}

function buildExplainProjection(object: CommercialObject, projection: SearchProjection) {
  return {
    indexed_fields: Object.keys(projection).filter((key) => key !== 'text'),
    descriptor_packs: object.descriptors.map((descriptor) => descriptor.pack_id),
    scenario: 'channel_opportunity',
    filter_alias_note:
      'category=industry, brand=region, currency=commission_model, availability_status=opportunity_status, amount=commission_rate_percent',
  };
}

function buildResolveActions(projection: Record<string, unknown>): ActionBinding[] {
  const actions: ActionBinding[] = [];

  const opportunityUrl = stringField(projection.opportunity_url) ?? stringField(projection.source_url);
  if (opportunityUrl) {
    actions.push({
      action_id: 'view_opportunity',
      action_type: 'url',
      label: 'View channel opportunity',
      url: opportunityUrl,
      method: 'GET',
    });
  }

  // Contact bindings are built at resolve-time from the raw commercial object,
  // which the engine surfaces to us via the projection's object_id. Since the
  // resolve pipeline only passes the projection (not the raw object) to
  // buildResolveActions, we instead encode the contact fields directly into
  // the projection under an underscore-prefixed key during sync. We then peel
  // them back out here.
  const contact = asRecord(projection.__contact__);
  const contactEmail = stringField(contact.contact_email);
  if (contactEmail) {
    actions.push({
      action_id: 'contact_operator_email',
      action_type: 'url',
      label: 'Email招商方',
      url: `mailto:${contactEmail}`,
      method: 'GET',
    });
  }
  const contactPhone = stringField(contact.contact_phone);
  if (contactPhone) {
    actions.push({
      action_id: 'contact_operator_phone',
      action_type: 'url',
      label: 'Call招商方',
      url: `tel:${contactPhone.replace(/[^+\d]/g, '')}`,
      method: 'GET',
    });
  }
  const contactUrl = stringField(contact.contact_url);
  if (contactUrl) {
    actions.push({
      action_id: 'contact_operator_form',
      action_type: 'url',
      label: 'Open contact form',
      url: contactUrl,
      method: 'GET',
    });
  }

  return actions;
}

function deriveQualityTier(input: {
  summary?: string;
  operatorName?: string;
  industry?: string;
  ratePercent?: number;
  hasImage: boolean;
  hasOpportunityUrl: boolean;
  regionCount: number;
}) {
  const hasBasics = Boolean(input.operatorName) && Boolean(input.industry) && input.hasOpportunityUrl;
  const hasRich = Boolean(input.summary) && input.hasImage && input.regionCount > 0 && input.ratePercent !== undefined;

  if (hasBasics && hasRich) return 'rich';
  if (hasBasics) return 'standard';
  return 'basic';
}

function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
