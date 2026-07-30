# -*- coding: utf-8 -*-
"""Run this script from the backend directory to apply the multi-user migration."""
import sqlite3
import sys

# Fix Windows encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Step 1: create_all for new tables (users, notifications)
from app.db import init_db
init_db()
print("[OK] create_all done - new tables created (users, notifications)")

# Step 2: additive ALTER TABLE for existing tables
conn = sqlite3.connect("./personapost.db")
c = conn.cursor()

migrations = [
    ("drafts", "user_id", "ALTER TABLE drafts ADD COLUMN user_id INTEGER REFERENCES users(id)"),
    ("drafts", "trend_title", "ALTER TABLE drafts ADD COLUMN trend_title VARCHAR(255)"),
    ("calendar_entries", "user_id", "ALTER TABLE calendar_entries ADD COLUMN user_id INTEGER REFERENCES users(id)"),
    ("calendar_entries", "notified", "ALTER TABLE calendar_entries ADD COLUMN notified BOOLEAN DEFAULT 0"),
    ("calendar_entries", "notes", "ALTER TABLE calendar_entries ADD COLUMN notes TEXT"),
    ("knowledge_chunks", "user_id", "ALTER TABLE knowledge_chunks ADD COLUMN user_id INTEGER REFERENCES users(id)"),
    ("voice_profiles", "user_id", "ALTER TABLE voice_profiles ADD COLUMN user_id INTEGER REFERENCES users(id)"),
    ("users", "username", "ALTER TABLE users ADD COLUMN username VARCHAR(80)"),
    ("users", "display_name", "ALTER TABLE users ADD COLUMN display_name VARCHAR(255) DEFAULT ''"),
    ("users", "password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT"),
    ("users", "is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"),
    ("users", "plan", "ALTER TABLE users ADD COLUMN plan VARCHAR(30) DEFAULT 'free'"),
    ("users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at DATETIME"),
]

for table, col, sql in migrations:
    try:
        c.execute(sql)
        print(f"[OK] ALTER TABLE {table} ADD COLUMN {col}")
    except Exception as e:
        print(f"[SKIP] {table}.{col}: {e}")

conn.commit()
conn.close()
print("\n[DONE] Migration complete!")
