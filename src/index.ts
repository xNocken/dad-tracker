import { execSync } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';

import needle from 'needle';

import env from './utils/env.js';
import getToken from './utils/get-token.js';
import killToken from './utils/kill-token.js';

import type { Meta } from './types/meta';
import type { DADAsset, DADResponse, ServiceVersionResponse } from './types/response';

interface UpdatedAsset {
  assetType: string;
  assetId: string;
  asset: DADAsset;
}

const baseFolder = 'output';
const persistentFolder = `${baseFolder}/+persistent`;
const persistentMeta = `${persistentFolder}/+meta.json`;
const folders = [baseFolder, persistentFolder];

const assetTypes = [
  'AthenaGadgetItemDefinition',
  'DAD_CosmeticItemUserOptions',
  'FortAmmoItemDefinition',
  'FortBuildingItemDefinition',
  'FortContextTrapItemDefinition',
  'FortCreativeActorCollection',
  'FortCreativeDiscoverySurface',
  'FortCreativeGadgetItemDefinition',
  'FortCreativeWeaponMeleeItemDefinition',
  'FortDecoItemDefinition',
  'FortEditToolItemDefinition',
  'FortPlaylistAthena',
  'FortPlaysetGrenadeItemDefinition',
  'FortPlaysetItemDefinition',
  'FortPlaysetPropItemDefinition',
  'FortResourceItemDefinition',
  'FortSmartBuildingItemDefinition',
  'FortTrapItemDefinition',
  'FortWeaponMeleeDualWieldItemDefinition',
  'FortWeaponMeleeItemDefinition',
  'FortWeaponRangedItemDefinition',
];

const getCachedMeta = async () => {
  if (!fs.existsSync(persistentMeta)) {
    return null;
  }

  const content = await fsp.readFile(persistentMeta, 'utf-8');

  return <Meta>JSON.parse(content);
};

