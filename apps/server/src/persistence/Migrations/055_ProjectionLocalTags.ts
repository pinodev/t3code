import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Fork migration, numbered after upstream's 053 and 054 (vendored as they are):
// the migrator only runs ids above the latest applied, so a database that met
// upstream first must still see this one. Idempotent for the same reason.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projectColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  if (!projectColumns.some((column) => column.name === "is_local")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0
    `;
  }
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!threadColumns.some((column) => column.name === "is_local")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0
    `;
  }
});
