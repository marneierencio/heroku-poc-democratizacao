const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const { create } = require('express-handlebars');

// Configuração do servidor
const app = express();
app.use(bodyParser.json());

// Configuração do Handlebars
app.engine('.hbs', create({ extname: '.hbs' }).engine);
app.set('view engine', '.hbs');

// Pasta onde os arquivos CSV serão armazenados
const CSV_FOLDER = path.join(__dirname, 'csv_files');

// Cria a pasta se não existir
fs.ensureDirSync(CSV_FOLDER);

// Helper para salvar registros em CSV
async function saveToCSV(data) {
    const objectName = data.objectName;
    const csvFilePath = path.join(CSV_FOLDER, `${objectName}.csv`);

    const records = data.records; // Assumindo que `records` contém uma lista de objetos
    if (!records || records.length === 0) {
        return; // Nada a salvar
    }

    // Identifica os campos presentes nos novos registros
    const newFields = Object.keys(records[0]);

    // Verifica se o arquivo CSV já existe
    let existingHeaders = [];
    if (fs.existsSync(csvFilePath)) {
        const fileContent = fs.readFileSync(csvFilePath, 'utf8');
        existingHeaders = fileContent.split('\n')[0].split(',');
    }

    // Atualiza os cabeçalhos (se necessário)
    const allHeaders = Array.from(new Set([...existingHeaders, ...newFields]));

    // Lê os registros existentes, se o arquivo já existir
    let existingRecords = [];
    if (existingHeaders.length > 0) {
        const lines = fs.readFileSync(csvFilePath, 'utf8').split('\n');
        lines.slice(1).forEach((line) => {
            if (line.trim()) {
                const values = line.split(',');
                const record = {};
                existingHeaders.forEach((header, index) => {
                    record[header] = values[index] || '';
                });
                existingRecords.push(record);
            }
        });
    }

    // Concatena os novos registros com os existentes e ordena por `dateTimeRecord`
    const allRecords = [...existingRecords, ...records].sort(
        (a, b) => new Date(a.dateTimeRecord) - new Date(b.dateTimeRecord)
    );

    // Adiciona marcadores para campos faltantes nos registros existentes
    const formattedRecords = allRecords.map((record) => {
        const formattedRecord = {};
        allHeaders.forEach((header) => {
            formattedRecord[header] = record[header] || ''; // Preenche com string vazia se faltar o campo
        });
        return formattedRecord;
    });

    // Salva no CSV
    const csvContent =
        allHeaders.join(',') +
        '\n' +
        formattedRecords
            .map((record) =>
                allHeaders.map((header) => JSON.stringify(record[header] || '')).join(',')
            )
            .join('\n');

    fs.writeFileSync(csvFilePath, csvContent, 'utf8');
}

// Página inicial
app.get('/', async (req, res) => {
    const files = await fs.readdir(CSV_FOLDER);
    const objects = files.map((file) => ({
        name: path.basename(file, '.csv'),
        downloadLink: `/download/${file}`,
        viewLink: `/view/${file}`,
    }));

    res.render('home', { objects });
});

// Download do arquivo CSV
app.get('/download/:fileName', (req, res) => {
    const filePath = path.join(CSV_FOLDER, req.params.fileName);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('Arquivo não encontrado.');
    }
});

// Visualização do arquivo em formato de tabela
app.get('/view/:fileName', async (req, res) => {
    const filePath = path.join(CSV_FOLDER, req.params.fileName);
    if (fs.existsSync(filePath)) {
        const csvData = fs.readFileSync(filePath, 'utf8');
        const rows = csvData.split('\n').map((line) => line.split(','));
        const headers = rows[0];
        const data = rows.slice(1).filter((row) => row.length > 1); // Remove linhas vazias

        res.render('view', { fileName: req.params.fileName, headers, data });
    } else {
        res.status(404).send('Arquivo não encontrado.');
    }
});

// Endpoint para receber dados
app.post('/receive-data', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.objectName || !payload.records) {
            return res.status(400).send({ error: 'Payload inválido.' });
        }

        await saveToCSV(payload);

        res.status(200).send({ message: 'Dados salvos com sucesso.' });
    } catch (err) {
        console.error('Erro ao salvar dados:', err);
        res.status(500).send({ error: 'Erro interno ao processar os dados.' });
    }
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
