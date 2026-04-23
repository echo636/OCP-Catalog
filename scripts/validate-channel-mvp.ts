// End-to-end validation for the channel / 招商 Catalog.
//
// Prereqs:
//   1. Postgres + pgvector running, DATABASE_URL set, db:migrate applied.
//   2. channel-catalog-api running, default http://localhost:4001.
//      Minimal boot:
//        bun apps/channel-catalog-api/src/index.ts
//      (Set CATALOG_API_PORT / CATALOG_PUBLIC_BASE_URL / CATALOG_ID /
//       CATALOG_NAME to override defaults.)
//
// Exercises: discovery -> manifest -> contracts -> register -> version bump
// -> sync -> keyword query -> filter query -> resolve (contact action only
// exposed at resolve, not in search attributes).

const baseUrl = (process.env.CHANNEL_CATALOG_BASE_URL ?? 'http://localhost:4001').replace(/\/$/, '');
const apiKey = process.env.API_KEY_DEV ?? 'dev-api-key';
const catalogId = process.env.CHANNEL_CATALOG_ID ?? 'channel_catalog_local_dev';
const providerId = `validate_channel_provider_${Date.now()}`;

const OPPORTUNITY_CORE_PACK = 'ocp.channel.opportunity.core.v1';
const COMMISSION_PACK = 'ocp.channel.commission.v1';
const COVERAGE_PACK = 'ocp.channel.coverage.v1';
const QUALIFICATION_PACK = 'ocp.channel.qualification.v1';
const CONTACT_PACK = 'ocp.channel.contact.v1';

const checks: string[] = [];

await check('Catalog health', async () => {
  const health = await get('/health');
  assert(health.ok === true, 'health.ok should be true');
  assert(health.service === 'channel-catalog-api', `unexpected service: ${health.service}`);
});

await check('Well-known discovery', async () => {
  const discovery = await get('/.well-known/ocp-catalog');
  assert(discovery.catalog_id === catalogId, `catalog_id mismatch: ${discovery.catalog_id}`);
  assert(typeof discovery.manifest_url === 'string', 'manifest_url should be present');
});

await check('Manifest advertises channel scenario', async () => {
  const manifest = await get('/ocp/manifest');
  assert(manifest.kind === 'CatalogManifest', 'manifest kind should match');
  assert(manifest.endpoints.object_sync.url, 'object_sync endpoint should exist');
  const capability = manifest.query_capabilities.find((cap: any) => cap.capability_id === 'ocp.channel.opportunity.search.v1');
  assert(capability, 'channel opportunity search capability should be advertised');
  assert(capability.metadata.scenario === 'channel_opportunity', 'scenario tag should be channel_opportunity');
});

await check('Contracts include channel_opportunity required fields', async () => {
  const contracts = await get('/ocp/contracts');
  const contract = contracts.contracts?.[0];
  assert(contract, 'at least one object contract should be published');
  const requiredFlat = (contract.required_fields ?? []).flatMap((r: unknown) => (Array.isArray(r) ? r : [r]));
  assert(requiredFlat.includes(`${OPPORTUNITY_CORE_PACK}#/title`), 'title must be required');
  assert(requiredFlat.includes(`${COMMISSION_PACK}#/model`), 'commission model must be required');
});

await check('Provider registration v1 succeeds', async () => {
  const result = await register(1);
  assert(result.status === 'accepted_full', `expected accepted_full, got ${result.status}: ${JSON.stringify(result.warnings ?? [])}`);
});

await check('Lower registration_version does not override active state', async () => {
  const result = await register(1);
  assert(result.effective_registration_version === 1, `expected effective v1, got ${result.effective_registration_version}`);
});

await check('Higher registration_version updates active state', async () => {
  const result = await register(2);
  assert(result.status === 'accepted_full', `expected accepted_full, got ${result.status}`);
  const provider = await get(`/ocp/providers/${providerId}`);
  assert(provider.active_registration_version === 2, `expected active v2, got ${provider.active_registration_version}`);
});

let acceptedEntryId = '';

