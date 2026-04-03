from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2 import extras
import os
from datetime import datetime, timedelta

import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database import init_db, get_db_connection

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# Inicializar base de datos en el arranque (especialmente útil en Vercel)
# forzando reinicio
try:
    init_db()
except Exception as e:
    print(f"Error al inicializar la DB: {e}")

def get_pg_connection():
    conn = get_db_connection()
    # Usar DictCursor para mantener la estructura de respuesta (similar a sqlite3.Row)
    return conn

# API Endpoints
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    conn = get_pg_connection()
    cur = conn.cursor(cursor_factory=extras.DictCursor)
    try:
        if request.method == 'POST':
            data = request.json
            key = data.get('key')
            value = data.get('value')
            cur.execute('INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', (key, value))
            conn.commit()
        
        cur.execute('SELECT key, value FROM settings')
        settings = cur.fetchall()
        return jsonify({row['key']: row['value'] for row in settings})
    finally:
        cur.close()
        conn.close()

@app.route('/api/summary')
def get_summary():
    conn = get_pg_connection()
    cur = conn.cursor(cursor_factory=extras.DictCursor)
    try:
        # Fetch ID for internal transfer
        cur.execute("SELECT id FROM categories WHERE name = 'Transferencia Interna'")
        internal_cat = cur.fetchone()
        internal_id = internal_cat['id'] if internal_cat else -1

        # Total stats
        cur.execute(f'''
            SELECT 
                SUM(CASE WHEN type = 'income' AND category_id != %s THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'expense' AND category_id != %s THEN amount ELSE 0 END) as total_expense,
                SUM(CASE WHEN type = 'saving' AND category_id != %s THEN amount ELSE 0 END) as total_saving
            FROM transactions
        ''', (internal_id, internal_id, internal_id))
        stats = cur.fetchone()

        # Monthly history (last 6 months)
        cur.execute(f'''
            SELECT 
                to_char(date, 'YYYY-MM') as month,
                SUM(CASE WHEN type = 'income' AND category_id != %s THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' AND category_id != %s THEN amount ELSE 0 END) as expense
            FROM transactions
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        ''', (internal_id, internal_id))
        history = cur.fetchall()

        # Category Breakdown (Expenses)
        cur.execute(f'''
            SELECT c.name, c.color, SUM(t.amount) as total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.category_id != %s
            GROUP BY c.id, c.name, c.color
            ORDER BY total DESC
        ''', (internal_id,))
        category_summary = cur.fetchall()

        return jsonify({
            'total_income': stats['total_income'] or 0,
            'total_expense': stats['total_expense'] or 0,
            'total_saving': stats['total_saving'] or 0,
            'balance': (stats['total_income'] or 0) - (stats['total_expense'] or 0),
            'history': [dict(row) for row in reversed(history)],
            'category_breakdown': [dict(row) for row in category_summary]
        })
    finally:
        cur.close()
        conn.close()

@app.route('/api/transactions', methods=['GET', 'POST'])
def handle_transactions():
    conn = get_pg_connection()
    cur = conn.cursor(cursor_factory=extras.DictCursor)
    try:
        if request.method == 'POST':
            data = request.json
            cur.execute('''
                INSERT INTO transactions (category_id, amount, concept, date, type)
                VALUES (%s, %s, %s, %s, %s)
            ''', (data['category_id'], data['amount'], data['concept'], data['date'], data['type']))
            conn.commit()
            return jsonify({'status': 'success'})

        # GET
        limit = request.args.get('limit', 10)
        cur.execute('''
            SELECT t.*, c.name as category_name, c.color as category_color
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            ORDER BY date DESC, id DESC
            LIMIT %s
        ''', (limit,))
        transactions = cur.fetchall()
        return jsonify([dict(row) for row in transactions])
    finally:
        cur.close()
        conn.close()

@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    conn = get_pg_connection()
    cur = conn.cursor()
    try:
        cur.execute('DELETE FROM transactions WHERE id = %s', (id,))
        conn.commit()
        return jsonify({'status': 'success'})
    finally:
        cur.close()
        conn.close()

@app.route('/api/categories', methods=['GET', 'POST'])
def handle_categories():
    conn = get_pg_connection()
    cur = conn.cursor(cursor_factory=extras.DictCursor)
    try:
        if request.method == 'POST':
            data = request.json
            cur.execute('INSERT INTO categories (name, type, color) VALUES (%s, %s, %s)',
                         (data['name'], data['type'], data['color']))
            conn.commit()
            return jsonify({'status': 'success'})

        # GET
        cur.execute('SELECT * FROM categories')
        categories = cur.fetchall()
        return jsonify([dict(row) for row in categories])
    finally:
        cur.close()
        conn.close()

@app.route('/api/categories/<int:id>', methods=['DELETE', 'PUT'])
def manage_category(id):
    conn = get_pg_connection()
    cur = conn.cursor(cursor_factory=extras.DictCursor)
    try:
        if request.method == 'DELETE':
            # Validar si tiene transacciones
            cur.execute('SELECT COUNT(*) as count FROM transactions WHERE category_id = %s', (id,))
            usage = cur.fetchone()
            if usage['count'] > 0:
                return jsonify({
                    'status': 'error', 
                    'message': 'No puedes eliminar esta categoría porque tiene registros asociados.'
                }), 400
            
            cur.execute('DELETE FROM categories WHERE id = %s', (id,))
            conn.commit()
            return jsonify({'status': 'success'})

        if request.method == 'PUT':
            data = request.json
            cur.execute('UPDATE categories SET name = %s, type = %s, color = %s WHERE id = %s',
                         (data['name'], data['type'], data['color'], id))
            conn.commit()
            return jsonify({'status': 'success'})
        
        return jsonify({'status': 'error', 'message': 'Method not allowed'}), 405
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
