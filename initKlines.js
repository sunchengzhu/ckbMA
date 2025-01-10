import('node-fetch').then(({ default: fetch }) => {
  const sqlite3 = require('sqlite3').verbose();

  async function handleDatabaseOperations() {
    const db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error opening database', err.message);
        return;
      }
      console.log('Database connection successfully established.');
    });

    try {
      // 确保表存在
      await new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='klines'", (err, row) => {
          if (err) {
            console.error('Error checking for klines table', err.message);
            reject(err);
          } else if (!row) {
            console.log('Table does not exist, creating table...');
            const createTableSQL = `
              CREATE TABLE klines (
                startTime INTEGER PRIMARY KEY,
                date TEXT,
                lastPrice TEXT,
                ckb INTEGER,
                usdt TEXT
              );
            `;
            db.exec(createTableSQL, (err) => {
              if (err) {
                console.error('Error creating table', err.message);
                reject(err);
              } else {
                console.log('Table created successfully.');
                resolve();
              }
            });
          } else {
            console.log('Table already exists, skipping creation.');
            resolve();
          }
        });
      });

      // 拉取数据
      const limit = 5;
      const url = `https://api.binance.com/api/v3/klines?symbol=CKBUSDT&interval=1d&limit=${limit}`;
      const response = await fetch(url);
      const data = await response.json();

      // 插入数据
      const insertQuery = `INSERT OR REPLACE INTO klines (startTime, date, lastPrice, ckb, usdt) VALUES (?, ?, ?, ?, ?)`;
      for (const kline of data) {
        const startTime = kline[0];
        const date = new Date(startTime).toISOString().slice(0, 10);
        const lastPrice = kline[4].replace(/00$/, '');
        const ckb = parseInt(kline[5]);
        const usdt = kline[7].replace(/00$/, '');

        await new Promise((resolve, reject) => {
          db.run(insertQuery, [startTime, date, lastPrice, ckb, usdt], (err) => {
            if (err) {
              console.error('Error inserting/updating data', err.message);
              reject(err);
            } else {
              console.log(`Data inserted/updated successfully: ${startTime}, ${date}, ${lastPrice}, ${ckb}, ${usdt}`);
              resolve();
            }
          });
        });
      }

      // 删除今天的数据
      const today = new Date().toISOString().slice(0, 10);
      const deleteQuery = `DELETE FROM klines WHERE date = ?`;
      await new Promise((resolve, reject) => {
        db.run(deleteQuery, today, (err) => {
          if (err) {
            console.error('Error deleting today\'s data', err.message);
            reject(err);
          } else {
            console.log(`Today's data deleted successfully`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Error during database operations', error);
    } finally {
      db.close(() => {
        console.log('Database connection closed.');
      });
    }
  }

  handleDatabaseOperations();
}).catch(error => {
  console.error('Error loading node-fetch module', error);
});