await check('Object sync accepts valid channel opportunities', async () => {
  const result = await post('/ocp/objects/sync', syncRequest(2));
  assert(result.accepted_count >= 3, `expected >=3 accepted, got ${result.accepted_count}`);
  const accepted = result.items.find((item: any) => item.status === 'accepted' && item.object_id === 'saas-crm-east-val');
  assert(accepted?.catalog_entry_id, 'saas-crm-east-val should be accepted with entry id');
  acceptedEntryId = accepted.catalog_entry_id;
});

await check('Keyword query finds SaaS CRM east entry with explain', async () => {
  const result = await post('/ocp/query', {
    ocp_version: '1.0',
    kind: 'CatalogQueryRequest',
    query: 'SaaS CRM',
    limit: 10,
    explain: true,
  }, false);
  const item = result.items.find((candidate: any) => candidate.entry_id === acceptedEntryId);
  assert(item, `SaaS CRM keyword query should return entry ${acceptedEntryId}`);
  assert(result.explain.length > 0, 'query explain should be present');
});

await check('Filter query by industry/region/status narrows to east SaaS entries', async () => {
  const result = await post('/ocp/query', {
    ocp_version: '1.0',
    kind: 'CatalogQueryRequest',
    query: '',
    // Aliasing: category=industry, brand=region, availability_status=opportunity_status.
    filters: {
      category: 'enterprise_saas',
      brand: 'china_east',
      availability_status: 'open',
      provider_id: providerId,
    },
    limit: 10,
    explain: true,
  }, false);
  assert(result.items.length >= 1, 'filtered query should return at least one entry');
  for (const item of result.items) {
    assert(item.attributes.industry === 'enterprise_saas', `industry filter leak: ${item.attributes.industry}`);
    assert(item.attributes.region === 'china_east', `region filter leak: ${item.attributes.region}`);
  }
});

await check('Search attributes never leak contact.*', async () => {
  const result = await post('/ocp/query', {
    query: '',
    filters: { provider_id: providerId },
    limit: 50,
    explain: false,
  }, false);
  for (const item of result.items) {
    for (const key of Object.keys(item.attributes)) {
      assert(!key.startsWith('contact'), `search leaked contact field: ${key}`);
      assert(!key.startsWith('__'), `search leaked hidden key: ${key}`);
    }
  }
});

await check('Resolve surfaces contact via action bindings only', async () => {
  const result = await post('/ocp/resolve', {
    ocp_version: '1.0',
    kind: 'ResolveRequest',
    entry_id: acceptedEntryId,
  }, false);
  assert(result.kind === 'ResolvableReference', 'resolve kind should match');

  for (const key of Object.keys(result.visible_attributes ?? {})) {
    assert(!key.startsWith('contact'), `resolve visible_attributes leaked contact field: ${key}`);
    assert(!key.startsWith('__'), `resolve visible_attributes leaked hidden key: ${key}`);
  }

  const bindings = result.action_bindings ?? [];
  const hasViewOpportunity = bindings.some((b: any) => b.action_id === 'view_opportunity' && b.url);
  assert(hasViewOpportunity, 'view_opportunity action binding should exist');
  const hasContactAction = bindings.some((b: any) =>
    ['contact_operator_email', 'contact_operator_phone', 'contact_operator_form'].includes(b.action_id),
  );
  assert(hasContactAction, 'at least one contact action binding should be exposed at resolve time');
});

console.log(`\nChannel MVP validation passed (${checks.length} checks).`);
for (const label of checks) console.log(`- ${label}`);

async function check(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    checks.push(label);
    console.log(`ok - ${label}`);
  } catch (error) {
    console.error(`failed - ${label}`);
    throw error;
  }
}

