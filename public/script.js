// =============================================
// WinVerse — Frontend Logic (Multi-Seleção)
// =============================================

const API = '';
let selectedNumbers = [];      // Array de números selecionados
let pollingNumbers = [];       // Números para polling
let pollingInterval = null;
let countdownInterval = null;
let pixValue = 20;             // Valor unitário (carregado via API)
const PIX_TIMEOUT = 60;        // Segundos para expirar

// =============================================
// Inicialização
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadNumbers();
    setupEventListeners();
});

// =============================================
// Carregar configurações (valor dinâmico)
// =============================================
async function loadConfig() {
    try {
        const res = await fetch(`${API}/api/config`);
        const config = await res.json();
        pixValue = config.pix_value;
        const priceEl = document.getElementById('prize-value');
        if (priceEl) {
            priceEl.textContent = formatCurrency(pixValue);
        }
    } catch (err) {
        console.error('Erro ao carregar config:', err);
    }
}

// =============================================
// Carregar números
// =============================================
async function loadNumbers() {
    try {
        const res = await fetch(`${API}/api/numbers`);
        const numbers = await res.json();
        renderGrid(numbers);
        updateStats(numbers);
    } catch (err) {
        showToast('Erro ao carregar números. Tente novamente.', true);
        console.error(err);
    }
}

function renderGrid(numbers) {
    const grid = document.getElementById('numbers-grid');
    grid.innerHTML = '';

    numbers.forEach(n => {
        const cell = document.createElement('div');
        const isSelected = selectedNumbers.includes(n.number);
        cell.className = `number-cell ${isSelected ? 'selecionado' : n.status}`;
        cell.textContent = String(n.number).padStart(2, '0');
        cell.dataset.number = n.number;
        cell.dataset.status = n.status;

        if (n.status === 'livre') {
            cell.addEventListener('click', () => toggleSelection(n.number));
        }

        grid.appendChild(cell);
    });
}

function updateStats(numbers) {
    const livres = numbers.filter(n => n.status === 'livre').length;
    const pendentes = numbers.filter(n => n.status === 'pendente').length;
    const pagos = numbers.filter(n => n.status === 'pago').length;

    document.getElementById('stats-livres').textContent = `${livres} livres`;
    document.getElementById('stats-pendentes').textContent = `${pendentes} pendentes`;
    document.getElementById('stats-pagos').textContent = `${pagos} pagos`;
}

// =============================================
// Seleção de números
// =============================================
function toggleSelection(number) {
    const index = selectedNumbers.indexOf(number);

    if (index >= 0) {
        // Desselecionar
        selectedNumbers.splice(index, 1);
    } else {
        // Selecionar
        selectedNumbers.push(number);
    }

    // Atualiza visual da célula clicada
    const cell = document.querySelector(`.number-cell[data-number="${number}"]`);
    if (cell) {
        if (selectedNumbers.includes(number)) {
            cell.className = 'number-cell selecionado';
        } else {
            cell.className = `number-cell ${cell.dataset.status}`;
        }
    }

    updateCheckoutBar();
}

function clearSelection() {
    selectedNumbers = [];
    // Restaura todas as células
    document.querySelectorAll('.number-cell.selecionado').forEach(cell => {
        cell.className = `number-cell ${cell.dataset.status}`;
    });
    updateCheckoutBar();
}

// =============================================
// Barra de Checkout Flutuante
// =============================================
function updateCheckoutBar() {
    const bar = document.getElementById('checkout-bar');
    const count = selectedNumbers.length;

    if (count === 0) {
        bar.classList.remove('active');
        return;
    }

    bar.classList.add('active');

    const total = count * pixValue;
    const numbersStr = selectedNumbers
        .sort((a, b) => a - b)
        .map(n => String(n).padStart(2, '0'))
        .join(', ');

    document.getElementById('checkout-count').textContent = count;
    document.getElementById('checkout-numbers').textContent = numbersStr;
    document.getElementById('checkout-total').textContent = formatCurrency(total);
}

// =============================================
// Modal de Reserva (multi-número)
// =============================================
function openReserveModal() {
    if (selectedNumbers.length === 0) {
        showToast('Selecione pelo menos um número.', true);
        return;
    }

    const count = selectedNumbers.length;
    const total = count * pixValue;
    const sortedNums = selectedNumbers.sort((a, b) => a - b);

    // Atualiza header do modal
    const headerEl = document.getElementById('modal-numbers-display');
    headerEl.innerHTML = sortedNums
        .map(n => `<span class="modal-num-badge">${String(n).padStart(2, '0')}</span>`)
        .join('');

    document.getElementById('modal-summary').textContent =
        `${count} número${count > 1 ? 's' : ''} — Total: ${formatCurrency(total)}`;

    document.getElementById('form-reserve').reset();
    toggleModal('modal-reserve', true);
}

function closeReserveModal() {
    toggleModal('modal-reserve', false);
}

