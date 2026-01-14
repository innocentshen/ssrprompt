import { PromptGroup, Prisma } from '@prisma/client';
import { TenantRepository } from './base.repository.js';
import { prisma } from '../config/database.js';
import { transformResponse } from '../utils/transform.js';

type PromptGroupDelegate = typeof prisma.promptGroup;

export class PromptGroupsRepository extends TenantRepository<
  PromptGroup,
  Prisma.PromptGroupCreateInput,
  Prisma.PromptGroupUpdateInput,
  PromptGroupDelegate
> {
  protected delegate = prisma.promptGroup;
  protected entityName = 'PromptGroup';

  /**
   * Find all prompt groups for a user (flat list)
   */
  async findAllList(userId: string): Promise<PromptGroup[]> {
    const groups = await this.delegate.findMany({
      where: { userId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return groups.map(transformResponse);
  }

  /**
   * Find group by ID with ownership verification
   */
  async findById(userId: string, id: string): Promise<PromptGroup | null> {
    const group = await super.findById(userId, id);
    return group ? transformResponse(group) : null;
  }

  /**
   * Create a prompt group
   */
  async create(
    userId: string,
    data: Omit<Prisma.PromptGroupCreateInput, 'user'>
  ): Promise<PromptGroup> {
    const group = await this.delegate.create({
      data: {
        ...data,
        user: { connect: { id: userId } },
      },
    });

    return transformResponse(group);
  }

  /**
   * Update a prompt group
   */
  async update(userId: string, id: string, data: Prisma.PromptGroupUpdateInput): Promise<PromptGroup> {
    await this.findByIdOrThrow(userId, id);

    const group = await this.delegate.update({
      where: { id },
      data,
    });

    return transformResponse(group);
  }

  /**
   * Delete a prompt group
   */
  async delete(userId: string, id: string): Promise<PromptGroup> {
    await this.findByIdOrThrow(userId, id);
    const group = await this.delegate.delete({ where: { id } });
    return transformResponse(group);
  }
}

export const promptGroupsRepository = new PromptGroupsRepository();

