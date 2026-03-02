// =============================================
// WinVerse — Server Principal (PostgreSQL)
// =============================================
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Middleware
// =============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// Variáveis de configuração
// =============================================
const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const PIX_VALUE = parseFloat(process.env.PIX_VALUE || '10');
const PIX_DESC = process.env.PIX_DESCRIPTION || 'Rifa WinVerse - Numero';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const PIX_EXPIRATION_SECONDS = parseInt(process.env.PIX_EXPIRATION_SECONDS || '60');

// =============================================
// Banco de Dados PostgreSQL (pg)
// =============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS numbers (
        number      INTEGER PRIMARY KEY,
        status      TEXT NOT NULL DEFAULT 'livre' CHECK(status IN ('livre','pendente','pago')),
        name        TEXT,
        whatsapp    TEXT,
        payment_id  TEXT,
        pix_qr      TEXT,
        pix_code    TEXT,
        created_at  TIMESTAMPTZ,
        paid_at     TIMESTAMPTZ
      )
    `);

    // Popula 1..100 se a tabela estiver vazia
    const countResult = await client.query('SELECT COUNT(*) AS total FROM numbers');
    const count = parseInt(countResult.rows[0].total);

    if (count === 0) {
      const values = [];
      const placeholders = [];
      for (let i = 1; i <= 100; i++) {
        values.push(i);
        placeholders.push(`($${i})`);
      }
      await client.query(
        `INSERT INTO numbers (number) VALUES ${placeholders.join(', ')}`,
        values
      );
      console.log('✅ 100 números inseridos.');
    }

    console.log('📂 Banco de dados PostgreSQL conectado.');
  } finally {
    client.release();
  }
}

// Helpers assíncronos para queries
async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function dbRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount };
}

// =============================================
// Middleware — HTTP Basic Auth para Admin
// =============================================
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="WinVerse Admin"');
    return res.status(401).json({ error: 'Credenciais necessárias' });
  }

  const base64 = authHeader.split(' ')[1];
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="WinVerse Admin"');
  return res.status(401).json({ error: 'Credenciais inválidas' });
}

// =============================================
// ROTAS PÚBLICAS
// =============================================

// GET /api/config — Retorna configurações públicas (valor, etc.)
app.get('/api/config', (req, res) => {
  res.json({ pix_value: PIX_VALUE });
});

// GET /api/numbers — Retorna todos os 100 números com status
app.get('/api/numbers', async (req, res) => {
  try {
    const numbers = await dbAll('SELECT number, status FROM numbers ORDER BY number');
    res.json(numbers);
  } catch (err) {
    console.error('❌ Erro ao buscar números:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/numbers/:number/status — Status individual (para polling)
app.get('/api/numbers/:number/status', async (req, res) => {
  const num = parseInt(req.params.number);
  if (isNaN(num) || num < 1 || num > 100) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  try {
    const row = await dbGet('SELECT number, status, name FROM numbers WHERE number = $1', [num]);
    res.json(row);
  } catch (err) {
    console.error('❌ Erro ao buscar status:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/reserve — Reservar número(s) e criar pagamento PIX
app.post('/api/reserve', async (req, res) => {
  const { numbers, name, whatsapp } = req.body;

  // Validações
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0 || !name || !whatsapp) {
    return res.status(400).json({ error: 'Campos obrigatórios: numbers (array), name, whatsapp' });
  }

  // Valida cada número
  const nums = numbers.map(n => parseInt(n));
  for (const num of nums) {
    if (isNaN(num) || num < 1 || num > 100) {
      return res.status(400).json({ error: `Número inválido: ${num} (deve ser 1-100)` });
    }
  }

  // Verifica se todos estão livres
  for (const num of nums) {
    const row = await dbGet('SELECT status FROM numbers WHERE number = $1', [num]);
    if (!row || row.status !== 'livre') {
      return res.status(409).json({ error: `O número ${String(num).padStart(2, '0')} já está reservado ou pago` });
    }
  }

  // Calcula valor total
  const totalValue = nums.length * PIX_VALUE;
  const numsStr = nums.map(n => String(n).padStart(2, '0')).join(', ');
  const idempotencyKey = uuidv4();

  try {
    // Cria pagamento PIX no Mercado Pago (valor total)
    const mpResponse = await axios.post(
      'https://api.mercadopago.com/v1/payments',
      {
        transaction_amount: totalValue,
        description: `${PIX_DESC} [${numsStr}]`,
        payment_method_id: 'pix',
        payer: {
          first_name: name,
          last_name: ' ',
          email: `rifa${nums[0]}@winverse.com`
        },
        notification_url: `${BASE_URL}/api/webhook/mercadopago`
      },
      {
        headers: {
          'Authorization': `Bearer ${MP_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        }
      }
    );

    const payment = mpResponse.data;
    const pixQR = payment.point_of_interaction?.transaction_data?.qr_code_base64 || '';
    const pixCode = payment.point_of_interaction?.transaction_data?.qr_code || '';
    const paymentIdStr = String(payment.id);

    // Atualiza TODOS os números no banco: status -> pendente, MESMO payment_id
    for (const num of nums) {
      await dbRun(
        `UPDATE numbers 
         SET status = 'pendente', name = $1, whatsapp = $2, payment_id = $3, 
             pix_qr = $4, pix_code = $5, created_at = NOW()
         WHERE number = $6`,
        [name, whatsapp, paymentIdStr, pixQR, pixCode, num]
      );
    }

    console.log(`🎯 ${nums.length} número(s) reservado(s): [${numsStr}] — Payment ID: ${paymentIdStr} — Total: R$ ${totalValue.toFixed(2)}`);

    res.json({
      success: true,
      numbers: nums,
      payment_id: payment.id,
      pix_qr_base64: pixQR,
      pix_code: pixCode,
      value: totalValue
    });

  } catch (err) {
    console.error('❌ Erro ao criar pagamento:', err.response?.data || err.message);

    // Mesmo com erro, reserva os números como pendente
    for (const num of nums) {
      await dbRun(
        `UPDATE numbers 
         SET status = 'pendente', name = $1, whatsapp = $2, created_at = NOW()
         WHERE number = $3 AND status = 'livre'`,
        [name, whatsapp, num]
      );
    }

    res.status(502).json({
      error: 'Erro ao gerar o PIX. Os números foram reservados — entre em contato com o administrador.',
      details: err.response?.data?.message || err.message,
      numbers: nums
    });
  }
});

