CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seq INTEGER NOT NULL,
  item TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  inventory_no TEXT NOT NULL,
  keyed TEXT NOT NULL DEFAULT '',
  received_day INTEGER NOT NULL,
  received_month INTEGER NOT NULL,
  received_year INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  fund TEXT NOT NULL DEFAULT '',
  fund_year TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  officer TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_no ON inventory(inventory_no) WHERE inventory_no <> '';
CREATE INDEX IF NOT EXISTS ix_inventory_received ON inventory(received_year, received_month, received_day);

CREATE TABLE IF NOT EXISTS inventory_deleted_archive (
  archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER,
  seq INTEGER,
  item TEXT,
  unit TEXT,
  inventory_no TEXT,
  keyed TEXT,
  received_day INTEGER,
  received_month INTEGER,
  received_year INTEGER,
  category TEXT,
  fund TEXT,
  fund_year TEXT,
  amount REAL,
  note TEXT,
  officer TEXT,
  source TEXT,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delete_reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  backup_json TEXT
);