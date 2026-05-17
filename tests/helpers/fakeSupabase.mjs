class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.insertPayload = null;
    this.upsertPayload = null;
    this.upsertOptions = {};
    this.updatePayload = null;
    this.limitCount = null;
    this.orderColumn = null;
    this.orderAscending = true;
    this.singleMode = false;
    this.maybeSingleMode = false;
    this.countMode = false;
  }

  select(_columns, options = {}) {
    this.countMode = options.count === "exact";
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => getValue(row, column) === value);
    return this;
  }

  neq(column, value) {
    this.filters.push((row) => getValue(row, column) !== value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(getValue(row, column)));
    return this;
  }

  like(column, pattern) {
    const regex = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*").replaceAll("_", ".")}$`);
    this.filters.push((row) => regex.test(String(getValue(row, column) || "")));
    return this;
  }

  order(column, options = {}) {
    this.orderColumn = column;
    this.orderAscending = options.ascending !== false;
    return this;
  }

  limit(value) {
    this.limitCount = value;
    return this;
  }

  insert(payload) {
    this.insertPayload = payload;
    return this;
  }

  upsert(payload, options = {}) {
    this.upsertPayload = payload;
    this.upsertOptions = options;
    return this;
  }

  update(payload) {
    this.updatePayload = payload;
    return this;
  }

  single() {
    this.singleMode = true;
    return this.exec();
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    return this.exec();
  }

  filteredRows() {
    let rows = [...(this.db[this.table] || [])].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderColumn) {
      rows.sort((a, b) => {
        const left = getValue(a, this.orderColumn) ?? 0;
        const right = getValue(b, this.orderColumn) ?? 0;
        const compare = left > right ? 1 : left < right ? -1 : 0;
        return this.orderAscending ? compare : -compare;
      });
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  exec() {
    if (!this.db[this.table]) this.db[this.table] = [];

    if (this.insertPayload) {
      const records = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      const inserted = records.map((record, index) => ({
        id: record.id || `${this.table}-${this.db[this.table].length + index + 1}`,
        ...record,
      }));
      this.db[this.table].push(...inserted);
      return Promise.resolve({ data: this.singleMode || this.maybeSingleMode ? inserted[0] : inserted, error: null, count: inserted.length });
    }

    if (this.upsertPayload) {
      const records = Array.isArray(this.upsertPayload) ? this.upsertPayload : [this.upsertPayload];
      const conflictColumns = String(this.upsertOptions.onConflict || "id")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const upserted = records.map((record, index) => {
        const existing = this.db[this.table].find((row) =>
          conflictColumns.length > 0 && conflictColumns.every((column) => row[column] === record[column]),
        );
        if (existing) {
          Object.assign(existing, record);
          return existing;
        }
        const inserted = {
          id: record.id || `${this.table}-${this.db[this.table].length + index + 1}`,
          ...record,
        };
        this.db[this.table].push(inserted);
        return inserted;
      });
      return Promise.resolve({ data: this.singleMode || this.maybeSingleMode ? upserted[0] : upserted, error: null, count: upserted.length });
    }

    if (this.updatePayload) {
      const rows = this.filteredRows();
      rows.forEach((row) => Object.assign(row, this.updatePayload));
      return Promise.resolve({ data: this.singleMode || this.maybeSingleMode ? rows[0] || null : rows, error: null, count: rows.length });
    }

    const rows = this.filteredRows();
    if (this.singleMode) {
      return Promise.resolve(rows[0] ? { data: rows[0], error: null, count: 1 } : { data: null, error: notFoundError(), count: 0 });
    }
    if (this.maybeSingleMode) {
      return Promise.resolve({ data: rows[0] || null, error: null, count: rows[0] ? 1 : 0 });
    }
    return Promise.resolve({ data: rows, error: null, count: this.countMode ? rows.length : null });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

function getValue(row, path) {
  if (!path.includes(".")) return row[path];
  return path.split(".").reduce((value, key) => {
    const next = Array.isArray(value) ? value[0] : value;
    return next ? next[key] : undefined;
  }, row);
}

function notFoundError() {
  const error = new Error("not found");
  error.code = "PGRST116";
  return error;
}

export function fakeSupabase(db) {
  return {
    from(table) {
      if (!db[table]) db[table] = [];
      return new Query(db, table);
    },
  };
}
