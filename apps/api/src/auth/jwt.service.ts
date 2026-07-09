import {
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { importPKCS8, importSPKI, SignJWT, jwtVerify } from "jose";
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
  private privateKey!: JoseKey;
  private publicKey!: JoseKey;

  async onModuleInit() {
    const env = getApiEnv();
    const privatePem = env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");
    const publicPem = env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");
    this.privateKey = await importPKCS8(privatePem, ALG);
    this.publicKey = await importSPKI(publicPem, ALG);
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
