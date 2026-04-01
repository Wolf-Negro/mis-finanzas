/**
 * Mis Finanzas - Core SPA Logic
 */

const state = {
    currentView: 'dashboard',
    currency: '$',
    categories: [],
    summary: null,
    transactions: []
};

const elements = {
    viewContainer: document.getElementById('view-container'),
    viewTitle: document.getElementById('view-title'),
    navItems: document.querySelectorAll('.nav-item'),
    toastContainer: document.getElementById('toast-container'),
    currencyBadge: document.getElementById('current-currency'),
    dateDisplay: document.getElementById('current-date')
};

// Utilities
const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const formatCurrency = (amount) => {
    return `${state.currency} ${parseFloat(amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
};

const fetchAPI = async (endpoint, options = {}) => {
    try {
        const response = await fetch(endpoint, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        return await response.json();
    } catch (error) {
        showToast('Error de conexión con el servidor', 'error');
        console.error(error);
    }
};

// Data Loading
const loadInitialData = async () => {
    const settings = await fetchAPI('/api/settings');
    state.currency = settings.currency || '$';
    elements.currencyBadge.innerText = state.currency;

    state.categories = await fetchAPI('/api/categories');
    
    // Set date
    const now = new Date();
    elements.dateDisplay.innerText = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

// Views
const views = {
    dashboard: async () => {
        elements.viewTitle.innerText = 'Dashboard';
        elements.viewContainer.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
        
        const summary = await fetchAPI('/api/summary');
        const latest = await fetchAPI('/api/transactions?limit=5');
        
        elements.viewContainer.innerHTML = `
            <div class="kpi-grid">
                <div class="card kpi-card income">
                    <span class="label">Ingresos Totales</span>
                    <span class="value">${formatCurrency(summary.total_income)}</span>
                </div>
                <div class="card kpi-card expense">
                    <span class="label">Egresos Totales</span>
                    <span class="value">${formatCurrency(summary.total_expense)}</span>
                </div>
                <div class="card kpi-card balance">
                    <span class="label">Saldo Actual</span>
                    <span class="value">${formatCurrency(summary.balance)}</span>
                </div>
                <div class="card kpi-card saving">
                    <span class="label">Ahorro Acumulado</span>
                    <span class="value">${formatCurrency(summary.total_saving)}</span>
                </div>
            </div>

            <div class="dashboard-charts">
                <div class="card chart-container">
                    <h3 style="margin-bottom: 20px;">Ingresos vs Egresos (Cruce Mensual)</h3>
                    <canvas id="mainChart"></canvas>
                </div>
                <div class="card chart-container">
                    <h3 style="margin-bottom: 20px;">Gastos por Categoría</h3>
                    <canvas id="categoryChart"></canvas>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-bottom: 20px;">Últimos Movimientos</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Concepto</th>
                                <th>Categoría</th>
                                <th>Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${latest.map(t => `
                                <tr>
                                    <td>${t.date}</td>
                                    <td>${t.concept}</td>
                                    <td><span class="badge" style="background: ${t.category_color}20; color: ${t.category_color}">${t.category_name}</span></td>
                                    <td style="color: ${t.type === 'income' ? 'var(--income)' : (t.type === 'expense' ? 'var(--expense)' : 'var(--saving)')}; font-weight: bold;">
                                        ${t.type === 'expense' ? '-' : ''}${formatCurrency(t.amount)}
                                    </td>
                                </tr>
                            `).join('')}
                            ${latest.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #94a3b8;">No hay registros recientes</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Render Main Chart
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        new Chart(ctxMain, {
            type: 'bar',
            data: {
                labels: summary.history.map(h => h.month),
                datasets: [
                    {
                        label: 'Ingresos',
                        data: summary.history.map(h => h.income),
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    },
                    {
                        label: 'Egresos',
                        data: summary.history.map(h => h.expense),
                        backgroundColor: '#ef4444',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'top', align: 'end' }
                }
            }
        });

        // Render Category Chart
        const ctxCat = document.getElementById('categoryChart').getContext('2d');
        const hasData = summary.category_breakdown.length > 0;
        
        new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: hasData ? summary.category_breakdown.map(c => c.name) : ['Sin datos'],
                datasets: [{
                    data: hasData ? summary.category_breakdown.map(c => c.total) : [1],
                    backgroundColor: hasData ? summary.category_breakdown.map(c => c.color) : ['#e2e8f0'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 15, font: { size: 11 } }
                    },
                    tooltip: {
                        enabled: hasData,
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed !== null) {
                                    label += formatCurrency(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    },

    transactions: async () => {
        elements.viewTitle.innerText = 'Registros de Movimientos';
        const transactions = await fetchAPI('/api/transactions?limit=50');
        
        elements.viewContainer.innerHTML = `
            <div class="card" style="margin-bottom: 32px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Nuevo Registro</h3>
                </div>
                <form id="transaction-form" class="grid-form">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                        <div class="form-group">
                            <label>Tipo</label>
                            <select name="type" id="trans-type" required>
                                <option value="income">Ingreso</option>
                                <option value="expense">Egreso</option>
                                <option value="saving">Ahorro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Categoría</label>
                            <select name="category_id" id="trans-category" required>
                                ${state.categories.map(c => `<option value="${c.id}" data-type="${c.type}">${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Monto</label>
                            <input type="number" step="0.01" name="amount" id="trans-amount" placeholder="0.00" required>
                        </div>
                        <div class="form-group">
                            <label>Fecha</label>
                            <input type="date" name="date" id="trans-date" value="${new Date().toISOString().split('T')[0]}" required>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 10px;">
                        <label>Concepto</label>
                        <input type="text" name="concept" id="trans-concept" placeholder="Ej: Pago de luz, Venta de producto..." required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">Guardar Movimiento</button>
                </form>
            </div>

            <div class="card">
                <h3 style="margin-bottom: 20px;">Historial Reciente</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Concepto</th>
                                <th>Categoría</th>
                                <th>Monto</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody id="transactions-table-body">
                            ${transactions.map(t => `
                                <tr id="t-row-${t.id}">
                                    <td>${t.date}</td>
                                    <td>${t.concept}</td>
                                    <td><span class="badge" style="background: ${t.category_color}20; color: ${t.category_color}">${t.category_name}</span></td>
                                    <td style="color: ${t.type === 'income' ? 'var(--income)' : (t.type === 'expense' ? 'var(--expense)' : 'var(--saving)')}; font-weight: bold;">
                                        ${t.type === 'expense' ? '-' : ''}${formatCurrency(t.amount)}
                                    </td>
                                    <td>
                                        <button class="btn-delete" onclick="window.deleteTransaction(${t.id})">
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Filter categories by type
        const typeSelect = document.getElementById('trans-type');
        const catSelect = document.getElementById('trans-category');
        
        const filterCats = () => {
            const selectedType = typeSelect.value;
            Array.from(catSelect.options).forEach(opt => {
                opt.style.display = opt.dataset.type === selectedType ? '' : 'none';
            });
            // Pick first visible
            const first = Array.from(catSelect.options).find(opt => opt.style.display === '');
            if (first) catSelect.value = first.value;
        };

        typeSelect.addEventListener('change', filterCats);
        filterCats();



        // Friction Logic (Anti-Impulse)
        const showFrictionModal = (onConfirm, onCancel) => {
            const overlay = document.createElement('div');
            overlay.className = 'friction-overlay';
            overlay.innerHTML = `
                <div class="friction-modal">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h2>Alerta de Impulso</h2>
                    <p>¿Realmente necesitas comprar esto ahora mismo o es un impulso que arruina tu ahorro?</p>
                    <div class="friction-actions">
                        <button id="friction-confirm" class="btn-confirm" disabled>Esperar (5s)</button>
                        <button id="friction-cancel" class="btn-cancel">No lo necesito, cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            let timeLeft = 5;
            const btnConfirm = overlay.querySelector('#friction-confirm');
            const timer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    btnConfirm.innerText = 'Confirmar Gasto';
                    btnConfirm.disabled = false;
                } else {
                    btnConfirm.innerText = `Esperar (${timeLeft}s)`;
                }
            }, 1000);

            btnConfirm.onclick = () => { overlay.remove(); onConfirm(); };
            overlay.querySelector('#friction-cancel').onclick = () => { overlay.remove(); onCancel(); };
        };

        // Form Submit
        document.getElementById('transaction-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            const amount = parseFloat(data.amount);
            const type = data.type;
            const concept = data.concept.toLowerCase();
            
            // Get category name for validation
            const catSelect = document.getElementById('trans-category');
            const categoryName = catSelect.options[catSelect.selectedIndex].text.toLowerCase();
            
            // Dictionary of Impulses
            const impulseKeywords = [
                'snack', 'dulce', 'gaseosa', 'chocolate', 'delivery', 'rappi', 'pedidosya', 'galleta', 'café', 'starbucks', 'chatarra', 'piqueo', 'helado',
                'cigarro', 'alcohol', 'cerveza', 'bar', 'cine', 'juego', 'skin', 'casino', 'lotería',
                'capricho', 'innecesario', 'lujo', 'antojo'
            ];
            
            const isImpulseCategory = ['gasto hormiga', 'antojos'].includes(categoryName);
            const isImpulseKeyword = impulseKeywords.some(kw => concept.includes(kw));
            const isSmallAmount = amount < 15;

            const submitData = async () => {
                const res = await fetchAPI('/api/transactions', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                if (res.status === 'success') {
                    showToast('Movimiento registrado correctamente');
                    views.transactions(); // Refresh
                }
            };

            if (type === 'expense' && (isSmallAmount || isImpulseCategory || isImpulseKeyword)) {
                showFrictionModal(
                    submitData, 
                    () => showToast('¡Bien hecho, Inge! Ese dinero se queda en tu cuenta para tus metas reales.', 'success')
                );
            } else {
                submitData();
            }
        });
    },

    categories: async () => {
        elements.viewTitle.innerText = 'Gestión de Categorías';
        state.editingCategoryId = null; // Reset edit mode
        
        elements.viewContainer.innerHTML = `
            <div class="card" style="margin-bottom: 32px;">
                <h3 id="category-form-title" style="margin-bottom: 20px;">Nueva Categoría</h3>
                <form id="category-form" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 15px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Nombre</label>
                        <input type="text" name="name" id="cat-name" placeholder="Ej: Supermercado" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Tipo</label>
                        <select name="type" id="cat-type" required>
                            <option value="income">Ingreso</option>
                            <option value="expense">Egreso</option>
                            <option value="saving">Ahorro</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Color</label>
                        <input type="color" name="color" id="cat-color" value="#6366f1" style="padding: 2px; height: 42px;">
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button type="submit" id="cat-submit-btn" class="btn btn-primary" style="height: 42px;">Agregar</button>
                        <button type="button" id="cat-cancel-btn" class="btn" style="height: 42px; display: none; background: #e2e8f0;">Cancelar</button>
                    </div>
                </form>
            </div>

            <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                ${state.categories.map(c => `
                    <div class="card category-card" style="display: flex; align-items: center; justify-content: space-between; border-left: 4px solid ${c.color}">
                        <div>
                            <p style="font-weight: 700;">${c.name}</p>
                            <span style="font-size: 0.75rem; color: var(--secondary); text-transform: uppercase;">${c.type}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${c.color}"></div>
                            <div class="category-actions">
                                <button class="action-btn edit" onclick="window.editCategory(${c.id})" title="Editar">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                                <button class="action-btn delete" onclick="window.deleteCategory(${c.id})" title="Eliminar">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        const form = document.getElementById('category-form');
        const submitBtn = document.getElementById('cat-submit-btn');
        const cancelBtn = document.getElementById('cat-cancel-btn');
        const formTitle = document.getElementById('category-form-title');

        // Global functions for this view
        window.editCategory = (id) => {
            const cat = state.categories.find(c => c.id === id);
            if (!cat) return;
            
            state.editingCategoryId = id;
            document.getElementById('cat-name').value = cat.name;
            document.getElementById('cat-type').value = cat.type;
            document.getElementById('cat-color').value = cat.color;
            
            formTitle.innerText = 'Editar Categoría';
            submitBtn.innerText = 'Actualizar';
            cancelBtn.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.deleteCategory = async (id) => {
            if (!confirm('¿Estás seguro de eliminar esta categoría?')) return;
            
            const res = await fetchAPI(`/api/categories/${id}`, { method: 'DELETE' });
            if (res.status === 'success') {
                showToast('Categoría eliminada');
                state.categories = await fetchAPI('/api/categories');
                views.categories();
            } else {
                showToast(res.message || 'Error al eliminar', 'error');
            }
        };

        cancelBtn.addEventListener('click', () => {
            state.editingCategoryId = null;
            form.reset();
            formTitle.innerText = 'Nueva Categoría';
            submitBtn.innerText = 'Agregar';
            cancelBtn.style.display = 'none';
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            const url = state.editingCategoryId ? `/api/categories/${state.editingCategoryId}` : '/api/categories';
            const method = state.editingCategoryId ? 'PUT' : 'POST';

            const res = await fetchAPI(url, {
                method: method,
                body: JSON.stringify(data)
            });

            if (res.status === 'success') {
                showToast(state.editingCategoryId ? 'Categoría actualizada' : 'Categoría creada');
                state.categories = await fetchAPI('/api/categories');
                views.categories();
            }
        });
    },

    settings: async () => {
        elements.viewTitle.innerText = 'Configuración General';
        
        elements.viewContainer.innerHTML = `
            <div class="card form-card">
                <h3 style="margin-bottom: 24px;">Preferencias del Sistema</h3>
                <div class="form-group">
                    <label>Símbolo de Moneda (Ej: $, S/., €, MXN)</label>
                    <input type="text" id="setting-currency" value="${state.currency}" placeholder="Símbolo...">
                </div>
                <button class="btn btn-primary" id="save-settings" style="width: 100%;">Guardar Cambios</button>
            </div>
        `;

        document.getElementById('save-settings').addEventListener('click', async () => {
            const newCurrency = document.getElementById('setting-currency').value;
            await fetchAPI('/api/settings', {
                method: 'POST',
                body: JSON.stringify({ key: 'currency', value: newCurrency })
            });

            state.currency = newCurrency;
            elements.currencyBadge.innerText = newCurrency;
            showToast('Configuración actualizada');
        });
    }
};

// Global Helpers
window.deleteTransaction = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    
    const res = await fetchAPI(`/api/transactions/${id}`, { method: 'DELETE' });
    if (res.status === 'success') {
        showToast('Registro eliminado');
        document.getElementById(`t-row-${id}`).remove();
    }
};

// Router
const navigate = (view) => {
    state.currentView = view;
    // Update UI
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });
    // Call view function
    if (views[view]) views[view]();
};

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    
    // Nav Click
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(item.dataset.view);
        });
    });

    // Initial View
    navigate('dashboard');
});
