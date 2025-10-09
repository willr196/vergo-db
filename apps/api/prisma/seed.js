"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
async function main() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'arsenal';
    const hash = await bcrypt_1.default.hash(password, 10);
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
