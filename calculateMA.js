const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const chokidar = require('chokidar');
const moment = require('moment-timezone');
const app = express();
app.use(cors());  // Enable CORS
app.use(express.json());
const PORT = 3000;

let db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    return;
  }
  console.log('Database connection successfully established.');
});

// 使用 chokidar 监听数据库文件变化
const watcher = chokidar.watch('./price.db', {
  ignored: /(^|[\/\\])\../, // 忽略点文件
  persistent: true
});

watcher.on('change', path => {
  console.log(`${timestamp()} File ${path} has been changed. Reinitializing database connection...`);
  // 关闭旧的数据库连接
  db.close((err) => {
    if (err) {
      console.error('Error closing old database connection:', err.message);
    } else {
      console.log('Old database connection successfully closed.');
    }
    // 初始化新的数据库连接
    db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error reinitializing database', err.message);
        return;
      }
      console.log('Database connection successfully reestablished.');
    });
  });
});

// RPC接口处理POST请求
app.post('/calculateMA', (req, res) => {
  const { startTime1, startTime2 } = req.body;
  if (!startTime1 || !startTime2) {
    return res.status(400).send({ error: 'Both startTime1 and startTime2 are required.' });
  }

  calculateMovingAverages(startTime1, startTime2, (error, result) => {
    if (error) {
      return res.status(500).send({ error: error.message });
    }
    res.send(result);
  });
});

function calculateMovingAverages(startTime1, startTime2, callback) {
  const minTime = Math.min(startTime1, startTime2);
  const maxTime = Math.max(startTime1, startTime2);

  // 直接查询指定范围内的每天的 lastPrice
  const query = `
        SELECT date, lastPrice, ckb, usdt
        FROM klines
        WHERE startTime BETWEEN ? AND ?
        ORDER BY startTime ASC
    `;
  db.all(query, [minTime, maxTime], (err, rows) => {
    if (err) {
      console.error('Error querying data', err.message);
      return callback(err);
    }
    if (rows.length > 0) {
      // 计算所有 lastPrice 的平均值作为 MA
      const prices = rows.map(row => parseFloat(row.lastPrice));
      const sum = prices.reduce((acc, price) => acc + price, 0);
      const MA = sum / prices.length; // 平均值

      // 创建 dailyLastPrice 列表
      const dailyLastPrice = rows.map(row => ({
        date: row.date,
        lastPrice: row.lastPrice,
        ckb: row.ckb,
        usdt: row.usdt
      }));

      // 调用回调函数返回结果，包括天数
      callback(null, { MA: MA.toFixed(6), dailyLastPrice: dailyLastPrice });
    } else {
      console.log('Not enough data available for the specified range.');
      callback(new Error('Not enough data'));
    }
  });
}


function timestamp() {
  return moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

