import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database...');

  // Create roles (if not exists)
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: {
        name: 'admin',
        description: 'System Administrator',
        permissions: JSON.stringify({
          manage_users: true,
          manage_courses: true,
          manage_roles: true,
          view_analytics: true,
        }),
      },
    }),
    prisma.role.upsert({
      where: { name: 'instructor' },
      update: {},
      create: {
        name: 'instructor',
        description: 'Course Instructor',
        permissions: JSON.stringify({
          create_courses: true,
          manage_own_courses: true,
          grade_assignments: true,
          view_class_analytics: true,
        }),
      },
    }),
    prisma.role.upsert({
      where: { name: 'student' },
      update: {},
      create: {
        name: 'student',
        description: 'Student',
        permissions: JSON.stringify({
          enroll_courses: true,
          submit_assignments: true,
          take_quizzes: true,
          view_grades: true,
        }),
      },
    }),
  ]);

  console.log('✓ Roles created/updated');

  // Create sample admin user
  const adminUser = await prisma.user.upsert({
    where: { discordId: 'admin_demo_12345' },
    update: {},
    create: {
      discordId: 'admin_demo_12345',
      username: 'admin',
      email: 'admin@lms.local',
      avatarUrl: 'https://via.placeholder.com/150',
      status: 'ACTIVE',
    },
  });

  // Assign admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: roles[0].id, // admin role
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: roles[0].id,
    },
  });

  console.log('✓ Admin user created');

  // Create sample instructor
  const instructorUser = await prisma.user.upsert({
    where: { discordId: 'instructor_demo_12345' },
    update: {},
    create: {
      discordId: 'instructor_demo_12345',
      username: 'instructor',
      email: 'instructor@lms.local',
      avatarUrl: 'https://via.placeholder.com/150',
      status: 'ACTIVE',
    },
  });

  // Assign instructor role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: instructorUser.id,
        roleId: roles[1].id, // instructor role
      },
    },
    update: {},
    create: {
      userId: instructorUser.id,
      roleId: roles[1].id,
    },
  });

  console.log('✓ Instructor user created');

  // Create sample students
  for (let i = 1; i <= 5; i++) {
    const studentUser = await prisma.user.upsert({
      where: { discordId: `student_demo_${i}` },
      update: {},
      create: {
        discordId: `student_demo_${i}`,
        username: `student${i}`,
        email: `student${i}@lms.local`,
        avatarUrl: 'https://via.placeholder.com/150',
        status: 'ACTIVE',
      },
    });

    // Assign student role
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: studentUser.id,
          roleId: roles[2].id, // student role
        },
      },
      update: {},
      create: {
        userId: studentUser.id,
        roleId: roles[2].id,
      },
    });
  }

  console.log('✓ Sample students created');

  // Create sample courses
  const course1 = await prisma.course.upsert({
    where: { id: BigInt(1) },
    update: {},
    create: {
      title: 'Introduction to Web Development',
      description: 'Learn the basics of HTML, CSS, and JavaScript',
      category: 'Web Development',
      tags: JSON.stringify(['web', 'beginner', 'html', 'css', 'javascript']),
      isPublished: true,
      instructorId: instructorUser.id,
      enrollmentOpen: true,
    },
  });

  console.log('✓ Sample courses created');

  console.log('✓ Database seeding completed successfully!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
