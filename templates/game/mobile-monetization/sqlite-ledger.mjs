/** Optional Node >=22.13 server ledger reference. Native/client code must never
 * open this database. Deployment must supply access control, backup/retention,
 * provider reconciliation and an atomic inventory consumer appropriate to game.
 * grant rows are a durable outbox, not a consumable-wallet restore operation. */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
export class SqlitePurchaseLedger {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchase_grants (
        grant_id TEXT PRIMARY KEY, owner TEXT NOT NULL, platform TEXT NOT NULL,
        app_id TEXT NOT NULL, environment TEXT NOT NULL, user_id TEXT NOT NULL,
        product_id TEXT NOT NULL, kind TEXT NOT NULL, quantity INTEGER NOT NULL
      ) STRICT;`);
  }
  claimAndGrant(facts, product) {
    const grant_id = createHash("sha256")
      .update(
        JSON.stringify([
          facts.platform,
          facts.app_id,
          facts.environment,
          facts.transaction_id,
        ]),
      )
      .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare("SELECT * FROM purchase_grants WHERE grant_id = ?")
        .get(grant_id);
      if (
        previous &&
        (previous.owner !== facts.owner ||
          previous.user_id !== facts.user_id ||
          previous.product_id !== facts.product_id)
      )
        throw Error("purchase_owner_mismatch");
      if (!previous)
        this.db
          .prepare("INSERT INTO purchase_grants VALUES (?,?,?,?,?,?,?,?,?)")
          .run(
            grant_id,
            facts.owner,
            facts.platform,
            facts.app_id,
            facts.environment,
            facts.user_id,
            facts.product_id,
            product.kind,
            product.quantity,
          );
      this.db.exec("COMMIT");
      return { grant_id, new_grant: !previous };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  grantCount() {
    return this.db
      .prepare("SELECT count(*) AS count FROM purchase_grants")
      .get().count;
  }
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
