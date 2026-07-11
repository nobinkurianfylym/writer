import {
  Injectable,
  Logger,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import {
  importPKCS8,
  importSPKI,
  generateKeyPair,
  SignJWT,
  jwtVerify,
} from "jose";
import type {
  JWTPayload,
  CryptoKey as JoseKey,
} from "jose";
import { randomUUID } from "node:crypto";
import { getApiEnv } from "../env";

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  jti: string;
}

const ALG = "ES256";
const ISSUER = "fylym";
const ACCESS_TTL_SEC = 600; // 10 minutes

@Injectable()
export class JwtService implements OnModuleInit {
  private readonly logger = new Logger(JwtService.name);
  private privateKey!: JoseKey;
  private publicKey!: JoseKey;

  async onModuleInit() {
    const env = getApiEnv();
    const privatePem = env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    const publicPem = env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();

    if (privatePem && publicPem) {
      try {
        this.privateKey = await importPKCS8(privatePem, ALG);
        this.publicKey = await importSPKI(publicPem, ALG);
        return;
      } catch (err) {
        this.logger.warn(
          `JWT_PRIVATE_KEY/JWT_PUBLIC_KEY could not be parsed (${
            (err as Error).message
          }); generating an ephemeral ES256 keypair for this instance.`,
        );
      }
    } else {
      this.logger.warn(
        "JWT keys not configured; generating an ephemeral ES256 keypair for this instance.",
      );
    }

    // Ephemeral fallback: keeps the API bootable without a pinned key. Access
    // tokens are short-lived and refresh tokens live in Redis, so a key that
    // changes on restart only forces a silent token refresh, not a re-login.
    const { privateKey, publicKey } = await generateKeyPair(ALG);
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  async signAccessToken(userId: string): Promise<string> {
    const jti = randomUUID();
    return new SignJWT({ sub: userId, jti })
      .setProtectedHeader({ alg: ALG, typ: "JWT" })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SEC}s`)
      .sign(this.privateKey);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: [ALG],
        issuer: ISSUER,
      });
      if (!payload.sub || !payload.jti) {
        throw new UnauthorizedException("Malformed token");
      }
      return payload as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
