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

  async sendVerificationEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.transporter.sendMail({
      from: "FYLYM Writer <noreply@fylym.dev>",
      to,
      subject: "Verify your email — FYLYM Writer",
      text: `Welcome to FYLYM Writer!\n\nPlease verify your email by visiting:\n${link}\n\nThis link expires in 24 hours.\n\nIf you didn't create this account, you can safely ignore this email.`,
      html: `
        <h2>Welcome to FYLYM Writer!</h2>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${link}">Verify Email</a></p>
        <p>This link expires in 24 hours.</p>
        <p><small>If you didn't create this account, you can safely ignore this email.</small></p>
      `.trim(),
    });

    this.logger.log(`Verification email sent to ${to}`);
  }
}
