import psycopg2
import os
from psycopg2 import extras
from datetime import datetime

# URL de la base de datos desde variables de entorno (Supabase/Neon)
DATABASE_URL = os.getenv('DATABASE_URL')

def get_db_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL no está configurada en las variables de entorno.")
    
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        )
    ''')

    # Default currency setting
    cursor.execute('INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING', ('currency', '$'))

    # Categories table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('income', 'expense', 'saving')) NOT NULL,
            color TEXT DEFAULT '#64748b'
        )
    ''')
    
    # Asegurar que el nombre de la categoría sea único para evitar duplicados en reinicios
    # Pero no queremos romper la estructura existente si ya hay datos.
    # En un fresh start, podemos añadir UNIQUE a 'name' si queremos, 
    # pero mantendré la compatibilidad con el esquema original lo más posible.
    # Usaremos ON CONFLICT (id) o similar si fuera necesario.
    # Para categorías iniciales, mejor insertar si no existen.
    
    default_categories = [
        ('Sueldo', 'income', '#10b981'),
        ('Comida', 'expense', '#ef4444'),
        ('Alquiler', 'expense', '#f59e0b'),
        ('Transporte', 'expense', '#3b82f6'),
        ('Ahorro Emergencia', 'saving', '#8b5cf6'),
        ('Transferencia Interna', 'saving', '#94a3b8')
    ]
    
    for cat in default_categories:
        cursor.execute(
            'INSERT INTO categories (name, type, color) SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = %s)',
            (cat[0], cat[1], cat[2], cat[0])
        )

    # Transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            category_id INTEGER,
            amount REAL NOT NULL,
            concept TEXT NOT NULL,
            date DATE NOT NULL,
            type TEXT CHECK(type IN ('income', 'expense', 'saving')) NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories (id)
        )
    ''')

    conn.commit()
    cursor.close()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
