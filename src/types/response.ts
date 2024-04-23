export type DADResponse = Record<string, DADAssetType>;

export interface DADAssetType {
  meta: {
    promotion: number;
  };
  assets: Record<string, DADAsset>;
}

export interface DADAsset {
  meta: {
    revision: number;
    headRevision: number;
    revisedAt: string;
    promotion: number;
    promotedAt: string;
  };
  assetData: Record<string, unknown>;
}

// shortened
export interface ServiceVersionResponse {
  version: string;
  cln: string;
}
