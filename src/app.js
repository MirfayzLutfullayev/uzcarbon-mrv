/* Ilovani yig'ish: baza, ma'lumotnoma, API modullari. Testlar ham shu funksiyadan foydalanadi. */
"use strict";
const path = require("path");
const config = require("./config");
const { Db } = require("./db/db");
const { RefData } = require("./db/refdata");
const { App } = require("./http/app");
const initial = require("./refdata/initial");

function createApp({ dbFile = config.DB_FILE, overrides = {} } = {}) {
  const cfg = { ...config, ...overrides };
  const db = new Db(dbFile);
  const ref = new RefData(db);
  ref.seed(initial.entries());
  const app = new App({ db, ref, config: cfg, publicDir: path.join(__dirname, "..", "public") });
  for (const m of ["auth", "registry", "data", "calc", "finance", "verification", "reports", "ai", "admin"]) require("./api/" + m).register(app);
  return app;
}

module.exports = { createApp };
