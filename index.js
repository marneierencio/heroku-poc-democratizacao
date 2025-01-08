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

// Função para atualizar ou criar o arquivo CSV
async function updateCSVFile(objectName, records) {
    const filePath = path.join(CSV_FOLDER, `${objectName}.csv`);
    let existingHeaders = [];
    let existingData = [];

    // Ler o arquivo existente, se ele já existir
    if (fs.existsSync(filePath)) {
        const csvData = fs.readFileSync(filePath, 'utf8').split('\n');
        existingHeaders = csvData[0].split(',');
        existingData = csvData.slice(1).filter((line) => line.trim());
    }

    // Montar o novo conjunto de cabeçalhos
    const newHeaders = new Set(existingHeaders);

    records.forEach((record) => {
        const data = JSON.parse(record.data || '{}');
        Object.keys(data).forEach((key) => {
            newHeaders.add(key);
        });
    });

    const allHeaders = Array.from(newHeaders);

    // Atualizar linhas existentes para incluir novas colunas
    const updatedData = existingData.map((line) => {
        const values = line.split(',');
        const row = {};
        existingHeaders.forEach((header, index) => {
            row[header] = values[index] || '';
        });

        // Adicionar colunas ausentes com valores em branco
        allHeaders.forEach((header) => {
            if (!row[header]) {
                row[header] = '';
            }
        });

        return allHeaders.map((header) => row[header]).join(',');
    });

    // Adicionar os novos registros
    records.forEach((record) => {
        const row = {};
        allHeaders.forEach((header) => {
            if (header === 'recordId') row[header] = record.recordId || '';
            else if (header === 'parentRecordId') row[header] = record.parentRecordId || '';
            else if (header === 'dateTimeRecord') row[header] = record.dateTimeRecord || '';
            else {
                const data = JSON.parse(record.data || '{}');
                row[header] = data[header] || '';
            }
        });

        updatedData.push(allHeaders.map((header) => row[header]).join(','));
    });

    // Ordenar os registros pelo campo `dateTimeRecord`
    updatedData.sort((a, b) => {
        const dateA = new Date(a.split(',')[allHeaders.indexOf('dateTimeRecord')]);
        const dateB = new Date(b.split(',')[allHeaders.indexOf('dateTimeRecord')]);
        return dateA - dateB;
    });

    // Salvar no arquivo CSV
    const csvContent = [allHeaders.join(','), ...updatedData].join('\n');
    fs.writeFileSync(filePath, csvContent);
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

// Endpoint para receber os dados do Salesforce
app.post('/receive-data', async (req, res) => {
    const records = req.body;

    if (!Array.isArray(records)) {
        return res.status(400).send('O payload deve ser um array.');
    }

    // Organizar os registros por `objectName`
    const groupedRecords = records.reduce((acc, record) => {
        const objectName = record.objectName;
        if (!acc[objectName]) {
            acc[objectName] = [];
        }
        acc[objectName].push(record);
        return acc;
    }, {});

    try {
        // Atualizar os arquivos CSV para cada objeto
        for (const [objectName, objectRecords] of Object.entries(groupedRecords)) {
            await updateCSVFile(objectName, objectRecords);
        }

        res.status(200).send('Dados processados com sucesso.');
    } catch (error) {
        console.error('Erro ao processar os dados:', error);
        res.status(500).send('Erro ao processar os dados.');
    }
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
