/**
 * CKB 移动平均价格计算服务器
 * 
 * 功能：
 * 1. 提供 REST API 接口计算指定时间范围的移动平均价格（MA）
 * 2. 监听数据库文件变化，自动重新建立连接
 * 3. 查询 SQLite 数据库中的历史 K线数据
 * 
 * API 端点：
 * - POST /calculateMA: 计算移动平均价格
 * 
 * 依赖：
 * - Express: Web 框架
 * - SQLite3: 数据库
 * - Chokidar: 文件监听
 * - Moment-timezone: 时区处理
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const chokidar = require('chokidar');
const moment = require('moment-timezone');
const app = express();
app.use(cors());  // 启用跨域资源共享（CORS），允许前端跨域访问
app.use(express.json());  // 解析 JSON 格式的请求体
const PORT = 3000;  // 服务器监听端口

// 初始化数据库连接
// 使用 let 声明，以便在文件变化时重新初始化
let db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
    return;
  }
  console.log('Database connection successfully established.');
});

/**
 * 使用 chokidar 监听数据库文件变化
 * 
 * 为什么需要监听？
 * - 当 initKlines.js 更新数据库时，需要重新建立连接以获取最新数据
 * - SQLite 在文件被修改后可能需要重新读取
 * 
 * 工作流程：
 * 1. 检测到 price.db 文件变化
 * 2. 关闭旧的数据库连接
 * 3. 创建新的数据库连接
 */
const watcher = chokidar.watch('./price.db', {
  ignored: /(^|[\/\\])\../, // 忽略点文件（如 .DS_Store）
  persistent: true  // 保持监听进程持续运行
});

watcher.on('change', path => {
  console.log(`${timestamp()} File ${path} has been changed. Reinitializing database connection...`);
  // 关闭旧的数据库连接，释放资源
  db.close((err) => {
    if (err) {
      console.error('Error closing old database connection:', err.message);
    } else {
      console.log('Old database connection successfully closed.');
    }
    // 创建新的数据库连接，读取最新数据
    db = new sqlite3.Database('./price.db', sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error reinitializing database', err.message);
        return;
      }
      console.log('Database connection successfully reestablished.');
    });
  });
});

/**
 * API 端点：计算移动平均价格
 * 
 * POST /calculateMA
 * 
 * 请求体参数：
 * - startTime1: 开始时间戳（毫秒）
 * - startTime2: 结束时间戳（毫秒）
 * 
 * 返回：
 * - MA: 移动平均价格（6位小数）
 * - sum: 收盘价总和
 * - days: 天数
 * - dailyLastPrice: 每日价格详情数组
 */
app.post('/calculateMA', (req, res) => {
  const { startTime1, startTime2 } = req.body;
  
  // 验证参数
  if (!startTime1 || !startTime2) {
    return res.status(400).send({ error: 'Both startTime1 and startTime2 are required.' });
  }

  // 调用计算函数
  calculateMovingAverages(startTime1, startTime2, (error, result) => {
    if (error) {
      return res.status(500).send({ error: error.message });
    }
    res.send(result);
  });
});

/**
 * 计算移动平均价格
 * 
 * 算法逻辑：
 * 1. 从数据库查询指定时间范围内的所有每日收盘价
 * 2. 计算收盘价的算术平均值作为 MA
 * 3. 返回 MA 值、总和、天数及每日详细数据
 * 
 * @param {number} startTime1 - 开始时间戳
 * @param {number} startTime2 - 结束时间戳
 * @param {function} callback - 回调函数(error, result)
 */
function calculateMovingAverages(startTime1, startTime2, callback) {
  // 确保 minTime 和 maxTime 顺序正确（支持用户任意顺序输入）
  const minTime = Math.min(startTime1, startTime2);
  const maxTime = Math.max(startTime1, startTime2);
  const days = getDaysBetweenTimestamps(minTime, maxTime);

  // 查询指定时间范围内的所有 K线数据
  // 按 startTime 升序排列，确保数据按时间顺序
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
      // 提取所有收盘价并转换为浮点数
      const prices = rows.map(row => parseFloat(row.lastPrice));
      
      // 计算收盘价总和
      const sum = prices.reduce((acc, price) => acc + price, 0);
      
      // 计算移动平均价格：MA = 总收盘价 / 天数
      const MA = sum / prices.length;

      // 构造每日价格详情数组，包含日期、收盘价、成交量、成交额
      const dailyLastPrice = rows.map(row => ({
        date: row.date,           // 日期（YYYY-MM-DD）
        lastPrice: row.lastPrice, // 收盘价
        ckb: row.ckb,            // 成交量（CKB）
        usdt: row.usdt           // 成交额（USDT）
      }));

      // 返回计算结果
      callback(null, { 
        MA: MA.toFixed(6),           // MA 价格（保留6位小数）
        sum: sum.toFixed(6),         // 收盘价总和
        days: days,                  // 计算的天数
        dailyLastPrice: dailyLastPrice  // 每日详细数据
      });
    } else {
      console.log('Not enough data available for the specified range.');
      callback(new Error('Not enough data'));
    }
  });
}


/**
 * 获取当前时间戳（上海时区）
 * 用于日志输出
 * 
 * @returns {string} 格式化的时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
function timestamp() {
  return moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 计算两个时间戳之间的天数
 * 
 * 注意：包含起始日期和结束日期，因此需要 +1
 * 例如：2023-01-01 到 2023-01-03 = 3天（1日、2日、3日）
 * 
 * @param {number} minTime - 起始时间戳
 * @param {number} maxTime - 结束时间戳
 * @returns {number} 天数
 */
function getDaysBetweenTimestamps(minTime, maxTime) {
  // 将时间戳转换为 UTC 日期对象
  const startDate = moment(minTime).utc();
  const endDate = moment(maxTime).utc();
  
  // 计算两个日期之间的完整天数（包含首尾两天）
  return endDate.diff(startDate, 'days') + 1;
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