const main = async () => {
  for (let i = 0; i < folders.length; i += 1) {
    const folder = folders[i];

    if (!fs.existsSync(folder)) {
      await fsp.mkdir(folder, { recursive: true });
    }
  }

  const cachedMeta = await getCachedMeta();
  const versionResponse = await needle('get', 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/version');

  if (versionResponse.statusCode !== 200) {
    console.log(versionResponse.statusCode, versionResponse.statusMessage, versionResponse.body);

    throw new Error('Failed to get fn version');
  }

  const { cln } = <ServiceVersionResponse>versionResponse.body;
  const version = '17.00';
  const gameId = 'Fortnite';
  const branch = `++${gameId}+Release-${version}`; // ++Fortnite+Release-29.20
  const auth = await getToken();

  const dadResponse = await needle(
    'post',
    `https://data-asset-directory-public-service-prod.ol.epicgames.com/api/v1/assets/${gameId}/${branch}/${cln}?appId=${gameId}`,
    Object.fromEntries(assetTypes.map((assetType) => [assetType, 0])),
    {
      json: true,
      headers: {
        Authorization: `${auth.token_type} ${auth.access_token}`,
      },
    },
  );

  // always kill token before checking any response
  await killToken(auth);

  if (dadResponse.statusCode !== 200) {
    console.log(dadResponse.statusCode, dadResponse.statusMessage, dadResponse.body);

    throw new Error('Failed to get dad');
  }

  const dadAssetTypes = Object.entries(<DADResponse>dadResponse.body).sort((a, b) => a[0].localeCompare(b[0]));
  const updatedAssets: UpdatedAsset[] = [];

  const updatedMeta: Meta = {
    version,
    assetVersions: {},
  };

  for (let i = 0; i < dadAssetTypes.length; i += 1) {
    const [dadAssetType, dadAssetTypeData] = dadAssetTypes[i];
    const dadAssets = Object.entries(dadAssetTypeData.assets).sort((a, b) => a[0].localeCompare(b[0]));

    for (let j = 0; j < dadAssets.length; j += 1) {
      const [dadAssetId, dadAssetData] = dadAssets[j];
      const dadAssetVersion = dadAssetData.meta.revision;
      const cachedAssetVersion = cachedMeta?.assetVersions?.[dadAssetType]?.[dadAssetId];

      const isUpdated = cachedMeta?.version !== version
        || !cachedAssetVersion
        || cachedAssetVersion < dadAssetVersion;

      updatedMeta.assetVersions[dadAssetType] ??= {};
      updatedMeta.assetVersions[dadAssetType][dadAssetId] = dadAssetVersion;

      if (isUpdated) {
        updatedAssets.push({
          assetType: dadAssetType,
          assetId: dadAssetId,
          asset: dadAssetData,
        });
      }
    }
  }

  if (updatedAssets.length === 0) {
    console.log('nothing new');

    return;
  }

  const versionFolder = `${baseFolder}/v${version}`;

  // clear files from older versions
  if (fs.existsSync(persistentFolder)) {
    await fsp.rmdir(persistentFolder, { recursive: true });
    await fsp.mkdir(persistentFolder, { recursive: true });
  }

  // ensure version folder
  if (!fs.existsSync(versionFolder)) {
    await fsp.mkdir(versionFolder, { recursive: true });
  }

  // write meta
  const serializedUpdatedMeta = JSON.stringify(updatedMeta, null, 2);
  await fsp.writeFile(persistentMeta, serializedUpdatedMeta);
  await fsp.writeFile(`${versionFolder}/+meta.json`, serializedUpdatedMeta);

  // write persitent files
  for (let i = 0; i < dadAssetTypes.length; i += 1) {
    const [dadAssetType, dadAssetTypeData] = dadAssetTypes[i];
    const serializedAssetTypeData = JSON.stringify(dadAssetTypeData, null, 2);

    await fsp.writeFile(`${persistentFolder}/${dadAssetType}.json`, serializedAssetTypeData);
    await fsp.writeFile(`${versionFolder}/${dadAssetType}.json`, serializedAssetTypeData);
  }

  // write inidivdual files
  for (let i = 0; i < updatedAssets.length; i += 1) {
    const data = updatedAssets[i];
    const assetIdFolder = `${versionFolder}/${data.assetType}/${data.assetId}`;

    if (!fs.existsSync(assetIdFolder)) {
      await fsp.mkdir(assetIdFolder, { recursive: true });
    }

    await fsp.writeFile(`${assetIdFolder}/${data.asset.meta.revision}.json`, JSON.stringify(data.asset, null, 2));
  }

  let commitMessage = `v${version} Update: `;

  if (updatedAssets.length > 3) {
    commitMessage += `${updatedAssets.length} assets`;
    commitMessage += `\n${updatedAssets.map((e) => `- ${e.assetType} - ${e.assetId} - v${e.asset.meta.revision}`).join('\n')}`;
  } else {
    commitMessage += updatedAssets.map((e) => `${e.assetId} v${e.asset.meta.revision}`).join(', ');
  }

  console.log(commitMessage);

  // execSync('git add output');
  // execSync(`git -c commit.gpgsign=false commit --author="github-actions@github.com" -m "${commitMessage}"`);
  // execSync('git push');

  let fieldValue = '';
  let overflowCount = 0;

  updatedAssets.forEach((data) => {
    const assetText = `- ${data.assetId} (v${data.asset.meta.revision})\n`;

    if (fieldValue.length + assetText.length > 1000) {
      overflowCount += 1;

      return;
    }

    fieldValue += assetText;
  });

  if (overflowCount) {
    fieldValue += `- + ${overflowCount} more`;
  }

  const webhookResponse = await needle('post', env.WEBHOOK_URL, {
    embeds: [{
      title: 'Update',
      color: 1752220, // Aqua
      description: `**${updatedAssets.length}** assets updated`,
      fields: [{
        name: 'Assets',
        value: fieldValue,
      }],
    }],
  }, {
    json: true,
  });

  if (webhookResponse.statusCode !== 204) {
    console.log(webhookResponse.body);

    throw new Error('Failed to send webhook');
  }
};

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
