# CKB MA Calculator - 系统架构文档

## 概览

本文档详细说明 CKB 移动平均价格计算器的系统架构、数据流、核心算法和设计决策。

## 系统架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        外部系统                                    │
│                                                                    │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  Binance API                                            │      │
│  │  https://api.binance.com/api/v3/klines                 │      │
│  │  - 交易对: CKB/USDT                                     │      │
│  │  - 周期: 1天 (1d)                                       │      │
│  │  - 数据: K线数据（开盘/收盘/最高/最低/成交量等）        │      │
│  └────────────────────────────────────────────────────────┘      │
│                            ▲                                       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ HTTP GET
                             │
┌────────────────────────────┼───────────────────────────────────────┐
│                    数据采集层                                       │
│                            │                                        │
│  ┌─────────────────────────▼──────────────────────────────┐       │
│  │  initKlines.js                                          │       │
│  │  ├─ 获取最新 5 天的 K线数据                              │       │
│  │  ├─ 解析并提取关键字段                                   │       │
│  │  ├─ 插入/更新到 SQLite                                  │       │
│  │  └─ 删除当天的不完整数据                                 │       │
│  └─────────────────────────┬──────────────────────────────┘       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ INSERT/REPLACE
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                        数据存储层                                  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  price.db (SQLite)                                      │      │
│  │                                                          │      │
│  │  TABLE: klines                                          │      │
│  │  ┌──────────────────────────────────────────────────┐  │      │
│  │  │ startTime (INTEGER PRIMARY KEY) - 时间戳          │  │      │
│  │  │ date (TEXT)                     - 日期            │  │      │
│  │  │ lastPrice (TEXT)                - 收盘价          │  │      │
│  │  │ ckb (INTEGER)                   - 成交量          │  │      │
│  │  │ usdt (TEXT)                     - 成交额          │  │      │
│  │  └──────────────────────────────────────────────────┘  │      │
│  │                                                          │      │
│  │  索引: startTime (主键，自动索引)                        │      │
│  └────────────────────────────────────────────────────────┘      │
│                            ▲                                       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ SELECT
                             │ (chokidar 监听文件变化)
┌────────────────────────────┼───────────────────────────────────────┐
│                        应用服务层                                   │
│                            │                                        │
│  ┌─────────────────────────▼──────────────────────────────┐       │
│  │  calculateMA.js (Express Server, Port 3000)            │       │
│  │                                                          │       │
│  │  功能模块:                                               │       │
│  │  ┌───────────────────────────────────────────────┐     │       │
│  │  │ 1. 数据库连接管理                              │     │       │
│  │  │    - 初始连接                                  │     │       │
│  │  │    - 自动重连 (chokidar 监听)                  │     │       │
│  │  ├───────────────────────────────────────────────┤     │       │
│  │  │ 2. API 端点                                    │     │       │
│  │  │    POST /calculateMA                           │     │       │
│  │  │    - 接收: startTime1, startTime2              │     │       │
│  │  │    - 返回: MA, sum, days, dailyLastPrice       │     │       │
│  │  ├───────────────────────────────────────────────┤     │       │
│  │  │ 3. MA 计算引擎                                 │     │       │
│  │  │    - 查询时间范围内的所有记录                   │     │       │
│  │  │    - 计算收盘价的算术平均值                     │     │       │
│  │  │    - 统计成交量和成交额                         │     │       │
│  │  ├───────────────────────────────────────────────┤     │       │
│  │  │ 4. CORS 支持                                   │     │       │
│  │  │    - 允许跨域请求                              │     │       │
│  │  └───────────────────────────────────────────────┘     │       │
│  └─────────────────────────┬──────────────────────────────┘       │
└────────────────────────────┼───────────────────────────────────────┘
                             │ HTTP POST (JSON)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                        前端展示层                                  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  index.html (Web UI)                                    │      │
│  │                                                          │      │
│  │  组件:                                                   │      │
│  │  ┌───────────────────────────────────────────────┐     │      │
│  │  │ 1. 日期选择器 (FlatPickr)                      │     │      │
│  │  │    - 月份快速选择                              │     │      │
│  │  │    - 自定义日期范围                            │     │      │
│  │  │    - 智能默认值 (本月10号-次月9号)             │     │      │
│  │  ├───────────────────────────────────────────────┤     │      │
│  │  │ 2. MA 计算按钮                                 │     │      │
│  │  │    - 触发 API 调用                             │     │      │
│  │  │    - 显示计算结果                              │     │      │
│  │  ├───────────────────────────────────────────────┤     │      │
│  │  │ 3. 结果展示区                                  │     │      │
│  │  │    - MA 值显示                                 │     │      │
│  │  │    - 统计信息 (总收盘价/天数)                  │     │      │
│  │  │    - 成交数据 (总成交量/总成交额)              │     │      │
│  │  │    - 每日详情列表                              │     │      │
│  │  ├───────────────────────────────────────────────┤     │      │
│  │  │ 4. 价格转换工具                                │     │      │
│  │  │    - USDT → CKB 计算                           │     │      │
│  │  │    - 一键复制功能                              │     │      │
│  │  └───────────────────────────────────────────────┘     │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                    │
│  技术栈:                                                           │
│  - Bootstrap (UI 框架)                                            │
│  - FlatPickr (日期选择器)                                         │
│  - Vanilla JavaScript                                             │
└──────────────────────────────────────────────────────────────────┘
```

## 数据流详解

### 1. 数据采集流程

```
[定时任务] → initKlines.js → Binance API → 解析数据 → SQLite
     ↓
  每日运行
     ↓
 自动更新最新5天的数据
     ↓
 删除当天不完整数据
