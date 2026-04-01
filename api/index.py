from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timedelta

import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database import init_db

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

# CONFIGURACIÓN DINÁMICA DE BASE DE DATOS PARA VERCEL
IS_VERCEL = 'VERCEL' in os.environ
if IS_VERCEL:
    DATABASE = '/tmp/finance.db'
else:
    DATABASE = os.path.join(os.path.dirname(__file__), '..', 'finance.db')

# Asegurar que la base de datos esté inicializada en cada ejecución si no existe
if not os.path.exists(DATABASE):
    init_db(DATABASE)

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn



# API Endpoints
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        key = data.get('key')
        value = data.get('value')
        conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
        conn.commit()
    
    settings = conn.execute('SELECT key, value FROM settings').fetchall()
    conn.close()
    return jsonify({row['key']: row['value'] for row in settings})

@app.route('/api/summary')
def get_summary():
    conn = get_db_connection()
    # Filter out 'Transferencia Interna' from KPI calculations
    # Fetch ID for internal transfer
    internal_cat = conn.execute("SELECT id FROM categories WHERE name = 'Transferencia Interna'").fetchone()
    internal_id = internal_cat['id'] if internal_cat else -1

    # Total stats
    stats = conn.execute(f'''
        SELECT 
            SUM(CASE WHEN type = 'income' AND category_id != {internal_id} THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN type = 'expense' AND category_id != {internal_id} THEN amount ELSE 0 END) as total_expense,
            SUM(CASE WHEN type = 'saving' AND category_id != {internal_id} THEN amount ELSE 0 END) as total_saving
        FROM transactions
    ''').fetchone()

    # Monthly history (last 6 months)
    history = conn.execute(f'''
        SELECT 
            strftime('%Y-%m', date) as month,
            SUM(CASE WHEN type = 'income' AND category_id != {internal_id} THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type = 'expense' AND category_id != {internal_id} THEN amount ELSE 0 END) as expense
        FROM transactions
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
    ''').fetchall()

    # Category Breakdown (Expenses)
    category_summary = conn.execute(f'''
        SELECT c.name, c.color, SUM(t.amount) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.type = 'expense' AND t.category_id != {internal_id}
        GROUP BY c.id
        ORDER BY total DESC
    ''').fetchall()

    conn.close()
    return jsonify({
        'total_income': stats['total_income'] or 0,
        'total_expense': stats['total_expense'] or 0,
        'total_saving': stats['total_saving'] or 0,
        'balance': (stats['total_income'] or 0) - (stats['total_expense'] or 0),
        'history': [dict(row) for row in reversed(history)],
        'category_breakdown': [dict(row) for row in category_summary]
    })



@app.route('/api/transactions', methods=['GET', 'POST'])
def handle_transactions():
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        conn.execute('''
            INSERT INTO transactions (category_id, amount, concept, date, type)
            VALUES (?, ?, ?, ?, ?)
        ''', (data['category_id'], data['amount'], data['concept'], data['date'], data['type']))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})

    # GET
    limit = request.args.get('limit', 10)
    transactions = conn.execute('''
        SELECT t.*, c.name as category_name, c.color as category_color
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY date DESC, id DESC
        LIMIT ?
    ''', (limit,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in transactions])

@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    conn = get_db_connection()
    conn.execute('DELETE FROM transactions WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/api/categories', methods=['GET', 'POST'])
def handle_categories():
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        conn.execute('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
                     (data['name'], data['type'], data['color']))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})

    # GET
    categories = conn.execute('SELECT * FROM categories').fetchall()
    conn.close()
    return jsonify([dict(row) for row in categories])

@app.route('/api/categories/<int:id>', methods=['DELETE', 'PUT'])
def manage_category(id):
    conn = get_db_connection()
    if request.method == 'DELETE':
        # Validar si tiene transacciones
        usage = conn.execute('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', (id,)).fetchone()
        if usage['count'] > 0:
            conn.close()
            return jsonify({
                'status': 'error', 
                'message': 'No puedes eliminar esta categoría porque tiene registros asociados.'
            }), 400
        
        conn.execute('DELETE FROM categories WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})

    if request.method == 'PUT':
        data = request.json
        conn.execute('UPDATE categories SET name = ?, type = ?, color = ? WHERE id = ?',
                     (data['name'], data['type'], data['color'], id))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'})
    
    conn.close()
    return jsonify({'status': 'error', 'message': 'Method not allowed'}), 405

if __name__ == '__main__':
    app.run(debug=True, port=5000)
