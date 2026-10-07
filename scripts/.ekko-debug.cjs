const postgres = require("postgres");
const sql = postgres("postgres://lingsongxiong@127.0.0.1:5433/lshot", { max: 1 });
(async () => {
  const rows = await sql`
    SELECT s.id, s.name, s.last_ok_at, s.last_error, s.enabled,
      (SELECT count(*)::int FROM articles a WHERE a.source_id = s.id) AS arts
    FROM sources s
    WHERE s.id IN ('pod-localization','pod-troublesome-terps','yt-locworld')`;
  for (const r of rows) {
    console.log(`${r.id}: enabled=${r.enabled} ok=${r.last_ok_at ? "Y" : "N"} arts=${r.arts}`);
    console.log(`  err: ${(r.last_error ?? "无").slice(0, 80)}`);
  }
  await sql.end();
})();
