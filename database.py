import sqlite3
import os
from datetime import datetime

# Usamos una variable global que puede ser modificada por api/index.py en Vercel
DATABASE = 'finance.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path=None):
    global DATABASE
    if db_path:
        DATABASE = db_path
    
    conn = get_db_connection()
    cursor = conn.cursor()

    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        )
    ''')

    # Default currency setting
    cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ('currency', '$'))

    # Categories table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('income', 'expense', 'saving')) NOT NULL,
            color TEXT DEFAULT '#64748b'
        )
    ''')

    # Initial categories
    default_categories = [
        ('Sueldo', 'income', '#10b981'),
        ('Comida', 'expense', '#ef4444'),
        ('Alquiler', 'expense', '#f59e0b'),
        ('Transporte', 'expense', '#3b82f6'),
        ('Ahorro Emergencia', 'saving', '#8b5cf6'),
        ('Transferencia Interna', 'saving', '#94a3b8')
    ]
    cursor.executemany('INSERT OR IGNORE INTO categories (name, type, color) VALUES (?, ?, ?)', default_categories)

    # Transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            amount REAL NOT NULL,
            concept TEXT NOT NULL,
            date TEXT NOT NULL,
            type TEXT CHECK(type IN ('income', 'expense', 'saving')) NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories (id)
        )
    ''')



    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
