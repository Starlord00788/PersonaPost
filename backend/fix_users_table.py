"""
Fix the users table:
1. Make `name` nullable (SQLite requires table recreation for this)
2. Make `username` NOT NULL and UNIQUE
3. Preserve all existing data
"""
import sqlite3

conn = sqlite3.connect('./personapost.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

# --- Backup existing rows ---
c.execute("SELECT * FROM users")
existing = [dict(r) for r in c.fetchall()]
print(f"Found {len(existing)} existing user rows to migrate")

# --- Recreate users table with correct schema ---
# Use a temp table approach safe for SQLite
c.executescript("""
PRAGMA foreign_keys = OFF;

-- Rename old table
ALTER TABLE users RENAME TO users_old;

-- Create new table with correct constraints
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) DEFAULT '',
    name VARCHAR(255),
    password_hash TEXT,
    google_id VARCHAR(128) UNIQUE,
    is_active BOOLEAN DEFAULT 1,
    plan VARCHAR(30) DEFAULT 'free',
    created_at DATETIME NOT NULL,
    last_login_at DATETIME
);

-- Copy data, using username or email prefix if username is null
INSERT INTO users (id, username, email, display_name, name, password_hash, google_id, is_active, plan, created_at, last_login_at)
SELECT
    id,
    COALESCE(username, SUBSTR(email, 1, INSTR(email, '@') - 1), 'user_' || id) as username,
    email,
    COALESCE(display_name, name, '') as display_name,
    name,
    password_hash,
    google_id,
    COALESCE(is_active, 1),
    COALESCE(plan, 'free'),
    created_at,
    last_login_at
FROM users_old;

-- Drop old table
DROP TABLE users_old;

PRAGMA foreign_keys = ON;
""")

conn.commit()

# Verify
c.execute("SELECT id, username, email, display_name FROM users")
rows = c.fetchall()
print(f"Migration complete. Users in table: {len(rows)}")
for row in rows:
    print(f"  id={row[0]} username={row[1]} email={row[2]} display_name={row[3]}")

conn.close()
print("\n[DONE] users table fixed!")
