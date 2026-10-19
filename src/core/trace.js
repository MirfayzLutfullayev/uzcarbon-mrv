/*
 * Hisob izi (audit trail, M4.5): har bir formula qadami kirish qiymatlari,
 * formula matni va natija bilan yoziladi. Verifikator hisobni qadamma-qadam tekshiradi.
 */
"use strict";

class Trace {
  constructor() { this.steps = []; }
  /**
   * @param {string} id     formula identifikatori (REJA.md 4-bo'lim, masalan "F-5.2")
   * @param {string} label  qisqa tavsif
   * @param {string} formula formula matni
   * @param {object} inputs kirish qiymatlari
   * @param {number} result natija
   * @param {string} [unit]
   */
  add(id, label, formula, inputs, result, unit = "") {
    this.steps.push({ id, label, formula, inputs, result, unit });
    return result;
  }
  toJSON() { return this.steps; }
}

/** Trace berilmagan bo'lsa ishlatiladigan "jim" iz. */
const NOOP = { add: (_id, _l, _f, _i, result) => result, steps: [] };

module.exports = { Trace, NOOP };
