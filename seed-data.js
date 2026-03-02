// Seed script — popula o banco de dados com os dados da planilha
// Uso: node seed-data.js                    (servidor local)
// Uso: BASE_URL=https://... node seed-data.js (servidor remoto no Render)

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('ginka:ginka123').toString('base64');

const data = [
    // [número, nome, status]
    [1, 'Merilin', 'pago'],
    [2, null, 'livre'],
    [3, 'Ana mor', 'pago'],
    [4, null, 'livre'],
    [5, 'Patrícia', 'pago'],
    [6, null, 'livre'],
    [7, 'Samuel', 'pago'],
    [8, null, 'livre'],
    [9, 'Nicks', 'pago'],
    [10, null, 'livre'],
    [11, 'Suselen', 'pago'],
    [12, 'Alessandra', 'pago'],
    [13, 'Ghislaine', 'pago'],
    [14, 'Isabela', 'pago'],
    [15, 'Camila Marcolino', 'pago'],
    [16, null, 'livre'],
    [17, 'Adriana Maximo', 'pago'],
    [18, null, 'livre'],
    [19, 'Merilin', 'pago'],
    [20, 'Cristian pizzetti', 'pago'],
    [21, 'Ricardo', 'pago'],
    [22, 'Maria Paula', 'pago'],
    [23, 'Cristian pizzetti', 'pago'],
    [24, 'Lucy', 'pago'],
    [25, null, 'livre'],
    [26, null, 'livre'],
    [27, 'Moyses', 'pago'],
    [28, 'Camila Marcolino', 'pago'],
    [29, null, 'livre'],
    [30, 'Tio Toddy', 'pago'],
    [31, null, 'livre'],
    [32, null, 'livre'],
    [33, 'Ricardo', 'pago'],
    [34, null, 'livre'],
    [35, 'Ana mor', 'pago'],
    [36, 'Mauricio', 'pago'],
    [37, 'Mauricio', 'pago'],
    [38, 'Mauricio', 'pago'],
    [39, 'Mauricio', 'pago'],
    [40, 'Mauricio', 'pago'],
    [41, null, 'livre'],
    [42, 'Ana mor', 'pago'],
    [43, null, 'livre'],
    [44, null, 'livre'],
    [45, null, 'livre'],
    [46, 'Yaya', 'pago'],
    [47, null, 'livre'],
    [48, null, 'livre'],
    [49, 'Ana mor', 'pago'],
    [50, null, 'livre'],
    [51, 'Ricardo', 'pago'],
    [52, 'Matheus Primo', 'pago'],
    [53, null, 'livre'],
    [54, null, 'livre'],
    [55, 'Donatto', 'pago'],
    [56, 'Marlene', 'pago'],
    [57, null, 'livre'],
    [58, null, 'livre'],
    [59, 'Ana mor', 'pago'],
    [60, null, 'livre'],
    [61, null, 'livre'],
    [62, 'Douglas', 'pago'],
    [63, null, 'livre'],
    [64, null, 'livre'],
    [65, null, 'livre'],
    [66, 'Merilin', 'pago'],
    [67, 'Moyses', 'pago'],
    [68, null, 'livre'],
    [69, 'Ghislaine', 'pago'],
    [70, null, 'livre'],
    [71, null, 'livre'],
    [72, 'João Victor', 'pago'],
    [73, 'Mauricio', 'pago'],
    [74, 'Mauricio', 'pago'],
    [75, 'Ana mor', 'pago'],
    [76, 'Mauricio', 'pago'],
    [77, 'Riquinho', 'pago'],
    [78, null, 'livre'],
    [79, null, 'livre'],
    [80, null, 'livre'],
    [81, null, 'livre'],
    [82, null, 'livre'],
    [83, 'Ana mor', 'pago'],
    [84, null, 'livre'],
    [85, null, 'livre'],
    [86, 'Merilin', 'pago'],
    [87, null, 'livre'],
    [88, null, 'livre'],
    [89, 'Ana mor', 'pago'],
    [90, null, 'livre'],
    [91, null, 'livre'],
    [92, null, 'livre'],
    [93, null, 'livre'],
    [94, null, 'livre'],
    [95, 'Moyses', 'pago'],
    [96, null, 'livre'],
    [97, null, 'livre'],
    [98, 'João Victor', 'pago'],
    [99, null, 'livre'],
    [100, 'Merilin', 'pago'],
];

async function seed() {
    let pagos = 0;
    let livres = 0;
    let errors = 0;

    for (const [num, name, status] of data) {
        try {
            const res = await fetch(`${BASE}/api/admin/update/${num}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': AUTH
                },
                body: JSON.stringify({ status, name: name || '', whatsapp: '' })
            });

            if (res.ok) {
                if (status === 'pago') pagos++;
                else livres++;
            } else {
                const err = await res.json();
                console.error(`❌ Número ${num}: ${err.error}`);
                errors++;
            }
        } catch (err) {
            console.error(`❌ Número ${num}: ${err.message}`);
            errors++;
        }
    }

    console.log('');
    console.log('✅ ========================================');
    console.log(`✅  Seed completo!`);
    console.log(`✅  Pagos:  ${pagos}`);
    console.log(`✅  Livres: ${livres}`);
    console.log(`✅  Erros:  ${errors}`);
    console.log('✅ ========================================');
}

seed();
