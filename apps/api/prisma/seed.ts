import { prisma } from '../src/prisma';
import bcrypt from 'bcrypt';

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

  if (!password) {
    console.error('\n❌ ERROR: ADMIN_PASSWORD environment variable is required\n');
    console.error('To create an admin user, run:');
    console.error('  ADMIN_PASSWORD=your_secure_password npm run seed\n');
    console.error('Or add it to your .env file:');
    console.error('  ADMIN_PASSWORD=your_secure_password\n');
    console.error('Example:');
    console.error('  ADMIN_PASSWORD=SecurePass123! npm run seed\n');
    throw new Error('ADMIN_PASSWORD environment variable is required');
  }

  // Validate password strength
  if (!strongPasswordPattern.test(password)) {
    throw new Error('Password must be at least 12 characters and include uppercase, lowercase, and a number');
  }

  const hash = await bcrypt.hash(password, 12); // 12 rounds (more secure)

  const adminUser = await prisma.adminUser.upsert({
    where: { username },
    update: {
      password: hash,
      failedAttempts: 0,
      lockedUntil: null
    },
    create: {
      username,
      password: hash,
      failedAttempts: 0,
      lockedUntil: null
    },
  });

  console.log('\n✅ Admin user created/updated successfully!');
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password.replace(/./g, '*')}`);
  console.log('\n📌 You can now log in at: http://localhost:3000/login.html');
  console.log(`   Username: ${username}`);
  console.log('   Password: (the one you just set)\n');
}

main().catch((e) => {
  console.error('\n❌ Error seeding database:', e.message);
  process.exit(1);
});
