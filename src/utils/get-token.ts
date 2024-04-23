import needle from 'needle';

import env from './env.js';

export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

let tokenData: TokenData | null = null;

export default async () => {
  if (tokenData && new Date(tokenData.expires_at).getTime() - 1000 * 60 > Date.now()) {
    return tokenData;
  }

  const tokenResponse = await needle(
    'post',
    'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
    {
      grant_type: 'device_auth',
      token_type: 'eg1',
      account_id: env.EPIC_ACCOUNT_ID,
      device_id: env.EPIC_DEVICE_ID,
      secret: env.EPIC_DEVICE_SECRET,
    },
    {
      auth: 'basic',
      username: env.EPIC_CLIENT_ID,
      password: env.EPIC_CLIENT_SECRET,
    },
  );

  if (tokenResponse.statusCode !== 200) {
    console.log(tokenResponse.body);

    throw new Error('Failed to get token');
  }

  tokenData = <TokenData>tokenResponse.body;

  return tokenData;
};
