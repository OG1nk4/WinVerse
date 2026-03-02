// =============================================
// WinVerse — Admin Dashboard Logic
// =============================================

const API = '';
let allNumbers = [];
let currentFilter = 'todos';
let editingNumber = null;

// =============================================
// Inicialização
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    loadAdminData();
    setupFilters();
    setupEditModal();
});

// =============================================
// Carregar dados (com Basic Auth automático do browser)
// =============================================
async function loadAdminData() {
    try {
        const [numbersRes, statsRes] = await Promise.all([
            fetch(`${API}/api/admin/numbers`),
            fetch(`${API}/api/admin/stats`)
        ]);

        if (numbersRes.status === 401 || statsRes.status === 401) {
            showToast('Credenciais inválidas.', true);
            return;
        }

        allNumbers = await numbersRes.json();
        const stats = await statsRes.json();

        renderStats(stats);
        renderTable(filterNumbers(allNumbers));
    } catch (err) {
        showToast('Erro ao carregar dados.', true);
        console.error(err);
    }
}

// =============================================
// Renderizar estatísticas
// =============================================
function renderStats(stats) {
    document.getElementById('stat-livres').textContent = stats.livres;
    document.getElementById('stat-pendentes').textContent = stats.pendentes;
    document.getElementById('stat-pagos').textContent = stats.pagos;
    document.getElementById('stat-total').textContent = `R$ ${stats.total_arrecadado.toFixed(2).replace('.', ',')}`;
}

// =============================================
// Renderizar tabela
// =============================================
function renderTable(numbers) {
    const tbody = document.getElementById('admin-table-body');

    if (numbers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhum número encontrado</td></tr>`;
        return;
    }

    tbody.innerHTML = numbers.map(n => `
    <tr data-status="${n.status}">
      <td><strong>${String(n.number).padStart(2, '0')}</strong></td>
      <td><span class="status-badge ${n.status}">${n.status}</span></td>
      <td>${n.name || '—'}</td>
      <td>${n.whatsapp ? formatWhatsAppLink(n.whatsapp) : '—'}</td>
      <td>${formatDate(n.created_at)}</td>
      <td>${formatDate(n.paid_at)}</td>
      <td>${renderActions(n)}</td>
    </tr>
  `).join('');
}

function formatWhatsAppLink(phone) {
    const clean = phone.replace(/\D/g, '');
    return `<a href="https://wa.me/55${clean}" target="_blank" style="color:var(--livre);text-decoration:none;">${phone}</a>`;
}

function renderActions(n) {
    const actions = [];

    // Botão EDITAR — sempre visível para qualquer status
    actions.push(`<button class="btn-sm btn-edit" onclick="openEditModal(${n.number}, '${n.status}', '${escapeStr(n.name)}', '${escapeStr(n.whatsapp)}')">✏️ Editar</button>`);

    // Ações rápidas por status
    if (n.status === 'pendente') {
        actions.push(`<button class="btn-sm btn-confirm" onclick="quickConfirm(${n.number})">✓ Pago</button>`);
        actions.push(`<button class="btn-sm btn-release" onclick="quickRelease(${n.number})">✕ Liberar</button>`);
    } else if (n.status === 'pago') {
        actions.push(`<button class="btn-sm btn-release" onclick="quickRelease(${n.number})">✕ Liberar</button>`);
    }

    return actions.join('');
}

function escapeStr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// =============================================
// Modal de Edição
// =============================================
function setupEditModal() {
    // Fechar modal
    document.getElementById('btn-close-edit').addEventListener('click', closeEditModal);
    document.getElementById('modal-edit').addEventListener('click', (e) => {
        if (e.target.id === 'modal-edit') closeEditModal();
    });

    // Salvar
    document.getElementById('form-edit').addEventListener('submit', saveEdit);

    // ESC fecha modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeEditModal();
    });
}

function openEditModal(number, status, name, whatsapp) {
    editingNumber = number;
    document.getElementById('edit-number-badge').textContent = String(number).padStart(2, '0');
    document.getElementById('edit-status').value = status;
    document.getElementById('edit-name').value = name || '';
    document.getElementById('edit-whatsapp').value = whatsapp || '';

    const modal = document.getElementById('modal-edit');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    const modal = document.getElementById('modal-edit');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    editingNumber = null;
}

async function saveEdit(e) {
    e.preventDefault();

    const status = document.getElementById('edit-status').value;
    const name = document.getElementById('edit-name').value.trim();
    const whatsapp = document.getElementById('edit-whatsapp').value.trim();

    try {
        const res = await fetch(`${API}/api/admin/update/${editingNumber}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, name, whatsapp })
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Número ${editingNumber} atualizado!`);
            closeEditModal();
            loadAdminData();
        } else {
            showToast(data.error || 'Erro ao atualizar.', true);
        }
    } catch (err) {
        showToast('Erro de conexão.', true);
    }
}

// =============================================
// Ações Rápidas
// =============================================
async function quickRelease(number) {
    if (!confirm(`Liberar o número ${number}? Isso apagará nome e WhatsApp.`)) return;

    try {
        const res = await fetch(`${API}/api/admin/release/${number}`, { method: 'POST' });
        if (res.ok) {
            showToast(`Número ${number} liberado!`);
            loadAdminData();
        } else {
            const data = await res.json();
            showToast(data.error || 'Erro ao liberar.', true);
        }
    } catch (err) {
        showToast('Erro de conexão.', true);
    }
}

async function quickConfirm(number) {
    if (!confirm(`Confirmar pagamento do número ${number}?`)) return;

    try {
        const res = await fetch(`${API}/api/admin/confirm/${number}`, { method: 'POST' });
        if (res.ok) {
            showToast(`Número ${number} marcado como pago!`);
            loadAdminData();
        } else {
            const data = await res.json();
            showToast(data.error || 'Erro ao confirmar.', true);
        }
    } catch (err) {
        showToast('Erro de conexão.', true);
    }
}

// =============================================
// Filtros
// =============================================
function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTable(filterNumbers(allNumbers));
        });
    });
}

function filterNumbers(numbers) {
    if (currentFilter === 'todos') return numbers;
    return numbers.filter(n => n.status === currentFilter);
}

// =============================================
// Utilitários
// =============================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
