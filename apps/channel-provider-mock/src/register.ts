import { buildChannelProviderRegistration } from './build-payloads';
import { catalogClient } from './catalog-client';
import { channelMockConfig } from './config';

const registrationVersion = Number(process.env.CHANNEL_REGISTRATION_VERSION ?? '1');
const registration = buildChannelProviderRegistration(registrationVersion);

console.log(`[channel-provider-mock] registering to ${channelMockConfig.catalogBaseUrl} as ${channelMockConfig.providerId} v${registrationVersion}`);
const result = await catalogClient.registerProvider(registration);
console.log('[channel-provider-mock] registration result:');
console.log(JSON.stringify(result, null, 2));
