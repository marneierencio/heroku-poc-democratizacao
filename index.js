const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Middleware para processar JSON
app.use(bodyParser.json());

// Endpoint para receber dados
app.post('/receive-data', (req, res) => {
    console.log('Dados recebidos:', req.body);
    res.status(200).send({ message: 'Dados recebidos com sucesso!' });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
