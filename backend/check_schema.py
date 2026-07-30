import sqlite3

conn = sqlite3.connect('./personapost.db')
c = conn.cursor()

# Show current schema
c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
row = c.fetchone()
print("CURRENT SCHEMA:")
print(row[0] if row else "NOT FOUND")
print()

# Show columns
c.execute("PRAGMA table_info(users)")
cols = c.fetchall()
print("COLUMNS:", [(col[1], col[2], "NOT NULL" if col[3] else "nullable") for col in cols])
conn.close()
