/*
 * Rollar va huquqlar (REJA.md 8-bo'lim, M10.4). Eng kam huquq tamoyili:
 * har bir rol faqat ro'yxatdagi amallarni bajaradi, korxona ma'lumotlari esa scope orqali cheklanadi.
 */
"use strict";

const ROLES = {
  exporter_admin:      { name: "Eksportyor administratori", scope: "operator", mfa: true },
  exporter_specialist: { name: "Eksportyor mutaxassisi", scope: "operator", mfa: false },
  verifier:            { name: "Verifikator", scope: "assigned", mfa: true },
  importer:            { name: "Xorijiy importyor", scope: "importer", mfa: false },
  imv:                 { name: "IMV (DNA, reestr)", scope: "all", mfa: true },
  methodology_admin:   { name: "Uslubiyot administratori", scope: "none", mfa: true },
  tax:                 { name: "Soliq qo'mitasi", scope: "all", mfa: false },
  ecology:             { name: "Ekologiya vazirligi", scope: "all", mfa: false },
  customs:             { name: "Bojxona qo'mitasi", scope: "all", mfa: false },
  energy:              { name: "Energetika vazirligi", scope: "none", mfa: false },
  gov_analyst:         { name: "Davlat organi tahlilchisi", scope: "aggregate", mfa: false },
  sysadmin:            { name: "Tizim administratori", scope: "none", mfa: true },
};

const EXPORTER_BASE = ["registry.read", "data.read", "calc.read", "batches.read", "cbam.read", "tax.read", "verification.read", "docs.read", "refdata.read", "itmo.read", "ai.use", "dashboard.exporter"];

const PERMS = {
  exporter_admin: [...EXPORTER_BASE, "registry.write", "users.manage_own", "data.write", "calc.run", "calc.submit", "plan.write", "plan.submit",
    "batches.write", "tax.write", "verification.assign", "verification.respond", "docs.sign", "docs.share", "itmo.write", "audit.read_own"],
  exporter_specialist: [...EXPORTER_BASE, "data.write", "calc.run", "plan.write", "batches.write", "verification.respond"],
  verifier: ["registry.read", "data.read", "calc.read", "batches.read", "plan.decide", "verification.read", "verification.work", "docs.read", "refdata.read"],
  importer: ["docs.read"],
  imv: ["registry.read", "operators.create", "verifiers.manage", "refdata.read", "refdata.propose", "refdata.approve", "dashboard.gov", "cbam.read",
    "itmo.read", "itmo.register", "tax.read", "batches.read", "audit.read", "integrations.run"],
  methodology_admin: ["refdata.read", "refdata.propose", "refdata.approve", "audit.read"],
  tax: ["registry.read", "tax.read", "tax.confirm", "dashboard.gov", "refdata.read", "integrations.run"],
  ecology: ["registry.read", "calc.read", "dashboard.gov", "refdata.read", "plan.read"],
  customs: ["registry.read", "batches.read", "batches.write", "refdata.read", "integrations.run"],
  energy: ["refdata.read", "refdata.propose", "dashboard.gov"],
  gov_analyst: ["dashboard.gov", "refdata.read", "cbam.read"],
  sysadmin: ["users.manage_all", "audit.read", "system.read", "integrations.run", "refdata.read"],
};

/** Energetika vazirligi faqat tarmoq koeffitsientini taklif qila oladi. */
const PROPOSE_PREFIX = { energy: ["grid."] };

function can(user, perm) {
  if (!user) return false;
  return (PERMS[user.role] || []).includes(perm);
}
function canProposeKey(user, key) {
  if (!can(user, "refdata.propose")) return false;
  const pre = PROPOSE_PREFIX[user.role];
  return !pre || pre.some(p => key.startsWith(p));
}
const mfaRequired = (role, enforce) => !!enforce && !!ROLES[role]?.mfa;

/**
 * Foydalanuvchidan ikki bosqichli tasdiq so'ralsinmi.
 * MFA_ENFORCE=0 — mutlaq o'chirgich: hisobda 2FA yoqilgan bo'lsa ham kod so'ralmaydi
 * (namoyish nusxalari uchun; ishlab chiqarishda 1 bo'lishi shart).
 */
const needsMfa = (user, enforce) => !!enforce && (!!user.totp_enabled || !!ROLES[user.role]?.mfa);

module.exports = { ROLES, PERMS, can, canProposeKey, mfaRequired, needsMfa };
