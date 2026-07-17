import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { getApiEnv } from "../env";

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;
  private appUrl!: string;

  onModuleInit() {
    const env = getApiEnv();
    this.appUrl = env.APP_URL;
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
  }

  async sendMagicLinkEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const link = `${this.appUrl}/auth/magic?token=${encodeURIComponent(token)}`;

    await this.transporter.sendMail({
      from: "FYLYM Writer <noreply@fylym.dev>",
      to,
      subject: "Your sign-in link — FYLYM Writer",
      text: `Sign in to FYLYM Writer:\n${link}\n\nThis link expires in 10 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `
        <p>Sign in to FYLYM Writer:</p>
        <p><a href="${link}">Sign in</a></p>
        <p>This link expires in 10 minutes and can only be used once.</p>
        <p><small>If you didn't request this, you can safely ignore this email.</small></p>
      `.trim(),
    });

    this.logger.log(`Magic link email sent to ${to}`);
  }
}