async function get(path: string): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`);
  return parse(response);
}

async function post(path: string, body: unknown, writeAuth = true): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(writeAuth ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return parse(response);
}

async function parse(response: Response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function register(version: number) {
  return post('/ocp/providers/register', {
    ocp_version: '1.0',
    kind: 'ProviderRegistration',
    id: `reg_${providerId}_${version}`,
    catalog_id: catalogId,
    registration_version: version,
    updated_at: new Date().toISOString(),
    provider: {
      provider_id: providerId,
      entity_type: 'organization',
      display_name: 'Validation Channel Aggregator',
      homepage: 'https://validation-channel.example.test',
      contact_email: 'ops@validation-channel.example.test',
      domains: ['validation-channel.example.test'],
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
          `${OPPORTUNITY_CORE_PACK}#/industry`,
          `${OPPORTUNITY_CORE_PACK}#/opportunity_status`,
          `${COMMISSION_PACK}#/rate_percent`,
          `${COVERAGE_PACK}#/regions`,
          `${QUALIFICATION_PACK}#/level`,
          `${CONTACT_PACK}#/contact_email`,
          `${CONTACT_PACK}#/contact_phone`,
        ],
        sync: {
          preferred_capabilities: ['ocp.push.batch'],
          avoid_capabilities_unless_necessary: [],
          provider_endpoints: {},
        },
      },
    ],
  });
}

function syncRequest(version: number) {
  const valid = channelObject(
    'saas-crm-east-val',
    '企业 SaaS CRM 华东代理招募（验证）',
    'enterprise_saas',
    'china_east',
    'revshare',
    'open',
    25,
    { contact_email: 'partners-east@validation.example.test', contact_phone: '+86 21 5555 0000' },
  );
  const upsert = channelObject(
    'saas-crm-east-val',
    '企业 SaaS CRM 华东代理招募（验证 updated）',
    'enterprise_saas',
    'china_east',
    'revshare',
    'open',
    27,
    { contact_email: 'partners-east@validation.example.test' },
  );
  const otherIndustry = channelObject(
    'retail-food-val-002',
    '连锁茶饮区域加盟（验证）',
    'retail_food_beverage',
    'china_south',
    'flat_fee',
    'open',
    undefined,
    { contact_email: 'franchise@validation.example.test' },
  );
  const missingCommission = channelObject(
    'invalid-missing-commission-val-003',
    '非法 - 缺失 commission',
    'enterprise_saas',
    'china_east',
    'revshare',
    'open',
    undefined,
  );
  // Strip the commission descriptor to violate the contract's required_fields.
  missingCommission.descriptors = missingCommission.descriptors.filter((d: any) => d.pack_id !== COMMISSION_PACK);

  return {
    ocp_version: '1.0',
    kind: 'ObjectSyncRequest',
    catalog_id: catalogId,
    provider_id: providerId,
    registration_version: version,
    batch_id: `validate_channel_batch_${Date.now()}`,
    objects: [valid, upsert, otherIndustry, missingCommission],
  };
}

function channelObject(
  objectId: string,
  title: string,
  industry: string,
  region: string,
  commissionModel: 'revshare' | 'flat_fee' | 'tiered' | 'per_lead' | 'custom',
  opportunityStatus: 'open' | 'waitlist' | 'closed',
  ratePercent: number | undefined,
  contact: { contact_email?: string; contact_phone?: string } = {},
) {
  const descriptors: any[] = [
    {
      pack_id: OPPORTUNITY_CORE_PACK,
      data: {
        title,
        summary: `${title} validation sample`,
        operator_name: 'Validation Operator',
        industry,
        opportunity_url: `https://validation-channel.example.test/opportunities/${objectId}`,
        opportunity_status: opportunityStatus,
      },
    },
    {
      pack_id: COMMISSION_PACK,
      data: {
        model: commissionModel,
        ...(ratePercent !== undefined ? { rate_percent: ratePercent } : {}),
      },
    },
    {
      pack_id: COVERAGE_PACK,
      data: {
        regions: [region],
        industries: [industry],
        languages: ['zh'],
      },
    },
    {
      pack_id: QUALIFICATION_PACK,
      data: { level: 'basic' },
    },
  ];
  if (Object.keys(contact).length > 0) {
    descriptors.push({ pack_id: CONTACT_PACK, data: contact });
  }

  return {
    ocp_version: '1.0',
    kind: 'CommercialObject',
    id: `obj_${providerId}_${objectId}`,
    object_id: objectId,
    object_type: 'channel_opportunity',
    provider_id: providerId,
    title,
    summary: `${title} validation sample`,
    status: opportunityStatus === 'closed' ? 'inactive' : 'active',
    source_url: `https://validation-channel.example.test/opportunities/${objectId}`,
    descriptors,
  };
}
