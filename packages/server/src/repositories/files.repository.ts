import { Prisma, StoredFile } from '@prisma/client';
import { prisma } from '../config/database.js';
import { transformResponse } from '../utils/transform.js';
import { TenantRepository } from './base.repository.js';

type StoredFileDelegate = typeof prisma.storedFile;

export class FilesRepository extends TenantRepository<
  StoredFile,
  Prisma.StoredFileCreateInput,
  Prisma.StoredFileUpdateInput,
  StoredFileDelegate
> {
  protected delegate = prisma.storedFile;
  protected entityName = 'File';

  async create(userId: string, data: Omit<Prisma.StoredFileCreateInput, 'user'>): Promise<StoredFile> {
    const record = await this.delegate.create({
      data: {
        ...data,
        user: { connect: { id: userId } },
      },
    });

    return transformResponse(record);
  }

  async findById(userId: string, id: string): Promise<StoredFile | null> {
    const record = await super.findById(userId, id);
    return record ? transformResponse(record) : null;
  }
}

export const filesRepository = new FilesRepository();

