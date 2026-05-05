/**
 * Test setup. Runs before EACH test file.
 *  - Loads test environment
 *  - Provides a clean database state per file (truncate all tables)
 */
import { afterAll, beforeAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/db.js";

// Set required env vars BEFORE any module loads
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-secret-32-chars-minimum-length-test";
process.env.OTP_PEPPER ??= "test-pepper";
process.env.OTP_DELIVERY_MODE = "console";
// LOG quiet during tests
process.env.LOG_LEVEL = "error";

async function truncateAll() {
  // Order matters because of FK constraints
  await prisma.$transaction([
    prisma.expenseShare.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.settlement.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.group.deleteMany(),
    prisma.session.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.userContact.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

beforeAll(async () => {
  await truncateAll();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
