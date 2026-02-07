"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
async function main() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        console.error('\n❌ ERROR: ADMIN_PASSWORD environment variable is required\n');
        console.error('To create an admin user, run:');
        console.error('  ADMIN_PASSWORD=your_secure_password npm run seed\n');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('❌ ERROR: Password must be at least 8 characters long');
        process.exit(1);
    }
    const hash = await bcrypt_1.default.hash(password, 12);
    await prisma_1.prisma.adminUser.upsert({
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
