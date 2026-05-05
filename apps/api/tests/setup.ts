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
  // Approche robuste : TRUNCATE ... CASCADE en SQL natif.
  // Plus rapide que deleteMany et règle automatiquement les FK constraints.
  // Inclut TOUTES les tables (anciennes et nouvelles), sans dépendre de l'ordre.
  const tables = [
    "DebtSwapLeg",
    "DebtSwapParticipant",
    "DebtSwap",
    "TontineContribution",
    "TontineTurn",
    "Tontine",
    "SplitPreset",
    "ExpenseShare",
    "Expense",
    "Settlement",
    "GroupMember",
    "Group",
    "Session",
    "OtpCode",
    "UserContact",
    "User",
  ];
  // Génère: TRUNCATE TABLE "DebtSwapLeg", "DebtSwapParticipant", ... RESTART IDENTITY CASCADE;
  const tableList = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
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
