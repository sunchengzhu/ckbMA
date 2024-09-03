const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const chokidar = require('chokidar');
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
  console.log(`File ${path} has been changed. Reinitializing database connection...`);
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
  db.get(`SELECT COUNT(*) AS count FROM klines WHERE startTime BETWEEN ? AND ?`, [minTime, maxTime], (err, result) => {
    if (err) {
      console.error('Error querying count', err.message);
      return;
    }
    const count = result.count;
    const offset = count - 1;

    db.get(`SELECT startTime FROM klines WHERE startTime <= ? ORDER BY startTime DESC LIMIT 1 OFFSET ?`, [minTime, offset], (err, minRow) => {
      if (err) {
        console.error('Error querying minimum startTime', err.message);
        return;
      }
      const adjustedMinTime = minRow ? minRow.startTime : minTime;

      // 获取指定范围加上必要的历史数据
      const query = `
          SELECT date, lastPrice
          FROM klines
          WHERE startTime BETWEEN ? AND ?
          ORDER BY startTime ASC
        `;
      db.all(query, [adjustedMinTime, maxTime], (err, rows) => {
        if (err) {
          console.error('Error querying data', err.message);
          return;
        }
        if (rows.length > offset) {
          // 计算每个点的移动平均值
          let sum = 0;
          let movingAveragesSum = 0;
          let movingAveragesCount = 0;
          let details = [];

          const prices = rows.map(row => parseFloat(row.lastPrice));
          for (let i = offset; i < prices.length; i++) {
            sum = prices.slice(i - offset, i + 1).reduce((a, b) => a + b, 0);
            const movingAverage = sum / (offset + 1);
            movingAveragesSum += movingAverage; // 累加每个移动平均值
            movingAveragesCount++;
            // console.log(`${rows[i].date} MA(${offset + 1}): ${movingAverage.toFixed(6)}`);
            details.push({ date: rows[i].date, ma: `MA(${offset + 1}): ${movingAverage.toFixed(6)}` });
          }

          if (movingAveragesCount > 0) {
            const overallMovingAverage = movingAveragesSum / movingAveragesCount;
            // console.log(`Overall Average of MAs: ${overallMovingAverage.toFixed(6)}`);
            callback(null, { overallMA: overallMovingAverage.toFixed(6), dailyMA: details });
          }
        } else {
          console.log('Not enough data available for the specified range.');
        }
      });
    });
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

