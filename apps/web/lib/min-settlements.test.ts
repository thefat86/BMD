/**
 * V52.H3 — Tests unitaires pour `min-settlements.ts`.
 *
 * Pas de framework (apps/web n'a pas vitest/jest). Script TS exécutable
 * directement via `npx tsx lib/min-settlements.test.ts`. Si une assertion
 * échoue → throw → exit code != 0 (intégrable en CI).
 *
 * Couverture :
 *  1. balances vide → []
 *  2. tous à zéro → []
 *  3. simple 1-to-1 → 1 transfert
 *  4. classique 3 personnes [+30, -10, -20] → 2 transferts
 *  5. complexe 4 personnes [+100, -30, -70, 0] → 2 transferts
 *  6. arrondi flottant epsilon → traité comme zéro
 *  7. paire imparfaite [+50, -40, -10] → 2 transferts
 *
 * Pour lancer :
 *   cd apps/web && npx tsx lib/min-settlements.test.ts
 *   echo "exit: $?"
 */
import {
  computeMinSettlements,
  type SettlementTransfer,
} from "./min-settlements";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function expectEqual<T>(actual: T, expected: T, msg: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${msg} — actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

function sumAbs(transfers: SettlementTransfer[]): number {
  return transfers.reduce((s, t) => s + t.amount, 0);
}

function applyTransfers(
  initial: Record<string, number>,
  transfers: SettlementTransfer[],
): Record<string, number> {
  const result = { ...initial };
  for (const t of transfers) {
    result[t.fromUserId] = (result[t.fromUserId] ?? 0) + t.amount;
    result[t.toUserId] = (result[t.toUserId] ?? 0) - t.amount;
  }
  return result;
}

console.log("\n=== Tests min-settlements ===\n");

// 1. Balances vide
console.log("1. Balances vide");
expectEqual(computeMinSettlements({}), [], "Empty → []");

// 2. Tous à zéro
console.log("\n2. Tous à zéro");
expectEqual(computeMinSettlements({ a: 0, b: 0, c: 0 }), [], "All zeros → []");

// 3. Simple 1-to-1
console.log("\n3. Simple 1-to-1 (A:+10, B:-10)");
{
  const result = computeMinSettlements({ a: 10, b: -10 });
  assert(result.length === 1, "1 transfert généré");
  assert(result[0].fromUserId === "b", "from = b (débiteur)");
  assert(result[0].toUserId === "a", "to = a (créditeur)");
  assert(result[0].amount === 10, "amount = 10");
}

// 4. Classique 3 personnes
console.log("\n4. Classique 3 personnes (Alice:+30, Bob:-10, Carol:-20)");
{
  const initial = { alice: 30, bob: -10, carol: -20 };
  const result = computeMinSettlements(initial);
  assert(result.length === 2, "2 transferts");
  const final = applyTransfers(initial, result);
  // Tout doit être à zéro (à epsilon près)
  for (const [id, bal] of Object.entries(final)) {
    assert(Math.abs(bal) < 0.01, `${id} soldé à 0 (bal=${bal})`);
  }
}

// 5. Complexe 4 personnes (1 grand créditeur)
console.log("\n5. Complexe 4 personnes (A:+100, B:-30, C:-70, D:0)");
{
  const initial = { a: 100, b: -30, c: -70, d: 0 };
  const result = computeMinSettlements(initial);
  assert(result.length === 2, "2 transferts (D exclu car nul)");
  const final = applyTransfers(initial, result);
  for (const [id, bal] of Object.entries(final)) {
    assert(Math.abs(bal) < 0.01, `${id} soldé à 0`);
  }
}

// 6. Arrondi flottant epsilon
console.log("\n6. Arrondi flottant epsilon (A:+0.003, B:-0.003)");
{
  const result = computeMinSettlements({ a: 0.003, b: -0.003 });
  expectEqual(result, [], "0.003 < EPS → filtré, [] retourné");
}

// 7. Paire imparfaite [+50, -40, -10]
console.log("\n7. Paire imparfaite (Alice:+50, Bob:-40, Carol:-10)");
{
  const initial = { alice: 50, bob: -40, carol: -10 };
  const result = computeMinSettlements(initial);
  assert(result.length === 2, "2 transferts");
  const final = applyTransfers(initial, result);
  for (const [id, bal] of Object.entries(final)) {
    assert(Math.abs(bal) < 0.01, `${id} soldé à 0`);
  }
  // Vérifie que le total transféré = somme des dettes
  const totalTransferred = sumAbs(result);
  assert(
    Math.abs(totalTransferred - 50) < 0.01,
    `Total transféré = 50 (actual ${totalTransferred})`,
  );
}

// 8. Cas pathologique : créditeurs et débiteurs ne s'équilibrent pas (input invalide)
console.log("\n8. Cas dégénéré (somme ≠ 0 — input invalide)");
{
  // Le système ne peut pas équilibrer si la somme ≠ 0.
  // L'algo s'arrête quand l'un des deux côtés est épuisé.
  const initial = { a: 30, b: -10 };
  const result = computeMinSettlements(initial);
  assert(result.length === 1, "1 transfert (autant que possible)");
  assert(result[0].amount === 10, "Transfert plafonné au plus petit côté");
}

console.log(`\n=== Résultat : ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
}
