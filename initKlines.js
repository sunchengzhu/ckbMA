/**
 * CKB K线数据初始化脚本
 * 
 * 功能：
 * 1. 从 Binance API 获取 CKB/USDT 的最新 K线数据（日线）
 * 2. 解析并存储到 SQLite 数据库
 * 3. 自动删除当天的不完整数据（因为当天交易尚未结束）
 * 
 * 使用场景：
 * - 首次运行：创建数据库表并拉取初始数据
 * - 定时任务：定期更新最新的交易数据（建议每日运行）
 * 
 * K线数据格式（Binance API 返回的数组）：
 * [
 *   1499040000000,      // [0] 开盘时间 (startTime)
 *   "0.01634000",       // [1] 开盘价
 *   "0.80000000",       // [2] 最高价
 *   "0.01575800",       // [3] 最低价
 *   "0.01577100",       // [4] 收盘价 (lastPrice) ← 用于计算 MA
 *   "148976.11427815",  // [5] 成交量 (ckb)
 *   1499644799999,      // [6] 收盘时间
 *   "2434.19055334",    // [7] 成交额 (usdt)
 *   308,                // [8] 成交笔数
 *   "1756.87402397",    // [9] 主动买入成交量
 *   "28.46694368",      // [10] 主动买入成交额
 *   "17928899.62484339" // [11] 忽略
 * ]
 */

import('node-fetch').then(({ default: fetch }) => {
  const sqlite3 = require('sqlite3').verbose();

  async function handleDatabaseOperations() {
    // 打开数据库连接（读写模式）
    const db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error opening database', err.message);
        return;
      }
      console.log('Database connection successfully established.');
    });

    try {
      // ============================================
      // 第一步：确保数据库表存在
      // ============================================
      await new Promise((resolve, reject) => {
        // 检查 klines 表是否已存在
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='klines'", (err, row) => {
          if (err) {
            console.error('Error checking for klines table', err.message);
            reject(err);
          } else if (!row) {
            // 表不存在，创建新表
            console.log('Table does not exist, creating table...');
            const createTableSQL = `
              CREATE TABLE klines (
                startTime INTEGER PRIMARY KEY,  -- K线开始时间戳（唯一标识）
                date TEXT,                       -- 日期 (YYYY-MM-DD 格式)
                lastPrice TEXT,                  -- 收盘价（字符串，保留精度）
                ckb INTEGER,                     -- 成交量（CKB 数量）
                usdt TEXT                        -- 成交额（USDT 金额）
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
            // 表已存在，跳过创建
            console.log('Table already exists, skipping creation.');
            resolve();
          }
        });
      });

      // ============================================
      // 第二步：从 Binance API 获取最新的 K线数据
      // ============================================
      const limit = 5;  // 拉取最近 5 天的数据
      const url = `https://api.binance.com/api/v3/klines?symbol=CKBUSDT&interval=1d&limit=${limit}`;
      
      console.log(`Fetching latest ${limit} days of CKB/USDT kline data from Binance...`);
      const response = await fetch(url);
      const data = await response.json();

      // ============================================
      // 第三步：解析并插入/更新数据到数据库
      // ============================================
      const insertQuery = `INSERT OR REPLACE INTO klines (startTime, date, lastPrice, ckb, usdt) VALUES (?, ?, ?, ?, ?)`;
      
      for (const kline of data) {
        // 解析 K线数据
        const startTime = kline[0];                        // K线开始时间戳
        const date = new Date(startTime).toISOString().slice(0, 10);  // 转换为日期字符串 (YYYY-MM-DD)
        const lastPrice = kline[4].replace(/00$/, '');     // 收盘价（移除末尾的 '00'）
        const ckb = parseInt(kline[5]);                    // 成交量（转为整数）
        const usdt = kline[7].replace(/00$/, '');          // 成交额（移除末尾的 '00'）

        // 插入或替换数据（如果 startTime 已存在，则更新）
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

      // ============================================
      // 第四步：删除当天的不完整数据
      // ============================================
      // 原因：当天的交易尚未结束，数据不完整，不应用于历史 MA 计算
      // 每次运行时自动清理，确保历史数据的准确性
      const today = new Date().toISOString().slice(0, 10);  // 获取今天的日期 (YYYY-MM-DD)
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
      // 关闭数据库连接
      db.close(() => {
        console.log('Database connection closed.');
      });
    }
  }

  // 执行数据库操作
  handleDatabaseOperations();
}).catch(error => {
  console.error('Error loading node-fetch module', error);
});
