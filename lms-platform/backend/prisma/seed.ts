import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create roles
  const studentRole = await prisma.role.upsert({
    where: { name: 'student' },
    update: {},
    create: {
      name: 'student',
      description: 'Student role with basic course access',
    },
  });

  const instructorRole = await prisma.role.upsert({
    where: { name: 'instructor' },
    update: {},
    create: {
      name: 'instructor',
      description: 'Instructor role with course creation and management permissions',
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Administrator role with full system access',
    },
  });

  console.log('Roles created:', { studentRole, instructorRole, adminRole });

  // Create sample demo user (optional - for testing)
  const demoUser = await prisma.user.upsert({
    where: { discordId: 'demo-user-123' },
    update: {},
    create: {
      discordId: 'demo-user-123',
      username: 'DemoUser',
      discriminator: '0001',
      email: 'demo@example.com',
      avatar: null,
      roles: {
        create: [
          { roleId: studentRole.id },
          { roleId: instructorRole.id },
        ],
      },
    },
  });

  console.log('Demo user created:', demoUser);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
