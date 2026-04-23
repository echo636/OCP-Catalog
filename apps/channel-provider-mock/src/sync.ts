import { buildSyncRequest } from './build-payloads';
import { catalogClient } from './catalog-client';
import { channelMockConfig } from './config';
import { demoOpportunities } from './demo-opportunities';

const registrationVersion = Number(process.env.CHANNEL_REGISTRATION_VERSION ?? '1');
const syncRequest = buildSyncRequest(registrationVersion, demoOpportunities);

console.log(
  `[channel-provider-mock] syncing ${demoOpportunities.length} opportunities to ${channelMockConfig.catalogBaseUrl} as ${channelMockConfig.providerId} v${registrationVersion}`,
);
const result = await catalogClient.syncObjects(syncRequest);
console.log('[channel-provider-mock] sync result:');
console.log(JSON.stringify(result, null, 2));
