import('node-fetch').then(({ default: fetch }) => {
  const sqlite3 = require('sqlite3').verbose();

  // 打开数据库连接
  const db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
      return;
    }
    console.log('Database connection successfully established.');

    // 检查klines表是否存在
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='klines'", (err, row) => {
      if (err) {
        console.error('Error checking for klines table', err.message);
        return;
      }
      if (!row) {
        console.log('Table does not exist, creating table...');
        const createTableSQL = `
          CREATE TABLE klines (
              startTime INTEGER PRIMARY KEY,
              date TEXT,
              lastPrice TEXT
          );
        `;

        // 创建表
        db.exec(createTableSQL, (err) => {
          if (err) {
            console.error('Error creating table', err.message);
            return;
          }
          console.log('Table created successfully.');
        });
      } else {
        console.log('Table already exists, skipping creation.');
      }
    });
  });

  const limit = 5;
  const url = `https://api.binance.com/api/v3/klines?symbol=CKBUSDT&interval=1d&limit=${limit}`;

  // 获取数据并插入
  fetch(url)
    .then(response => response.json())
    .then(data => {
      const insertQuery = `INSERT OR REPLACE INTO klines (startTime, date, lastPrice) VALUES (?, ?, ?)`;

      // 迭代数据并插入到数据库中
      data.forEach(kline => {
        const startTime = kline[0];
        const date = new Date(startTime).toISOString().slice(0, 10); // 只获取日期部分 YYYY-MM-DD
        const lastPrice = kline[4].toString(); // 保留数字的原始字符串格式

        db.run(insertQuery, [startTime, date, lastPrice], (err) => {
          if (err) {
            console.error('Error inserting/updating data', err.message);
            return;
          }
          console.log(`Data inserted/updated successfully: ${startTime}, ${date}, ${lastPrice}`);
        });
      });
    })
    .catch(error => {
      console.error('Error fetching data from Binance API', error);
    })
    .finally(() => {
      db.close(() => {
        console.log('Database connection closed.');
      });
    });
}).catch(error => {
  console.error('Error loading node-fetch module', error);
});