// POST /api/webhook/mercadopago — Webhook de notificação
app.post('/api/webhook/mercadopago', async (req, res) => {
  const { action, data, type } = req.body;

  console.log('🔔 Webhook recebido:', JSON.stringify(req.body));

  // Responde 200 imediatamente
  res.sendStatus(200);

  try {
    if (type === 'payment' || action === 'payment.updated' || action === 'payment.created') {
      const paymentId = data?.id;
      if (!paymentId) return;

      // Busca detalhes do pagamento na API do Mercado Pago
      const mpResponse = await axios.get(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { 'Authorization': `Bearer ${MP_TOKEN}` } }
      );

      const payment = mpResponse.data;

      if (payment.status === 'approved') {
        const result = await dbRun(
          `UPDATE numbers 
           SET status = 'pago', paid_at = NOW()
           WHERE payment_id = $1 AND status = 'pendente'`,
          [String(paymentId)]
        );

        if (result.changes > 0) {
          console.log(`✅ Número pago via PIX! Payment ID: ${paymentId}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro ao processar webhook:', err.message);
  }
});

// =============================================
// ROTAS ADMIN (protegidas por Basic Auth)
// =============================================

// GET /api/admin/numbers — Lista todos com detalhes
app.get('/api/admin/numbers', adminAuth, async (req, res) => {
  try {
    const numbers = await dbAll(
      'SELECT number, status, name, whatsapp, payment_id, created_at, paid_at FROM numbers ORDER BY number'
    );
    res.json(numbers);
  } catch (err) {
    console.error('❌ Erro admin/numbers:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/admin/stats — Estatísticas gerais
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const livresRow = await dbGet("SELECT COUNT(*) AS c FROM numbers WHERE status = 'livre'");
    const pendentesRow = await dbGet("SELECT COUNT(*) AS c FROM numbers WHERE status = 'pendente'");
    const pagosRow = await dbGet("SELECT COUNT(*) AS c FROM numbers WHERE status = 'pago'");

    const livres = parseInt(livresRow?.c) || 0;
    const pendentes = parseInt(pendentesRow?.c) || 0;
    const pagos = parseInt(pagosRow?.c) || 0;

    res.json({
      livres,
      pendentes,
      pagos,
      total_arrecadado: pagos * PIX_VALUE
    });
  } catch (err) {
    console.error('❌ Erro admin/stats:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/admin/release/:number — Liberar número manualmente
app.post('/api/admin/release/:number', adminAuth, async (req, res) => {
  const num = parseInt(req.params.number);
  if (isNaN(num) || num < 1 || num > 100) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  await dbRun(
    `UPDATE numbers 
     SET status = 'livre', name = NULL, whatsapp = NULL, 
         payment_id = NULL, pix_qr = NULL, pix_code = NULL,
         created_at = NULL, paid_at = NULL
     WHERE number = $1`,
    [num]
  );

  console.log(`🔄 Número ${num} liberado manualmente.`);
  res.json({ success: true, message: `Número ${num} liberado` });
});

// POST /api/admin/confirm/:number — Confirmar pagamento manualmente
app.post('/api/admin/confirm/:number', adminAuth, async (req, res) => {
  const num = parseInt(req.params.number);
  if (isNaN(num) || num < 1 || num > 100) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const row = await dbGet('SELECT status FROM numbers WHERE number = $1', [num]);
  if (!row || row.status !== 'pendente') {
    return res.status(400).json({ error: 'Só é possível confirmar números pendentes' });
  }

  await dbRun(
    "UPDATE numbers SET status = 'pago', paid_at = NOW() WHERE number = $1",
    [num]
  );

  console.log(`✅ Número ${num} confirmado manualmente.`);
  res.json({ success: true, message: `Número ${num} confirmado como pago` });
});

// POST /api/admin/update/:number — Atualizar número (status, nome, whatsapp)
app.post('/api/admin/update/:number', adminAuth, async (req, res) => {
  const num = parseInt(req.params.number);
  if (isNaN(num) || num < 1 || num > 100) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const { status, name, whatsapp } = req.body;

  if (!['livre', 'pendente', 'pago'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use: livre, pendente, pago' });
  }

  if (status === 'livre') {
    // Liberar: limpa todos os dados
    await dbRun(
      `UPDATE numbers 
       SET status = 'livre', name = NULL, whatsapp = NULL, 
           payment_id = NULL, pix_qr = NULL, pix_code = NULL,
           created_at = NULL, paid_at = NULL
       WHERE number = $1`,
      [num]
    );
  } else if (status === 'pago') {
    await dbRun(
      `UPDATE numbers 
       SET status = 'pago', name = $1, whatsapp = $2,
           created_at = COALESCE(created_at, NOW()),
           paid_at = COALESCE(paid_at, NOW())
       WHERE number = $3`,
      [name || null, whatsapp || null, num]
    );
  } else {
    // pendente
    await dbRun(
      `UPDATE numbers 
       SET status = 'pendente', name = $1, whatsapp = $2,
           created_at = COALESCE(created_at, NOW()),
           paid_at = NULL
       WHERE number = $3`,
      [name || null, whatsapp || null, num]
    );
  }

  console.log(`📝 Número ${num} atualizado: status=${status}, name=${name}, whatsapp=${whatsapp}`);
  res.json({ success: true, message: `Número ${num} atualizado` });
});

// =============================================
// Fallback — Serve o index.html para rotas não-API
// =============================================
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// =============================================
// Iniciar servidor
// =============================================
async function start() {
  await initDB();

  // Limpeza automática de reservas expiradas
  startExpirationCleanup();

  app.listen(PORT, () => {
    console.log('');
    console.log('🎰 =============================================');
    console.log(`🎰  WinVerse — Site de Rifas`);
    console.log(`🎰  Local:      http://localhost:${PORT}`);
    console.log(`🎰  Admin:      http://localhost:${PORT}/admin.html`);
    console.log(`🎰  Usuário:    ${ADMIN_USER} | Senha: ${ADMIN_PASS}`);
    console.log('🎰 =============================================');
    console.log('');
  });
}

start().catch(err => {
  console.error('❌ Falha ao iniciar:', err);
  process.exit(1);
});

// =============================================
// Limpeza automática de reservas expiradas
// =============================================
async function cleanExpiredReservations() {
  try {
    const expired = await dbAll(
      `SELECT number FROM numbers 
       WHERE status = 'pendente' 
         AND created_at IS NOT NULL 
         AND EXTRACT(EPOCH FROM (NOW() - created_at)) > $1`,
      [PIX_EXPIRATION_SECONDS]
    );

    if (expired.length > 0) {
      const nums = expired.map(r => r.number);
      for (const num of nums) {
        await dbRun(
          `UPDATE numbers 
           SET status = 'livre', name = NULL, whatsapp = NULL, 
               payment_id = NULL, pix_qr = NULL, pix_code = NULL,
               created_at = NULL, paid_at = NULL
           WHERE number = $1 AND status = 'pendente'`,
          [num]
        );
      }
      const numsStr = nums.map(n => String(n).padStart(2, '0')).join(', ');
      console.log(`⏰ ${nums.length} número(s) expirado(s) liberado(s): [${numsStr}]`);
    }
  } catch (err) {
    console.error('❌ Erro na limpeza de expirados:', err.message);
  }
}

function startExpirationCleanup() {
  // Roda a cada 15 segundos
  setInterval(cleanExpiredReservations, 15000);
  console.log(`⏰ Limpeza automática ativa: pendentes expiram em ${PIX_EXPIRATION_SECONDS}s`);
}
