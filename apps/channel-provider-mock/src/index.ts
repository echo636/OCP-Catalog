import { buildChannelProviderRegistration, buildSyncRequest } from './build-payloads';
import { catalogClient } from './catalog-client';
import { channelMockConfig } from './config';
import { demoOpportunities } from './demo-opportunities';

const registrationVersion = Number(process.env.CHANNEL_REGISTRATION_VERSION ?? '1');

console.log(`[channel-provider-mock] target: ${channelMockConfig.catalogBaseUrl} catalog_id=${channelMockConfig.catalogId} provider=${channelMockConfig.providerId}`);

console.log('[channel-provider-mock] step 1: register');
const registerResult = await catalogClient.registerProvider(buildChannelProviderRegistration(registrationVersion));
console.log(JSON.stringify(registerResult, null, 2));

console.log('[channel-provider-mock] step 2: sync');
const syncResult = await catalogClient.syncObjects(buildSyncRequest(registrationVersion, demoOpportunities));
console.log(JSON.stringify(syncResult, null, 2));

console.log('[channel-provider-mock] done.');
