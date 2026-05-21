/**
 * Test setup. Runs before EACH test file.
 *  - Loads test environment
 *  - Provides a clean database state per file (truncate all tables)
 *
 * V93 — Garde anti-catastrophe : ce setup TRUNCATE absolument tout (User,
 * Group, Session, ...) sur la BDD pointée par DATABASE_URL. Si l'env n'est
 * pas un environnement de test (DATABASE_URL ne pointe pas sur une BDD
 * dont le nom contient "test"), on refuse de tourner pour ne PAS effacer
 * la BDD de dev / staging / prod. Incident historique : `bmd_dev` a été
 * wipé 2 fois car le dev local utilisait la même BDD pour vitest.
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

// V93 — Vérifie que la BDD ciblée est bien une BDD de test (par convention,
// le nom contient "test"). Bypass autorisé via VITEST_ALLOW_NON_TEST_DB=1
// pour cas exceptionnels (CI avec BDD éphémère, etc.).
function assertSafeTestDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  const bypass = process.env.VITEST_ALLOW_NON_TEST_DB === "1";
  if (bypass) return;

  // Extrait le nom de la BDD de l'URL (segment après le dernier "/").
  // Exemples :
  //   postgres://user:pass@localhost:5433/bmd_dev      → "bmd_dev"
  //   postgres://user:pass@localhost:5433/bmd_test     → "bmd_test"
  //   postgres://user:pass@localhost:5434/bmd_test?... → "bmd_test"
  const match = url.match(/\/([^/?]+)(?:\?|$)/);
  const dbName = match?.[1] ?? "";
  const isTestDb = /test/i.test(dbName);

  if (!isTestDb) {
    const masked = url.replace(/:\/\/[^@]+@/, "://***@");
    throw new Error(
      `[vitest-setup] REFUSE DE TRUNCATE : DATABASE_URL pointe sur « ${dbName} » ` +
        `qui ne ressemble pas à une BDD de test (nom doit contenir "test").\n` +
        `URL (masquée) : ${masked}\n\n` +
        `Pour configurer une BDD de test séparée :\n` +
        `  1. Crée une BDD dédiée : docker compose up -d ou createdb bmd_test\n` +
        `  2. Setter DATABASE_URL=postgres://bmd:bmd@localhost:5433/bmd_test dans apps/api/.env.test\n` +
        `  3. Lancer : DATABASE_URL=... npm run test:api (ou via dotenv-cli)\n\n` +
        `Bypass pour cas exceptionnels : VITEST_ALLOW_NON_TEST_DB=1 (À TES RISQUES).`,
    );
  }
}

// La garde s'exécute AU TOP DU MODULE pour bloquer AVANT que prisma ne
// se connecte ou que beforeAll ne lance le premier TRUNCATE.
assertSafeTestDb();

async function truncateAll() {
  // Approche robuste : TRUNCATE ... CASCADE en SQL natif.
  // Plus rapide que deleteMany et règle automatiquement les FK constraints.
  // Inclut TOUTES les tables (anciennes et nouvelles), sans dépendre de l'ordre.
  const tables = [
    "ActivityLog",
    "GroupInviteToken",
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