```

**关键步骤：**
1. 调用 Binance K线 API，获取最近 5 天的日线数据
2. 解析 API 返回的数组，提取：
   - `startTime`: K线开始时间戳
   - `lastPrice`: 收盘价（字段[4]）
   - `ckb`: 成交量（字段[5]）
   - `usdt`: 成交额（字段[7]）
3. 使用 `INSERT OR REPLACE` 插入/更新数据（避免重复）
4. 删除当天的记录（因交易未结束，数据不完整）

### 2. MA 计算流程

```
用户输入 → 选择日期范围 → 点击"计算"按钮
    ↓
前端构造请求 → POST /calculateMA (startTime1, startTime2)
    ↓
后端接收 → 查询 SQLite → 计算 MA
    ↓
返回结果 → 前端展示
```

**计算公式：**
```
MA = Σ(lastPrice) / count(days)

其中:
- lastPrice: 每日收盘价
- days: 时间范围内的天数
```

**示例：**
```javascript
// 假设查询到 3 天的数据
dailyPrices = [0.003450, 0.003460, 0.003470]

// 计算总和
sum = 0.003450 + 0.003460 + 0.003470 = 0.010380

// 计算平均值
MA = 0.010380 / 3 = 0.003460
```

### 3. 前端交互流程

```
页面加载
    ↓
初始化日期选择器 (默认上月10日-本月9日)
    ↓
用户选择日期范围
    ↓
点击"计算"按钮
    ↓
发送 POST 请求到后端
    ↓
接收 JSON 响应 { MA, sum, days, dailyLastPrice }
    ↓
更新页面显示:
    - MA 输入框
    - 统计信息 (MA公式展示)
    - 成交数据 (成交额/成交量)
    - 每日详情 (日期、价格、成交量、成交额)
```

## 核心算法

### 移动平均价格 (MA) 算法

```javascript
function calculateMovingAverages(startTime1, startTime2, callback) {
  // 1. 标准化时间范围（支持任意顺序输入）
  const minTime = Math.min(startTime1, startTime2);
  const maxTime = Math.max(startTime1, startTime2);
  
  // 2. 查询数据库（按时间升序）
  const query = `
    SELECT date, lastPrice, ckb, usdt
    FROM klines
    WHERE startTime BETWEEN ? AND ?
    ORDER BY startTime ASC
  `;
  
  db.all(query, [minTime, maxTime], (err, rows) => {
    // 3. 提取收盘价
    const prices = rows.map(row => parseFloat(row.lastPrice));
    
    // 4. 计算总和
    const sum = prices.reduce((acc, price) => acc + price, 0);
    
    // 5. 计算平均值
    const MA = sum / prices.length;
    
    // 6. 返回结果
    callback(null, {
      MA: MA.toFixed(6),
      sum: sum.toFixed(6),
      days: getDaysBetweenTimestamps(minTime, maxTime),
      dailyLastPrice: rows
    });
  });
}
```

### 天数计算算法

```javascript
function getDaysBetweenTimestamps(minTime, maxTime) {
  const startDate = moment(minTime).utc();
  const endDate = moment(maxTime).utc();
  
  // 包含首尾两天，因此需要 +1
  // 例: 1月1日 到 1月3日 = 3天 (1日、2日、3日)
  return endDate.diff(startDate, 'days') + 1;
}
```

## 设计决策

### 1. 为什么使用 SQLite？

**优点：**
- ✅ 轻量级，无需独立数据库服务器
- ✅ 单文件存储，易于备份和迁移
- ✅ 对于历史数据查询，性能足够
- ✅ 支持标准 SQL 查询

**适用场景：**
- 数据量适中（每天一条记录，年积累约365条）
- 读多写少（主要是查询历史数据）
- 单机部署

### 2. 为什么删除当天的数据？

**原因：**
- 当天交易尚未结束，收盘价是实时变化的
- 用于 MA 计算的应该是**完整的日线数据**（交易日结束后的最终收盘价）
- 保持历史数据的准确性和一致性

**实现：**
```javascript
const today = new Date().toISOString().slice(0, 10);
db.run(`DELETE FROM klines WHERE date = ?`, today);
```

### 3. 为什么使用 chokidar 监听数据库？

**问题：**
- `initKlines.js` 和 `calculateMA.js` 是两个独立进程
- SQLite 的缓存机制可能导致读取到旧数据

**解决方案：**
- 使用 `chokidar` 监听 `price.db` 文件变化
- 检测到变化时，关闭旧连接，重新建立新连接
- 确保读取到最新数据

### 4. 为什么默认日期是 10 号到 9 号？

**业务逻辑：**
- 假设每月结算周期为：本月 10 号 ~ 次月 9 号
- 如果当前日期 ≤ 10 号，默认查看上个月数据
- 如果当前日期 > 10 号，默认查看本月数据

**智能默认值：**
```javascript
if (currentDay <= 10) {
  selectedMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
}
```

### 5. 为什么价格字段使用 TEXT 而不是 REAL？

**原因：**
- 加密货币价格精度要求高（通常 6-8 位小数）
- SQLite 的 REAL 类型（浮点数）存在精度损失
- 使用 TEXT 存储，计算时转换为 `parseFloat()`，确保精度

**示例：**
```javascript
// 存储为 TEXT
lastPrice: "0.003456"

