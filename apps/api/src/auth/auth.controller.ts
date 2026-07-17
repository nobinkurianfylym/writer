import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { JwtGuard } from "./jwt.guard";
import { RateLimitGuard } from "./rate-limit.guard";

interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken?: string;
}

const REFRESH_COOKIE = "fylym_refresh";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Refresh-cookie SameSite policy. Defaults to "strict" (web + API on one
 * site). When the web app is on a different site than the API (e.g. web on
 * *.workers.dev, API on *.railway.app) set COOKIE_SAMESITE=none so the
 * browser sends the cookie cross-site — which the spec requires to be Secure.
 */
function cookieSameSite(): "strict" | "lax" | "none" {
  const value = process.env.COOKIE_SAMESITE?.toLowerCase();
  return value === "none" || value === "lax" ? value : "strict";
}
function cookieSecure(): boolean {
  return cookieSameSite() === "none" || process.env.NODE_ENV === "production";
}

@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() body: RegisterBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId } = await this.auth.register(
      body.email,
      body.password,
      body.name,
    );

    const tokens = await this.auth.login(
      body.email,
      body.password,
      req.ip,
      req.headers["user-agent"],
    );

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      userId,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(
      body.email,
      body.password,
      req.ip,
      req.headers["user-agent"],
    );

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken =
      body?.refreshToken ?? this.extractRefreshCookie(req);

    if (!rawToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: { code: "UNAUTHORIZED", message: "Missing refresh token" },
      });
      return;
    }

    const tokens = await this.auth.refresh(
      rawToken,
      req.ip,
      req.headers["user-agent"],
    );

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  async logout(
    @Body() body: RefreshBody,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken =
      body?.refreshToken ?? this.extractRefreshCookie(req);
    if (rawToken) {
      await this.auth.logout(rawToken);
    }
    this.clearRefreshCookie(res);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtGuard)
  async logoutAll(@Req() req: Request) {
    await this.auth.logoutAll(req.user!.sub);
  }

  @Get("me")
  @UseGuards(JwtGuard)
  async me(@Req() req: Request) {
    const user = await this.auth.getUserById(req.user!.sub);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  /* ── Magic Links ── */

  @Post("magic-link")
  @HttpCode(HttpStatus.OK)
  async sendMagicLink(@Body() body: { email: string }) {
    await this.auth.sendMagicLink(body.email);
    return { message: "If that email is registered or valid, a sign-in link has been sent" };
  }

  @Post("magic-link/verify")
  @HttpCode(HttpStatus.OK)
  async verifyMagicLink(
    @Body() body: { token: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.verifyMagicLink(
      body.token,
      req.ip,
      req.headers["user-agent"],
    );

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      path: "/auth",
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      path: "/auth",
    });
  }

  private extractRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE];
  }
}
