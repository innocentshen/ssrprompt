import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { InternalError } from '@ssrprompt/shared';

export class EmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new InternalError('Email service is not configured');
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    return this.transporter;
  }

  async send(options: { to: string; subject: string; text: string }): Promise<void> {
    const transporter = this.getTransporter();
    const from = env.SMTP_FROM || env.SMTP_USER;
    if (!from) {
      throw new InternalError('Email sender is not configured');
    }

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
  }
}

export const emailService = new EmailService();

