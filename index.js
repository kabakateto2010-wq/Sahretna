const express = require('express');
const path = require('path');
const app = express();

// تقديم الملفات الثابتة (HTML, CSS, JS) فائقة السرعة
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
