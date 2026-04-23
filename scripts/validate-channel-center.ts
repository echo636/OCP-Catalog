// Bypass upstream validate-center.ts bug (object_type is not in the strict
// filter schema). Verify the channel catalog can register to Center, be
// resolved, and be searched using the actually-supported filter keys.

const centerBaseUrl = 'http://localhost:4100';
const catalogBaseUrl = 'http://localhost:4001';
const centerId = 'center_local_dev';
const catalogId = 'channel_catalog_local_dev';
const registrationVersion = Math.floor(Date.now() / 1000);

const checks: string[] = [];
let catalogToken = '';

await check('Center + channel catalog are both healthy', async () => {
  const centerHealth = await get(`${centerBaseUrl}/health`);
  assert(centerHealth.ok === true, 'center health');
  const catalogHealth = await get(`${catalogBaseUrl}/health`);
  assert(catalogHealth.service === 'channel-catalog-api', 'channel catalog health');
});

await check('Center can fetch channel catalog discovery + manifest', async () => {
  const discovery = await get(`${catalogBaseUrl}/.well-known/ocp-catalog`);
  assert(discovery.catalog_id === catalogId, 'channel catalog_id should match');
  const manifest = await get(discovery.manifest_url);
  assert(manifest.kind === 'CatalogManifest', 'manifest kind');
  const capability = manifest.query_capabilities.find((c: any) => c.capability_id === 'ocp.channel.opportunity.search.v1');
  assert(capability, 'channel capability must be in manifest');
});

await check('Channel catalog registers to Center and is indexed', async () => {
  const result = await post(`${centerBaseUrl}/ocp/catalogs/register`, {
    ocp_version: '1.0',
    kind: 'CatalogRegistration',
    id: `catreg_${catalogId}_${registrationVersion}`,
    center_id: centerId,
    catalog_id: catalogId,
    registration_version: registrationVersion,
    updated_at: new Date().toISOString(),
    homepage: catalogBaseUrl,
    well_known_url: `${catalogBaseUrl}/.well-known/ocp-catalog`,
    claimed_domains: ['localhost'],
    operator: {
      operator_id: 'channel_local_dev_operator',
      display_name: 'Local Channel Catalog Operator',
      contact_email: 'ops@channel-mock.example.test',
    },
    intended_visibility: 'public',
    tags: ['local', 'channel', 'opportunity', '招商'],
  });
  assert(result.status === 'accepted_indexed', `expected accepted_indexed, got ${result.status}: ${JSON.stringify(result)}`);
  assert(result.indexed === true, 'registration should be indexed');
  assert(result.catalog_access_token, 'indexed registration should issue catalog token');
  catalogToken = result.catalog_access_token;
});

await check('Center resolve by catalog_id returns route hint to channel catalog', async () => {
  const routeHint = await post(`${centerBaseUrl}/ocp/catalogs/resolve`, {
    ocp_version: '1.0',
    kind: 'CatalogResolveRequest',
    catalog_id: catalogId,
  });
  assert(routeHint.catalog_id === catalogId, 'resolved catalog_id should match');
  assert(routeHint.query_url === `${catalogBaseUrl}/ocp/query`, `unexpected query_url: ${routeHint.query_url}`);
  assert(routeHint.manifest_url === `${catalogBaseUrl}/ocp/manifest`, `unexpected manifest_url: ${routeHint.manifest_url}`);
});

await check('Center GET /ocp/catalogs/:id exposes channel catalog profile', async () => {
  const info = await get(`${centerBaseUrl}/ocp/catalogs/${catalogId}`);
  assert(info.catalogId === catalogId, `catalog_id should match, got ${info.catalogId}`);
  assert(info.status === 'accepted_indexed', `status should be accepted_indexed, got ${info.status}`);
  assert(info.verificationStatus === 'verified', `verification should be verified, got ${info.verificationStatus}`);
});

await check('Center manifest snapshot retains channel contract', async () => {
  const snapshot = await get(`${centerBaseUrl}/ocp/catalogs/${catalogId}/manifest-snapshot`);
  const manifest = snapshot.manifestPayload;
  assert(manifest?.kind === 'CatalogManifest', `snapshot manifestPayload missing, got ${JSON.stringify(snapshot).slice(0, 200)}`);
  const capability = manifest.query_capabilities?.find((c: any) => c.capability_id === 'ocp.channel.opportunity.search.v1');
  assert(capability, 'snapshot should include channel capability');
  const contract = manifest.object_contracts?.[0];
  const requiredFlat = (contract?.required_fields ?? []).flatMap((r: unknown) => Array.isArray(r) ? r : [r]);
  assert(requiredFlat.includes('ocp.channel.opportunity.core.v1#/title'), 'snapshot should retain channel required fields');
  assert(requiredFlat.includes('ocp.channel.commission.v1#/model'), 'snapshot should retain commission.model');
});

await check('Catalog search with `tag=招商` returns channel catalog', async () => {
  const result = await post(`${centerBaseUrl}/ocp/catalogs/search`, {
    ocp_version: '1.0',
    kind: 'CatalogSearchRequest',
    query: 'channel',
    filters: { tag: '招商' },
    limit: 10,
    explain: true,
  });
  const item = result.items.find((candidate: any) => candidate.catalog_id === catalogId);
  assert(item, `search should find channel catalog; got items=${JSON.stringify(result.items.map((i: any) => i.catalog_id))}`);
  assert(item.route_hint.query_url === `${catalogBaseUrl}/ocp/query`, 'route hint query_url should match');
});

await check('Catalog refresh with token works', async () => {
  const result = await post(`${centerBaseUrl}/ocp/catalogs/${catalogId}/refresh`, {}, {
    'x-catalog-token': catalogToken,
  });
  assert(result.status === 'refreshed', `expected refreshed, got ${result.status}`);
});

console.log(`\nChannel catalog ↔ Center integration passed (${checks.length} checks).`);
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

async function get(url: string): Promise<any> {
  const response = await fetch(url);
  return parse(response);
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return parse(response);
}

async function parse(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  return payload;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
