import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layerMemory())("055_ProjectionLocalTags", (it) => {
  it.effect("adds non-null local tags with a disabled default", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });

      const projectColumns = yield* sql<{
        readonly name: string;
        readonly notnull: number;
        readonly defaultValue: string | null;
      }>`
        SELECT name, "notnull", dflt_value AS "defaultValue"
        FROM pragma_table_info('projection_projects')
      `;
      const threadColumns = yield* sql<{
        readonly name: string;
        readonly notnull: number;
        readonly defaultValue: string | null;
      }>`
        SELECT name, "notnull", dflt_value AS "defaultValue"
        FROM pragma_table_info('projection_threads')
      `;

      assert.deepEqual(
        projectColumns.find((column) => column.name === "is_local"),
        { name: "is_local", notnull: 1, defaultValue: "0" },
      );
      assert.deepEqual(
        threadColumns.find((column) => column.name === "is_local"),
        { name: "is_local", notnull: 1, defaultValue: "0" },
      );
    }),
  );

  it.effect("is a no-op on a database that already has the columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      // Replaying the migration body must not fail on the existing columns.
      yield* (yield* Effect.promise(() => import("./055_ProjectionLocalTags.ts"))).default;
      const threadColumns = yield* sql<{ readonly name: string }>`
        SELECT name FROM pragma_table_info('projection_threads') WHERE name = 'is_local'
      `;
      assert.equal(threadColumns.length, 1);
    }),
  );
});
