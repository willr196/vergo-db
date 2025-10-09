import { prisma } from '../src/prisma';
import bcrypt from 'bcrypt';

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'arsenal';

  const hash = await bcrypt.hash(password, 10);

  await prisma.adminUser.upsert({
    where: { username },
    update: { password: hash },
    create: { username, password: hash },
  });

  console.log(`✅ Admin user ready: ${username}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
