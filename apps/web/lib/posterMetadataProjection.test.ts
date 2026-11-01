import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
test("category lookup transfers only its scalar classification and retains primary category priority", async () => {
  const selections: Array<{ table: string; columns: string }> = [];
  const rows = {
    posters: [{ id: "p", primary_category_code: "CAT_EDUCATION" }],
    poster_categories: [
      { poster_id: "p", category_id: "w" },
      { poster_id: "p", category_id: "e" },
    ],
    poster_regions: [],
    categories: [
      { id: "w", name: "지원금/복지", code: "CAT_WELFARE" },
      { id: "e", name: "교육/취업", code: "CAT_EDUCATION" },
    ],
  };
  const result = await build({
    entryPoints: ["apps/web/lib/posterHelpers.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
      {
        name: "public-read-fixture",
        setup(b) {
          b.onResolve({ filter: /^\.\/supabase$/ }, () => ({
            path: "supabase",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export const supabase={from:table=>{const q={select:columns=>{selections.push({table,columns});return q},in:async()=>({data:rows[table]??[],error:null})};return q}};`,
          }));
        },
      },
    ],
  });
  const mod = {
    exports: {} as {
      fetchCategoryRegionNames: (ids: string[]) => Promise<any>;
    },
  };
  new Function(
    "module",
    "exports",
    "rows",
    "selections",
    result.outputFiles[0].text,
  )(mod, mod.exports, rows, selections);
  const actual = await mod.exports.fetchCategoryRegionNames(["p"]);
  assert.equal(actual.p.categoryId, "e");
  assert.equal(actual.p.categoryName, "교육/취업");
  assert.deepEqual(
    selections.filter((s) => s.table === "posters"),
    [
      {
        table: "posters",
        columns:
          "id, primary_category_code:field_verification->classification->>primaryCategory",
      },
    ],
  );
});
