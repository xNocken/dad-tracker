import needle from 'needle';

import type { TokenData } from './get-token';

export default async (auth: TokenData) => {
  const res = await needle(
    'delete',
    `https://account-public-service-prod.ol.epicgames.com/account/api/oauth/sessions/kill/${auth.access_token}`,
    null,
    {
      headers: {
        Authorization: `${auth.token_type} ${auth.access_token}`,
      },
    },
  );

  console.log('killed token', res.statusCode);
};
