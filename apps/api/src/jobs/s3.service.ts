import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  createS3Client,
  createArtifactStore,
  type ArtifactStore,
} from "@fylym/worker";
import { getApiEnv } from "../env";

/**
 * The API mints short-lived signed download URLs on demand when a job is
 * polled, so URLs always carry a fresh, brief TTL (§9) rather than being
 * stored long-lived.
 */
@Injectable()
export class S3Service implements OnModuleInit {
  private store!: ArtifactStore;

  onModuleInit() {
    const env = getApiEnv();
    const config = {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      signedUrlTtlSec: env.SIGNED_URL_TTL_SEC,
    };
    this.store = createArtifactStore(createS3Client(config), config);
  }

  signedDownloadUrl(key: string): Promise<string> {
    return this.store.signedDownloadUrl(key);
  }
}
