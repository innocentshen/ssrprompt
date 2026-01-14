import type { OAuthAccount, OAuthProvider } from '@prisma/client';
import { prisma } from '../config/database.js';

export class OAuthAccountsRepository {
  async findByProviderAccountId(
    provider: OAuthProvider,
    providerUserId: string
  ): Promise<OAuthAccount | null> {
    return prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
    });
  }

  async findByUserIdAndProvider(userId: string, provider: OAuthProvider): Promise<OAuthAccount | null> {
    return prisma.oAuthAccount.findFirst({
      where: { userId, provider },
    });
  }

  async create(data: {
    userId: string;
    provider: OAuthProvider;
    providerUserId: string;
    providerEmail?: string | null;
    name?: string | null;
    avatar?: string | null;
    accessTokenEncrypted?: string | null;
    refreshTokenEncrypted?: string | null;
    expiresAt?: Date | null;
  }): Promise<OAuthAccount> {
    return prisma.oAuthAccount.create({
      data: {
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        providerEmail: data.providerEmail ?? undefined,
        name: data.name ?? undefined,
        avatar: data.avatar ?? undefined,
        accessTokenEncrypted: data.accessTokenEncrypted ?? undefined,
        refreshTokenEncrypted: data.refreshTokenEncrypted ?? undefined,
        expiresAt: data.expiresAt ?? undefined,
      },
    });
  }

  async update(
    id: string,
    data: Partial<Pick<OAuthAccount, 'providerEmail' | 'name' | 'avatar' | 'accessTokenEncrypted' | 'refreshTokenEncrypted' | 'expiresAt'>>
  ): Promise<OAuthAccount> {
    return prisma.oAuthAccount.update({
      where: { id },
      data,
    });
  }
}

export const oauthAccountsRepository = new OAuthAccountsRepository();

