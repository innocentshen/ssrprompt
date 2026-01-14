import type { EmailVerification, EmailVerificationType } from '@prisma/client';
import { prisma } from '../config/database.js';

export class EmailVerificationsRepository {
  async create(data: {
    email: string;
    codeHash: string;
    type: EmailVerificationType;
    expiresAt: Date;
  }): Promise<EmailVerification> {
    return prisma.emailVerification.create({
      data: {
        email: data.email,
        codeHash: data.codeHash,
        type: data.type,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findLatestSince(
    email: string,
    type: EmailVerificationType,
    since: Date
  ): Promise<EmailVerification | null> {
    return prisma.emailVerification.findFirst({
      where: {
        email,
        type,
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLatestActive(email: string, type: EmailVerificationType): Promise<EmailVerification | null> {
    return prisma.emailVerification.findFirst({
      where: {
        email,
        type,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementAttempts(id: string): Promise<EmailVerification> {
    return prisma.emailVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async markVerified(id: string): Promise<EmailVerification> {
    return prisma.emailVerification.update({
      where: { id },
      data: { verified: true },
    });
  }
}

export const emailVerificationsRepository = new EmailVerificationsRepository();

