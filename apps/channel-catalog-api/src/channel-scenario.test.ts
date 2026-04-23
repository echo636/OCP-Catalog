import { describe, expect, test } from 'bun:test';
import { createChannelCatalogScenario } from './channel-scenario';

const richOpportunity = {
  ocp_version: '1.0' as const,
  kind: 'CommercialObject' as const,
  id: 'obj_1',
  object_id: 'saas-crm-east-001',
  object_type: 'channel_opportunity',
  provider_id: 'provider-1',
  title: '企业 SaaS CRM 华东代理招募',
  summary: '面向中小企业客户的 SaaS CRM 代理计划，提供续约分成与区域独家权益。',
  status: 'active' as const,
  source_url: 'https://provider.example/opportunities/saas-crm-east-001',
  descriptors: [
    {
      pack_id: 'ocp.channel.opportunity.core.v1',
      data: {
        title: '企业 SaaS CRM 华东代理招募',
        summary: '面向中小企业客户的 SaaS CRM 代理计划，提供续约分成与区域独家权益。',
        operator_name: 'Sino-Cloud CRM',
        industry: 'enterprise_saas',
        opportunity_url: 'https://provider.example/opportunities/saas-crm-east-001',
        opportunity_status: 'open',
        image_urls: ['https://provider.example/img/saas-crm-east-001.jpg'],
      },
    },
    {
      pack_id: 'ocp.channel.commission.v1',
      data: {
        model: 'revshare',
        rate_percent: 25,
        settlement_cycle_days: 30,
      },
    },
    {
      pack_id: 'ocp.channel.coverage.v1',
      data: {
        regions: ['china_east'],
        industries: ['enterprise_saas', 'smb'],
        languages: ['zh'],
      },
    },
    {
      pack_id: 'ocp.channel.qualification.v1',
      data: {
        level: 'verified',
        requires_business_license: true,
      },
    },
    {
      pack_id: 'ocp.channel.contact.v1',
      data: {
        contact_name: 'Zhang Wei',
        contact_email: 'partners-east@sino-cloud.example.test',
        contact_phone: '+86 21 5555 0101',
      },
    },
  ],
};

