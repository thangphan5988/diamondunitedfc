#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function sqlQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function cleanImageUrl(url) {
  return String(url || "").split("?")[0].trim();
}

function loadLocalSponsors() {
  const raw = run('npx wrangler d1 execute dufc-db --local --command "SELECT name, link_url, image_side, image_mobile, sort_order, active, end_at, created_at, updated_at FROM sponsors ORDER BY sort_order ASC, id ASC;" --json');
  const parsed = JSON.parse(raw);
  return parsed[0]?.results || [];
}

function listLocalSponsorKeys() {
  const raw = run("npx wrangler kv key list --binding=AVATARS --local");
  return JSON.parse(raw)
    .map((row) => row.name)
    .filter((name) => name.startsWith("sponsors/"));
}

function pushSponsorsToRemote(rows) {
  if (!rows.length) throw new Error("Không có sponsor local để merge.");
  const values = rows.map((row) => {
    const created = row.created_at || new Date().toISOString();
    const updated = row.updated_at || created;
    const endAt = row.end_at || "";
    return `(${[
      sqlQuote(row.name),
      sqlQuote(row.link_url || ""),
      sqlQuote(cleanImageUrl(row.image_side)),
      sqlQuote(cleanImageUrl(row.image_mobile)),
      Number(row.sort_order) || 0,
      row.active ? 1 : 0,
      sqlQuote(endAt),
      sqlQuote(created),
      sqlQuote(updated)
    ].join(", ")})`;
  }).join(",\n");

  const sql = `DELETE FROM sponsors;\nINSERT INTO sponsors (name, link_url, image_side, image_mobile, sort_order, active, end_at, created_at, updated_at)\nVALUES\n${values};`;
  const file = path.join(os.tmpdir(), "merge-sponsors-prod.sql");
  fs.writeFileSync(file, sql, "utf8");
  run(`npx wrangler d1 execute dufc-db --remote --file=${file}`);
  fs.unlinkSync(file);
}

function runBuffer(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
}

function copySponsorImages(keys) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dufc-sponsor-kv-"));
  try {
    for (const key of keys) {
      const localFile = path.join(tmpDir, key.replace(/\//g, "__"));
      const data = runBuffer(`npx wrangler kv key get ${JSON.stringify(key)} --binding=AVATARS --local`);
      fs.writeFileSync(localFile, data);
      run(`npx wrangler kv key put ${JSON.stringify(key)} --binding=AVATARS --remote --path=${JSON.stringify(localFile)} --metadata='{"contentType":"image/png"}'`);
      console.log(`KV uploaded: ${key}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const sponsors = loadLocalSponsors();
const keys = listLocalSponsorKeys();

console.log(`Merging ${sponsors.length} sponsors to production D1...`);
pushSponsorsToRemote(sponsors);
console.log(`Copying ${keys.length} sponsor images to production KV...`);
copySponsorImages(keys);
console.log("Done.");
