import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reserveRender, type RenderCountStore } from "../src/lib/budget-gate";

// The privacy policy (requirement 4.1) says the operator's side keeps only how many pages were rendered each day: the day and the count.
// If a test here fails, review that privacy text and the documents that repeat it (README, docs) before changing the code or this test.

const DAY = "2026-10-31";
const PORT = ["read", "write", "deleteBefore"] as const;
type Method = (typeof PORT)[number];

/** A real UTC calendar day written as YYYY-MM-DD, checked without the code under test. */
function isUtcDay(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const start = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(start) && new Date(start).toISOString().slice(0, 10) === value;
}

/** A store that records every argument of every call, extra ones included, and every property the decision reads off it. */
function recordingStore(seed: Record<string, unknown> = {}, fail?: Method) {
  const rows = new Map(Object.entries(seed));
  const calls: Array<{ method: Method; args: unknown[] }> = [];
  const touched = new Set<string>();
  const behaviour: Record<Method, (args: unknown[]) => unknown> = {
    read: args => rows.get(String(args[0])) ?? null,
    write: args => { rows.set(String(args[0]), args[1]); },
    deleteBefore: args => { for (const key of [...rows.keys()]) if (key < String(args[0])) rows.delete(key); },
  };
  const store = new Proxy({}, {
    get(_target, property) {
      touched.add(String(property));
      const method = PORT.find(name => name === property);
      return method && ((...args: unknown[]) => {
        calls.push({ method, args });
        if (method === fail) throw new Error(`${method} failed`);
        return behaviour[method](args);
      });
    },
  }) as RenderCountStore;
  return { store, calls, touched };
}

