/**
 * Database Seed Script
 * Initializes default roles, permissions, and admin user
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;
const SYSTEM_USER_ID = 'default';
const SYSTEM_USER_EMAIL = 'default@system.local';

// Default permissions
const DEFAULT_PERMISSIONS = [
  // Prompts
  { name: 'prompts:create', resource: 'prompts', action: 'create', description: 'Create prompts' },
  { name: 'prompts:read', resource: 'prompts', action: 'read', description: 'Read prompts' },
  { name: 'prompts:update', resource: 'prompts', action: 'update', description: 'Update prompts' },
  { name: 'prompts:delete', resource: 'prompts', action: 'delete', description: 'Delete prompts' },

  // Evaluations
  { name: 'evaluations:create', resource: 'evaluations', action: 'create', description: 'Create evaluations' },
  { name: 'evaluations:read', resource: 'evaluations', action: 'read', description: 'Read evaluations' },
  { name: 'evaluations:update', resource: 'evaluations', action: 'update', description: 'Update evaluations' },
  { name: 'evaluations:delete', resource: 'evaluations', action: 'delete', description: 'Delete evaluations' },
  { name: 'evaluations:run', resource: 'evaluations', action: 'run', description: 'Run evaluations' },

  // Traces
  { name: 'traces:read', resource: 'traces', action: 'read', description: 'Read traces' },
  { name: 'traces:delete', resource: 'traces', action: 'delete', description: 'Delete traces' },

  // Providers
  { name: 'providers:create', resource: 'providers', action: 'create', description: 'Create providers' },
  { name: 'providers:read', resource: 'providers', action: 'read', description: 'Read providers' },
  { name: 'providers:update', resource: 'providers', action: 'update', description: 'Update providers' },
  { name: 'providers:delete', resource: 'providers', action: 'delete', description: 'Delete providers' },

  // Models
  { name: 'models:create', resource: 'models', action: 'create', description: 'Create models' },
  { name: 'models:read', resource: 'models', action: 'read', description: 'Read models' },
  { name: 'models:update', resource: 'models', action: 'update', description: 'Update models' },
  { name: 'models:delete', resource: 'models', action: 'delete', description: 'Delete models' },

  // Users (admin only)
  { name: 'users:read', resource: 'users', action: 'read', description: 'Read users' },
  { name: 'users:update', resource: 'users', action: 'update', description: 'Update users' },
  { name: 'users:delete', resource: 'users', action: 'delete', description: 'Delete users' },
  { name: 'users:manage-roles', resource: 'users', action: 'manage-roles', description: 'Manage user roles' },

  // Roles (admin only)
  { name: 'roles:create', resource: 'roles', action: 'create', description: 'Create roles' },
  { name: 'roles:read', resource: 'roles', action: 'read', description: 'Read roles' },
  { name: 'roles:update', resource: 'roles', action: 'update', description: 'Update roles' },
  { name: 'roles:delete', resource: 'roles', action: 'delete', description: 'Delete roles' },

  // System providers (admin only)
  { name: 'providers:system', resource: 'providers', action: 'system', description: 'Create system providers' },
];

// Default roles with their permissions
const DEFAULT_ROLES = [
  {
    name: 'admin',
    description: 'Administrator with full access',
    isSystem: true,
    permissions: DEFAULT_PERMISSIONS.map((p) => p.name), // All permissions
  },
  {
    name: 'user',
    description: 'Standard user',
    isSystem: true,
    permissions: [
      'prompts:create',
      'prompts:read',
      'prompts:update',
      'prompts:delete',
      'evaluations:create',
      'evaluations:read',
      'evaluations:update',
      'evaluations:delete',
      'evaluations:run',
      'traces:read',
      'providers:create',
      'providers:read',
      'providers:update',
      'providers:delete',
      'models:create',
      'models:read',
      'models:update',
      'models:delete',
    ],
  },
  {
    name: 'viewer',
    description: 'Read-only access',
    isSystem: true,
    permissions: [
      'prompts:read',
      'evaluations:read',
      'traces:read',
      'providers:read',
      'models:read',
    ],
  },
];

async function seed() {
  console.log('Seeding database...');

  // Ensure system user exists (used as a safe default owner for system/global rows)
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {
      email: SYSTEM_USER_EMAIL,
      name: 'System',
      status: 'active',
      emailVerified: true,
    },
    create: {
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      name: 'System',
      status: 'active',
      emailVerified: true,
    },
  });

  // Create permissions
  console.log('Creating permissions...');
  for (const permission of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {},
      create: permission,
    });
  }
  console.log(`Created ${DEFAULT_PERMISSIONS.length} permissions`);

  // Create roles
  console.log('Creating roles...');
  for (const role of DEFAULT_ROLES) {
    const { permissions, ...roleData } = role;

    // Create or update role
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: roleData,
    });

    // Get permission IDs
    const permissionRecords = await prisma.permission.findMany({
      where: { name: { in: permissions } },
    });

    // Remove existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: createdRole.id },
    });

    // Create role permissions
    for (const permission of permissionRecords) {
      await prisma.rolePermission.create({
        data: {
          roleId: createdRole.id,
          permissionId: permission.id,
        },
      });
    }

    console.log(`Created role: ${role.name} with ${permissions.length} permissions`);
  }

  // Create admin user from environment variables
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    console.log('Creating admin user...');

    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

      const adminRole = await prisma.role.findUnique({
        where: { name: 'admin' },
      });

      if (adminRole) {
        const admin = await prisma.user.create({
          data: {
            email: adminEmail,
            passwordHash,
            name: 'Administrator',
            emailVerified: true,
            status: 'active',
            roles: {
              create: {
                roleId: adminRole.id,
              },
            },
          },
        });
        console.log(`Created admin user: ${admin.email}`);
      }
    } else {
      console.log(`Admin user already exists: ${adminEmail}`);
    }
  } else {
    console.log('Skipping admin user creation (ADMIN_EMAIL or ADMIN_PASSWORD not set)');
  }

  console.log('Seed completed!');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
