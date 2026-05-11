// End-to-end user journey: a client that only knows the OCP Center URL
// must be able to discover the channel catalog, get a route hint, use the
// route hint to query real opportunity data, and resolve one into a
// contactable ResolvableReference.
//
// This proves the runtime pathway (not just isolated assertions):
//
//   Client ──► Center /ocp/catalogs/search
//          ◄── route_hint { query_url, resolve_url }
//          ──► <route_hint.query_url>       (real opportunity list)
//          ──► <route_hint.resolve_url>     (contact mailto action)
//
// The client never hardcodes http://localhost:4001.

const registrationBaseUrl = 'http://localhost:4100';
const registrationVersion = Math.floor(Date.now() / 1000);

// Pre-step: ensure the channel catalog is registered to Center. In a real
// deployment this is done once by ops; here we do it at the start of every
// run so the script is self-contained.
await registerChannelCatalog();

console.log('\n=== User journey starts: client only knows the Center URL ===');

// Step 1: client asks Center for a catalog that handles 招商
const searchResult = await post(`${registrationBaseUrl}/ocp/catalogs/search`, {
  ocp_version: '1.0',
  kind: 'CatalogSearchRequest',
  query: '招商',
  filters: { tag: '招商' },
  limit: 5,
  explain: true,
});
console.log(`\nStep 1: Center returned ${searchResult.items.length} candidate catalog(s).`);
if (searchResult.items.length === 0) throw new Error('Center returned no catalogs for tag=招商');
const chosen = searchResult.items[0];
console.log(`  - picked catalog: ${chosen.catalog_id} (${chosen.catalog_name})`);
console.log(`  - route_hint.query_url   = ${chosen.route_hint.query_url}`);
console.log(`  - route_hint.resolve_url = ${chosen.route_hint.resolve_url}`);
console.log(`  - explain: ${chosen.explain.join(' | ')}`);

const queryUrl = chosen.route_hint.query_url;
const resolveUrl = chosen.route_hint.resolve_url;
if (typeof queryUrl !== 'string' || typeof resolveUrl !== 'string') {
  throw new Error('Route hint did not include query_url / resolve_url');
}

// Step 2: client uses ONLY the route hint (not a hardcoded catalog URL) to query
const queryResult = await post(queryUrl, {
  ocp_version: '1.0',
  kind: 'CatalogQueryRequest',
  query: 'SaaS CRM',
  filters: { category: 'enterprise_saas', brand: 'china_east' },
  limit: 5,
  explain: true,
});
console.log(`\nStep 2: Catalog returned ${queryResult.result_count} match(es) for "SaaS CRM" in enterprise_saas/china_east.`);
if (queryResult.result_count === 0) throw new Error('Catalog returned zero results for the expected query');
for (const item of queryResult.items) {
  console.log(`  - ${item.title}  [${item.attributes.commission_model} ${item.attributes.commission_rate_percent}%]`);
  // Contact must not leak in search.
  for (const key of Object.keys(item.attributes)) {
    if (key.startsWith('contact') || key.startsWith('__')) {
      throw new Error(`Search leaked sensitive key: ${key}`);
    }
  }
}

// Step 3: client resolves the first result via the route hint's resolve URL
const pick = queryResult.items[0];
const reference = await post(resolveUrl, {
  ocp_version: '1.0',
  kind: 'ResolveRequest',
  entry_id: pick.entry_id,
});
console.log(`\nStep 3: Resolved "${pick.title}".`);
console.log(`  - kind = ${reference.kind}`);
console.log(`  - visible_attributes.keys: ${Object.keys(reference.visible_attributes).join(', ')}`);
for (const key of Object.keys(reference.visible_attributes)) {
  if (key.startsWith('contact') || key.startsWith('__')) {
    throw new Error(`Resolve leaked sensitive key into visible_attributes: ${key}`);
  }
}

const bindings = reference.action_bindings ?? [];
console.log(`  - action_bindings (${bindings.length}):`);
for (const b of bindings) {
  console.log(`      [${b.action_id}] ${b.label} -> ${b.url}`);
}

const emailBinding = bindings.find((b: any) => b.action_id === 'contact_operator_email');
if (!emailBinding) throw new Error('Resolve did not expose contact_operator_email action binding');
if (!/^mailto:/.test(emailBinding.url)) throw new Error(`Expected mailto: URL, got ${emailBinding.url}`);

const viewBinding = bindings.find((b: any) => b.action_id === 'view_opportunity');
if (!viewBinding) throw new Error('Resolve did not expose view_opportunity action binding');

console.log('\n=== Journey complete ===');
console.log(`Center → Catalog(${chosen.catalog_id}) discovery + query + resolve succeeded.`);
console.log(`Contact surfaced exclusively via action binding: ${emailBinding.url}`);

async function registerChannelCatalog() {
  // Fetch channel catalog discovery to learn the catalog_id + URLs, then tell Center.
  // We DO hardcode http://localhost:4001 here because this is the ops step,
  // not the client-side journey. The journey after this line uses only Center.
  const catalogBaseUrl = 'http://localhost:4001';
  const discovery = await get(`${catalogBaseUrl}/.well-known/ocp-catalog`);
  await post(`${registrationBaseUrl}/ocp/catalogs/register`, {
    ocp_version: '1.0',
    kind: 'CatalogRegistration',
    id: `catreg_${discovery.catalog_id}_${registrationVersion}`,
    registration_id: 'registration_local_dev',
    catalog_id: discovery.catalog_id,
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
  console.log(`(ops) Registered channel catalog "${discovery.catalog_id}" to Center at v${registrationVersion}.`);
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