test("storage port: every reservation path hands the store just a UTC day, plus a whole count on write — no third value, no other key, no other method", () => {
  const daysBefore = (days: number) => new Date(Date.parse(`${DAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  // A day's first and later renders, the cap, the next day, old counters, a leap day, each failing call and corrupt counts.
  const paths: Array<{ seed?: Record<string, unknown>; fail?: Method; days: string[]; cap: number }> = [
    { days: [DAY, DAY, DAY, DAY, "2026-11-01"], cap: 3 },
    { seed: Object.fromEntries([1, 2, 6, 7, 8, 30].map(days => [daysBefore(days), 2])), days: [DAY, DAY], cap: 5 },
    { seed: { [DAY]: 7 }, days: [DAY], cap: 2 },
    { days: ["2028-02-29", "2028-02-29", "2028-03-01"], cap: 1 },
    ...PORT.map(fail => ({ fail, days: [DAY], cap: 5 })),
    ...[-1, 1.5, Number.NaN, "3"].map(corrupt => ({ seed: { [DAY]: corrupt }, days: [DAY], cap: 5 })),
  ];
  const seen = new Set<Method>();
  for (const { seed, fail, days, cap } of paths) {
    const { store, calls, touched } = recordingStore(seed, fail);
    for (const day of days) {
      const from = calls.length;
      reserveRender(store, day, cap);
      for (const { method, args } of calls.slice(from)) {
        seen.add(method);
        const shown = `${method}(${args.map(String).join(", ")}) while reserving ${day}`;
        assert.equal(args.length, method === "write" ? 2 : 1, `no value beyond the day and the count: ${shown}`);
        assert.ok(isUtcDay(args[0]), `the key is a UTC day: ${shown}`);
        if (method !== "deleteBefore") assert.equal(args[0], day, `the key is the day being reserved: ${shown}`);
        if (method === "write") assert.ok(Number.isSafeInteger(args[1]) && Number(args[1]) >= 0, `the count is a whole number: ${shown}`);
      }
    }
    assert.deepEqual([...touched].filter(name => !PORT.some(known => known === name)), [], "the decision uses nothing else on the store");
  }
  assert.deepEqual([...seen].sort(), ["deleteBefore", "read", "write"], "every kind of call was made");
});

// The Durable Object imports `cloudflare:workers`, which Node cannot load, so its source is read as text.
const OBJECT_SOURCE = readFileSync(new URL("../src/lib/budget-gate-object.ts", import.meta.url), "utf8");
/** Its one table and the allowed columns (name and type): the UTC day key and the count. */
const TABLE = "renders";
const COLUMNS: Readonly<Record<string, string>> = { day: "TEXT", used: "INTEGER" };
const isColumn = (name: string) => Object.hasOwn(COLUMNS, name.toLowerCase());
/** The SQL words the statements use today. Any other word (another column or table, a function such as unixepoch) fails. */
const SQL_WORDS = new Set(["CREATE", "TABLE", "IF", "NOT", "EXISTS", "TEXT", "INTEGER", "PRIMARY", "KEY", "NULL", "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "ON", "CONFLICT", "DO", "UPDATE", "SET", "DELETE", "EXCLUDED"]);
/** What the class calls today: SQL on its table, reading the rows back, and handing the decision to reserveRender. */
const ALLOWED_CALLS = ["constructor", "super", "exec", "toArray", "reserve", "reserveRender"];

/** Comments, quoted strings and template strings in source order; one regular expression is enough for this small file. */
const LITERAL = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
type Literal = { readonly comment: boolean; readonly body: string; readonly start: number; readonly end: number };
function literals(source: string): Literal[] {
  return [...source.matchAll(LITERAL)].map(match => {
    const comment = match[0].startsWith("/");
    return { comment, body: comment ? match[0].replace(/^\/[/*]|\*\/$/g, "") : match[0].slice(1, -1), start: match.index, end: match.index + match[0].length };
  });
}
/** The source with the chosen literals turned into spaces, so every other character keeps its position. */
function blank(source: string, chosen: (literal: Literal) => boolean): string {
  let out = "";
  let at = 0;
  for (const literal of literals(source).filter(chosen)) {
    out += source.slice(at, literal.start) + source.slice(literal.start, literal.end).replace(/[^\n]/g, " ");
    at = literal.end;
  }
  return out + source.slice(at);
}
const CODE = blank(OBJECT_SOURCE, () => true);
const NO_COMMENTS = blank(OBJECT_SOURCE, literal => literal.comment);

/** Index ranges of the comma-separated parts inside a bracket that opened just before `from`; null if it never closes. */
function partsInside(text: string, from: number): Array<readonly [number, number]> | null {
  const parts: Array<readonly [number, number]> = [];
  let depth = 0;
  let start = from;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char) && depth > 0) depth -= 1;
    else if (char === ")") return [...parts, [start, index]];
    else if (char === "," && depth === 0) { parts.push([start, index]); start = index + 1; }
  }
  return null;
}

/** Every SQL statement in the file: in strings and template strings in any case, in comments in upper case only (so English stays prose). */
function sqlStatements(source: string): string[] {
  return literals(source).flatMap(({ comment, body }) => {
    const text = body.replace(/\\[nrt]/g, " ").replace(/\\(.)/g, "$1");
    const start = comment
      ? text.search(/\b(?:CREATE|ALTER|DROP|INSERT|REPLACE|UPDATE|DELETE|SELECT|WITH|PRAGMA|ATTACH)\b/)
      : text.search(/^\s*(?:create|alter|drop|insert|replace|update|delete|select|with|pragma|attach)\b/i);
    return start < 0 ? [] : text.slice(start).split(";").map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  });
}
const plainSql = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''").replace(/["`[\]]/g, " ");

/** The table and its columns (name and first type word) of a CREATE TABLE statement; table constraints are skipped. */
function tableDefinition(statement: string): { table: string; columns: Record<string, string> } | null {
  const plain = plainSql(statement);
  const head = plain.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
  const parts = head ? partsInside(plain, head[0].length) : null;
  if (!head || !parts) return null;
  const definitions = parts.map(([start, end]) => plain.slice(start, end).trim()).filter(part => !/^(?:PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(part));
  return { table: head[1].toLowerCase(), columns: Object.fromEntries(definitions.map(definition => [definition.split(/\s+/)[0].toLowerCase(), (definition.split(/\s+/)[1] ?? "").toUpperCase()])) };
}

/** What a statement uses beyond the renders table and its two columns. */
function statementProblems(statement: string): string[] {
  const plain = plainSql(statement);
  const kind = /^CREATE\s+TABLE\b/i.test(plain) ? "CREATE TABLE" : (plain.match(/^\w+/)?.[0] ?? "").toUpperCase();
  const problems = ["CREATE TABLE", "SELECT", "INSERT", "UPDATE", "DELETE"].includes(kind) ? [] : [`a ${kind} statement`];
  if (plain.includes("${")) problems.push("a value written into the SQL text");
  for (const word of plain.match(/\b[A-Za-z_]\w*/g) ?? []) {
    if (word.toLowerCase() !== TABLE && !isColumn(word) && !SQL_WORDS.has(word.toUpperCase())) problems.push(`the name ${word}`);
  }
  if (kind === "INSERT") {
    const insert = plain.match(/^INSERT\s+INTO\s+\w+\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
    const named = insert ? insert[1].split(",").map(name => name.trim()) : [];
    if (!insert) problems.push("an INSERT that does not list its columns and values");
    for (const name of named.filter(name => !isColumn(name))) problems.push(`the column ${name}`);
    if (insert && insert[2].split(",").length !== named.length) problems.push("VALUES that do not match the columns");
  }
  for (const match of plain.matchAll(/\bSET\s+(.+?)(?=\s+WHERE\b|$)/gi)) {
    for (const target of match[1].split(",").map(assignment => assignment.split("=")[0].trim())) if (!isColumn(target)) problems.push(`the column ${target}`);
  }
  return problems.map(problem => `${problem} in: ${statement}`);
}

/** Each `exec` in the code: its SQL when it is `sql.exec` with one fixed text written in place (else null), and the values bound to it. */
function execCalls(): Array<{ sql: string | null; bound: string[] }> {
  return [...CODE.matchAll(/\bexec\b/g)].map(({ index }) => {
    const open = CODE.slice(index + 4).match(/^\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/);
    const parts = open && /\bsql\s*\.\s*$/.test(CODE.slice(0, index)) ? partsInside(CODE, index + 4 + open[0].length) : null;
    const [first = "", ...bound] = (parts ?? []).map(([start, end]) => NO_COMMENTS.slice(start, end).trim());
    const fixed = /^"(?:[^"\\\n]|\\.)*"$|^'(?:[^'\\\n]|\\.)*'$|^`(?:[^`\\$]|\\.|\$(?!\{))*`$/.test(first);
    return { sql: parts && fixed ? first.slice(1, -1) : null, bound };
  });
}
const placeholders = (sql: string) => (plainSql(sql).match(/\?\d*|[:@$][A-Za-z_]\w*/g) ?? []).length;

test("Durable Object table: renders(day, used) is the only table, and every SQL text in the file — strings, template strings, comments — stays within those two columns", () => {
  const statements = sqlStatements(OBJECT_SOURCE);
  assert.deepEqual(statements.filter(statement => /^CREATE\s+TABLE\b/i.test(statement)).map(tableDefinition), [{ table: TABLE, columns: COLUMNS }]);
  assert.deepEqual(statements.flatMap(statementProblems), []);
  // The scan saw the table, the read, the write and the clean-up of old days, so the checks above did not pass on nothing.
  const kinds = new Set(statements.map(statement => statement.split(" ")[0].toUpperCase()));
  for (const kind of ["CREATE", "SELECT", "INSERT", "DELETE"]) assert.ok(kinds.has(kind), kind);
});

test("Durable Object SQL calls: each sql.exec binds one value per placeholder, and the values are the day and the count exactly as passed in", () => {
  const calls = execCalls();
  assert.ok(calls.length > 0);
  for (const { sql, bound } of calls) {
    assert.ok(sql !== null, "each exec is sql.exec with its SQL written in place as one fixed text, so this test can read it");
    assert.equal(bound.length, placeholders(sql), `one bound value per placeholder: ${sql}`);
    assert.deepEqual(bound.filter(value => !Object.hasOwn(COLUMNS, value)), [], `only the day and the count are bound, unchanged: ${sql}`);
  }
});

test("Durable Object storage: nothing outside the renders table is kept — only ctx.storage.sql, no storage.put, no KV or other binding, no other module", () => {
  const storageParts = [...CODE.matchAll(/\bstorage\b(?:\s*\??\.\s*(\w+))?/g)].map(match => match[1] ?? "the storage object itself");
  assert.deepEqual([...new Set(storageParts)], ["sql"], "ctx.storage.sql is the only part of storage in use");
  const imports = [...NO_COMMENTS.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g)].map(match => match[1] ?? match[2]);
  assert.deepEqual(imports.sort(), ["./budget-gate", "cloudflare:workers"], "no module that could keep or send data");
  const called = [...CODE.matchAll(/([A-Za-z_$][\w$]*)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/g)].map(match => match[1]);
  const unexpected = [...new Set(called)].filter(name => !ALLOWED_CALLS.includes(name) && !/^(?:if|for|while|switch|catch|function|return|void|typeof|await)$/.test(name));
  assert.deepEqual(unexpected, [], "a new call (storage.put, a KV or other binding, fetch) must first be checked against the privacy policy");
});