// 计算时转换
const price = parseFloat(row.lastPrice);
```

## 安全性考虑

### 1. SQL 注入防护

使用参数化查询：
```javascript
db.all(query, [minTime, maxTime], callback);  // ✅ 安全
// 而不是:
// db.all(`SELECT * FROM klines WHERE startTime = ${minTime}`)  // ❌ 危险
```

### 2. CORS 配置

当前配置允许所有源访问（开发和演示环境）：
```javascript
app.use(cors());  // 允许所有来源
```

**生产环境建议：**
```javascript
app.use(cors({
  origin: 'https://web3zhu.cn',  // 仅允许特定域名
  methods: ['POST'],              // 仅允许 POST 方法
}));
```

### 3. 输入验证

```javascript
if (!startTime1 || !startTime2) {
  return res.status(400).send({ error: 'Both parameters are required.' });
}
```

## 性能优化

### 1. 数据库索引

```sql
-- startTime 作为主键，自动创建索引
CREATE TABLE klines (
  startTime INTEGER PRIMARY KEY,  -- 自动索引
  ...
);
```

### 2. 查询优化

- 使用 `BETWEEN` 范围查询（利用索引）
- 限制返回字段（只查询需要的列）
- 按 `startTime` 排序（利用索引，避免额外排序）

### 3. 前端缓存

使用 `localStorage` 缓存用户选择的日期：
```javascript
localStorage.setItem('startDate', startTimestamp);
localStorage.setItem('endDate', endTimestamp);
```

## 扩展性

### 可能的功能扩展

1. **多币种支持**：扩展支持 BTC、ETH 等其他币种
2. **多周期 MA**：支持 MA(7)、MA(30)、MA(90) 等不同周期
3. **图表可视化**：集成 Chart.js 或 ECharts，绘制价格走势图
4. **指标计算**：增加 EMA、MACD、RSI 等技术指标
5. **历史数据回填**：批量导入更多历史数据
6. **用户账户系统**：保存用户的自定义配置

### 架构演进路径

```
当前架构: 单体应用 (HTML + Express + SQLite)
    ↓
微服务架构:
    - 数据采集服务 (initKlines)
    - API 服务 (calculateMA)
    - 前端静态托管 (CDN)
    ↓
分布式架构:
    - 多数据源聚合 (Binance + 其他交易所)
    - 消息队列 (RabbitMQ / Kafka)
    - 时序数据库 (InfluxDB / TimescaleDB)
    - 缓存层 (Redis)
```

## 部署建议

### 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
node initKlines.js

# 3. 启动后端服务
node calculateMA.js

# 4. 浏览器打开 index.html
```

### 生产环境

```bash
# 1. 使用 PM2 管理进程
npm install -g pm2
pm2 start calculateMA.js --name ckb-ma-api

# 2. 配置 Nginx 反向代理
# /etc/nginx/sites-available/ckb-ma
server {
    listen 80;
    server_name web3zhu.cn;
    
    location /calculateMA {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location / {
        root /var/www/ckb-ma;
        index index.html;
    }
}

# 3. 配置定时任务（每日更新数据）
# crontab -e
0 0 * * * cd /path/to/ckbMA && node initKlines.js >> cron.log 2>&1
```

## 监控和日志

### 日志记录

1. **数据采集日志** (initKlines.js)：
   - 数据拉取成功/失败
   - 数据插入/更新记录
   - 错误堆栈

2. **API 服务日志** (calculateMA.js)：
   - 请求接收
   - 查询执行时间
   - 数据库重连事件
   - 错误信息

3. **系统日志**：
   ```bash
   # 使用 nohup 后台运行并记录日志
   nohup node calculateMA.js > calculateMA.log 2>&1 &
   ```

### 监控指标

- **API 响应时间**：平均查询时间
- **数据库大小**：磁盘占用
- **请求频率**：QPS（每秒查询数）
- **错误率**：失败请求占比

## 总结

本系统采用**经典三层架构**（数据层-应用层-展示层），通过 Binance API 获取真实交易数据，提供准确的移动平均价格计算服务。设计上注重**数据准确性**（删除不完整数据）、**用户体验**（智能默认日期）和**系统稳定性**（自动重连机制）。

适用于个人或小团队进行加密货币价格分析，轻量级且易于部署和维护。
