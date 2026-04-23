export const channelMockConfig = {
  catalogBaseUrl: (process.env.CHANNEL_CATALOG_BASE_URL ?? 'http://localhost:4001').replace(/\/$/, ''),
  catalogId: process.env.CHANNEL_CATALOG_ID ?? 'channel_catalog_local_dev',
  apiKey: process.env.API_KEY_DEV ?? 'dev-api-key',
  providerId: process.env.CHANNEL_PROVIDER_ID ?? 'channel_provider_mock_local',
  providerName: process.env.CHANNEL_PROVIDER_NAME ?? 'Mock Channel Aggregator',
  providerHomepage: process.env.CHANNEL_PROVIDER_HOMEPAGE ?? 'https://channel-mock.example.test',
  providerContactEmail: process.env.CHANNEL_PROVIDER_CONTACT_EMAIL ?? 'ops@channel-mock.example.test',
  providerDomain: process.env.CHANNEL_PROVIDER_DOMAIN ?? 'channel-mock.example.test',
};