describe('channel-scenario', () => {
  test('requires title and commission.model for channel opportunities', () => {
    const scenario = createChannelCatalogScenario();
    expect(scenario.objectContracts()[0]?.required_fields).toEqual([
      'ocp.channel.opportunity.core.v1#/title',
      'ocp.channel.commission.v1#/model',
    ]);
  });

  test('advertises the channel opportunity search capability with keyword+filter packs', () => {
    const scenario = createChannelCatalogScenario();
    const capability = scenario.queryCapabilities()[0];
    expect(capability?.capability_id).toBe('ocp.channel.opportunity.search.v1');
    const packIds = capability?.query_packs.map((p) => p.pack_id);
    expect(packIds).toContain('ocp.query.keyword.v1');
    expect(packIds).toContain('ocp.query.filter.v1');
  });

  test('declares the commerce-to-channel filter alias in manifest metadata', () => {
    const scenario = createChannelCatalogScenario();
    const capability = scenario.queryCapabilities()[0];
    const alias = (capability?.metadata as Record<string, unknown>).filter_alias as Record<string, string>;
    expect(alias.category).toBe('industry');
    expect(alias.brand).toBe('region');
    expect(alias.currency).toBe('commission_model');
    expect(alias.availability_status).toBe('opportunity_status');
    expect(alias.min_amount).toBe('min_commission_rate_percent');
    expect(alias.max_amount).toBe('max_commission_rate_percent');
  });

  test('builds a rich projection with both channel-native keys and commerce-named aliases', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection(richOpportunity);

    // Channel-native surface.
    expect(projection.industry).toBe('enterprise_saas');
    expect(projection.region).toBe('china_east');
    expect(projection.commission_model).toBe('revshare');
    expect(projection.commission_rate_percent).toBe(25);
    expect(projection.opportunity_status).toBe('open');
    expect(projection.qualification_level).toBe('verified');
    expect(projection.primary_image_url).toBe('https://provider.example/img/saas-crm-east-001.jpg');

    // Commerce-named aliases so catalog-core's hardcoded QueryService filters work.
    expect(projection.category).toBe('enterprise_saas');
    expect(projection.brand).toBe('china_east');
    expect(projection.currency).toBe('revshare');
    expect(projection.availability_status).toBe('open');
    expect(projection.amount).toBe(25);

    expect(projection.quality_tier).toBe('rich');
  });

  test('stores contact fields under __contact__ so search projection never exposes them directly', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection(richOpportunity);

    // contact.* must never appear as top-level projection keys.
    for (const key of Object.keys(projection)) {
      expect(key.startsWith('contact_')).toBe(false);
    }

    const contact = projection.__contact__ as Record<string, string> | undefined;
    expect(contact?.contact_email).toBe('partners-east@sino-cloud.example.test');
    expect(contact?.contact_phone).toBe('+86 21 5555 0101');
  });

  test('search projection text is free of contact info', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection(richOpportunity);
    const text = String(projection.text ?? '');
    expect(text).not.toContain('partners-east');
    expect(text).not.toContain('5555 0101');
    expect(text).toContain('saas');
  });

  test('falls back to basic quality tier when only minimum channel fields are present', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection({
      ...richOpportunity,
      source_url: undefined,
      descriptors: [
        {
          pack_id: 'ocp.channel.opportunity.core.v1',
          data: { title: 'Bare opportunity' },
        },
        {
          pack_id: 'ocp.channel.commission.v1',
          data: { model: 'flat_fee' },
        },
      ],
    });
    expect(projection.quality_tier).toBe('basic');
    expect(projection.primary_image_url).toBeUndefined();
  });

  test('buildResolveActions exposes view_opportunity and channel contact bindings', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection(richOpportunity);
    const actions = scenario.buildResolveActions?.(projection) ?? [];
    const actionIds = actions.map((a) => a.action_id);

    expect(actionIds).toContain('view_opportunity');
    expect(actionIds).toContain('contact_operator_email');
    expect(actionIds).toContain('contact_operator_phone');

    const emailAction = actions.find((a) => a.action_id === 'contact_operator_email');
    expect(emailAction?.url).toBe('mailto:partners-east@sino-cloud.example.test');

    const phoneAction = actions.find((a) => a.action_id === 'contact_operator_phone');
    // Phone URL should strip whitespace / spacer chars but keep + and digits.
    expect(phoneAction?.url).toBe('tel:+862155550101');
  });

  test('buildResolveActions returns no contact bindings when __contact__ is absent', () => {
    const scenario = createChannelCatalogScenario();
    const projection = scenario.buildSearchProjection({
      ...richOpportunity,
      descriptors: richOpportunity.descriptors.filter((d) => d.pack_id !== 'ocp.channel.contact.v1'),
    });
    const actions = scenario.buildResolveActions?.(projection) ?? [];
    const contactActionIds = actions.map((a) => a.action_id).filter((id) => id.startsWith('contact_'));
    expect(contactActionIds).toHaveLength(0);
  });

  test('validateDescriptorPack rejects commission.model outside the enum', () => {
    const scenario = createChannelCatalogScenario();
    const good = scenario.validateDescriptorPack('ocp.channel.commission.v1', {
      model: 'revshare',
      rate_percent: 25,
    });
    expect(good.ok).toBe(true);

    const bad = scenario.validateDescriptorPack('ocp.channel.commission.v1', {
      model: 'not_a_real_model',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.some((msg) => msg.includes('commission.v1'))).toBe(true);
    }
  });

  test('validateDescriptorPack passes unknown packs through', () => {
    const scenario = createChannelCatalogScenario();
    const result = scenario.validateDescriptorPack('ocp.unknown.pack.v1', { foo: 'bar' });
    expect(result.ok).toBe(true);
  });

  test('advertises the commerce-aliased filter keys in input_fields', () => {
    const scenario = createChannelCatalogScenario();
    const capability = scenario.queryCapabilities()[0];
    const inputNames = capability?.input_fields.map((field) => (field as { name: string }).name);

    expect(inputNames).toContain('filters.category');
    expect(inputNames).toContain('filters.brand');
    expect(inputNames).toContain('filters.currency');
    expect(inputNames).toContain('filters.availability_status');
    expect(inputNames).toContain('filters.min_amount');
    expect(inputNames).toContain('filters.max_amount');
  });
});