// =============================================
// Enviar Reserva (multi-número)
// =============================================
async function submitReserve(e) {
    e.preventDefault();

    const name = document.getElementById('input-name').value.trim();
    const whatsapp = document.getElementById('input-whatsapp').value.trim();

    if (!name || !whatsapp) {
        showToast('Preencha todos os campos.', true);
        return;
    }

    if (selectedNumbers.length === 0) {
        showToast('Nenhum número selecionado.', true);
        return;
    }

    // Toggle loading
    const btnText = document.querySelector('#btn-submit-reserve .btn-text');
    const btnLoader = document.querySelector('#btn-submit-reserve .btn-loader');
    const btn = document.getElementById('btn-submit-reserve');
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-flex';
    btn.disabled = true;

    try {
        const res = await fetch(`${API}/api/reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numbers: selectedNumbers.sort((a, b) => a - b),
                name,
                whatsapp
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Erro ao reservar.', true);
            return;
        }

        // Fecha modal de reserva
        closeReserveModal();
        clearSelection();

        if (data.pix_qr_base64 && data.pix_code) {
            openPixModal(data);
        } else {
            showToast('Números reservados! Entre em contato para pagar.', false);
            loadNumbers();
        }

    } catch (err) {
        showToast('Erro de conexão. Tente novamente.', true);
        console.error(err);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

// =============================================
// Modal PIX (multi-número)
// =============================================
function openPixModal(data) {
    document.getElementById('pix-qr-image').src = `data:image/png;base64,${data.pix_qr_base64}`;
    document.getElementById('pix-code-text').value = data.pix_code;

    // Mostra números comprados
    const numsStr = data.numbers
        .map(n => String(n).padStart(2, '0'))
        .join(', ');
    document.getElementById('pix-numbers').textContent = numsStr;
    document.getElementById('pix-value').textContent = formatCurrency(data.value);

    // Reset status display
    document.getElementById('pix-status').style.display = 'flex';
    document.getElementById('pix-confirmed').style.display = 'none';
    document.getElementById('pix-expired').style.display = 'none';

    toggleModal('modal-pix', true);

    // Inicia polling para verificar pagamento
    pollingNumbers = data.numbers;
    startPolling(data.numbers[0]);

    // Inicia countdown de expiração
    startCountdown();
}

function closePixModal() {
    toggleModal('modal-pix', false);
    stopPolling();
    stopCountdown();
    pollingNumbers = [];
    loadNumbers();
}

// =============================================
// Polling para verificar pagamento
// =============================================
function startPolling(number) {
    stopPolling();
    pollingInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API}/api/numbers/${number}/status`);
            const data = await res.json();

            if (data.status === 'pago') {
                document.getElementById('pix-status').style.display = 'none';
                document.getElementById('pix-expired').style.display = 'none';
                document.getElementById('pix-confirmed').style.display = 'block';
                stopPolling();
                stopCountdown();
            }
        } catch (err) {
            console.error('Erro no polling:', err);
        }
    }, 5000);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// =============================================
// Countdown de expiração PIX
// =============================================
function startCountdown() {
    stopCountdown();
    let remaining = PIX_TIMEOUT;
    const el = document.getElementById('pix-countdown');
    el.textContent = `${remaining}s`;

    countdownInterval = setInterval(() => {
        remaining--;
        el.textContent = `${remaining}s`;

        if (remaining <= 0) {
            stopCountdown();
            stopPolling();
            // Mostra estado expirado
            document.getElementById('pix-status').style.display = 'none';
            document.getElementById('pix-expired').style.display = 'block';
            // Recarrega a grade após 3s
            setTimeout(() => {
                closePixModal();
            }, 3000);
        }
    }, 1000);
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// =============================================
// Copiar código PIX
// =============================================
function copyPixCode() {
    const code = document.getElementById('pix-code-text').value;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-pix');
        const text = document.getElementById('copy-text');
        btn.classList.add('copied');
        text.textContent = 'Copiado!';
        setTimeout(() => {
            btn.classList.remove('copied');
            text.textContent = 'Copiar';
        }, 2000);
    }).catch(() => {
        const input = document.getElementById('pix-code-text');
        input.select();
        document.execCommand('copy');
        showToast('Código copiado!', false);
    });
}

// =============================================
// Máscara WhatsApp
// =============================================
function maskWhatsApp(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 7) {
        value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
        value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
        value = `(${value}`;
    }

    input.value = value;
}

// =============================================
// Utilitários
// =============================================
function formatCurrency(value) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (show) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// =============================================
// Event Listeners
// =============================================
function setupEventListeners() {
    // Form de reserva
    document.getElementById('form-reserve').addEventListener('submit', submitReserve);

    // Botão finalizar compra (checkout bar)
    document.getElementById('btn-checkout').addEventListener('click', openReserveModal);

    // Limpar seleção
    document.getElementById('btn-clear-selection').addEventListener('click', clearSelection);

    // Fechar modais
    document.getElementById('btn-close-reserve').addEventListener('click', closeReserveModal);
    document.getElementById('btn-close-pix').addEventListener('click', closePixModal);

    // Fechar modal clicando no overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
                stopPolling();
                loadNumbers();
            }
        });
    });

    // Copiar PIX
    document.getElementById('btn-copy-pix').addEventListener('click', copyPixCode);

    // Máscara WhatsApp
    document.getElementById('input-whatsapp').addEventListener('input', function () {
        maskWhatsApp(this);
    });

    // ESC para fechar modais
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                m.classList.remove('active');
                document.body.style.overflow = '';
            });
            stopPolling();
        }
    });
}
