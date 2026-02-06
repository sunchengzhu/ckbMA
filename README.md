# CKB移动平均线（MA）计算器

一个用于计算和可视化 CKB/USDT 移动平均价格的 Web 应用程序。

## 项目概述

本项目通过从 Binance API 获取 CKB（Nervos Network 代币）的历史交易数据，计算指定时间范围内的移动平均价格（MA），并提供直观的 Web 界面进行查询和分析。

## 核心功能

- 📊 **移动平均价格计算**：基于真实的 Binance K线数据计算任意时间范围的 MA
- 📅 **灵活的日期选择**：支持月份快速选择和自定义日期范围
- 💹 **交易数据分析**：显示每日收盘价、成交量（CKB）和成交额（USDT）
- 💱 **价格转换工具**：快速计算 USDT 和 CKB 之间的兑换
- 🔄 **自动数据更新**：定期从 Binance 拉取最新的交易数据

## 系统架构

```
┌─────────────────────┐
│   Binance API       │  ← 数据源（K线数据）
│   (CKB/USDT)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  initKlines.js      │  ← 数据采集脚本
│  (数据管道)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   price.db          │  ← SQLite 数据库
│   (klines 表)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  calculateMA.js     │  ← Express 后端服务器
│  (API 服务)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   index.html        │  ← 前端界面
│   (用户交互)         │
└─────────────────────┘
```

## 项目组成

### 1. 前端 (index.html)
- **功能**：提供用户界面，包括日期选择、MA计算、价格转换
- **技术栈**：HTML5, JavaScript, Bootstrap, FlatPickr
- **特点**：
  - 中文本地化日期选择器
  - 响应式设计
  - 一键复制功能
  - 实时数据展示

### 2. 后端服务 (calculateMA.js)
- **功能**：处理 MA 计算请求，查询数据库
- **技术栈**：Node.js, Express, SQLite3, Chokidar
- **端口**：3000
- **API 端点**：
  - `POST /calculateMA`：计算指定时间范围的移动平均价格
- **特性**：
  - 跨域支持（CORS）
  - 数据库文件监听与自动重连
  - 时区处理（Asia/Shanghai）

### 3. 数据采集 (initKlines.js)
- **功能**：从 Binance API 获取最新的 K线数据并存储到数据库
- **数据源**：`https://api.binance.com/api/v3/klines`
- **更新策略**：
  - 每次拉取最近 5 天的数据
  - 自动删除当天的不完整数据
  - 使用 `INSERT OR REPLACE` 避免重复

### 4. 数据库 (price.db)
- **类型**：SQLite3
- **表结构**：
  ```sql
  CREATE TABLE klines (
    startTime INTEGER PRIMARY KEY,  -- K线开始时间戳（唯一标识）
    date TEXT,                       -- 日期 (YYYY-MM-DD)
    lastPrice TEXT,                  -- 收盘价
    ckb INTEGER,                     -- 成交量（CKB）
    usdt TEXT                        -- 成交额（USDT）
  );
  ```

## 数据流程

1. **数据采集阶段**：
   ```
   initKlines.js → Binance API → 解析 K线数据 → SQLite (price.db)
   ```

2. **查询计算阶段**：
   ```
   用户选择日期 → 前端发送 POST 请求 → calculateMA.js 
   → 查询 SQLite → 计算 MA → 返回结果 → 前端展示
   ```

3. **MA 计算公式**：
   ```
   MA = Σ(收盘价) / 天数
   ```

## 安装和运行

### 环境要求
- Node.js (建议 v14+)
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 数据初始化
首次运行需要初始化数据库并拉取历史数据：
```bash
node initKlines.js
```

### 启动后端服务
```bash
node calculateMA.js
```

或使用 nohup 在后台运行：
```bash
nohup node calculateMA.js > calculateMA.log 2>&1 &
```

**提示**：如果使用 screen 或 tmux 会话管理，可以按 `Control + A` 再按 `D` 来分离会话。

### 访问前端
在浏览器中打开 `index.html` 或部署到 Web 服务器。

## 配置说明

### 环境变量
项目使用 `dotenv` 管理环境变量，可创建 `.env` 文件进行配置。

### 数据库路径
默认路径：`./price.db`  
可在 `calculateMA.js` 和 `initKlines.js` 中修改。

### API 端点
- 开发环境：`http://localhost:3000/calculateMA`
- 生产环境：`https://web3zhu.cn/calculateMA`

修改前端 `index.html` 中 `fetchMovingAverages()` 函数内的 API 地址以切换环境（约第 249 行）。

## 技术栈

### 后端
- **Express**：Web 框架
- **SQLite3**：轻量级数据库
- **node-fetch**：HTTP 请求（Binance API）
- **moment-timezone**：时区处理
- **chokidar**：文件监听
- **cors**：跨域支持

### 前端
- **Bootstrap**：UI 框架
- **FlatPickr**：日期选择器
- **date-fns**：日期处理

### 部署工具
- **qiniu**：七牛云存储
- **ssh2**：SFTP 上传

## 项目特色

1. **自动数据更新**：通过 `chokidar` 监听数据库文件变化，自动重新建立连接
2. **数据完整性**：每日自动删除当天的不完整数据，确保历史数据准确性
3. **智能日期选择**：默认选择上个月 10 日到本月 9 日（如果当前日期 ≤ 10）
4. **详细统计信息**：提供收盘价总和、天数、总成交量、总成交额等多维度数据

## 数据说明

### K线数据字段（Binance API）
```javascript
[
  1499040000000,      // [0] 开盘时间 (startTime)
  "0.01634000",       // [1] 开盘价
  "0.80000000",       // [2] 最高价
  "0.01575800",       // [3] 最低价
  "0.01577100",       // [4] 收盘价 (lastPrice)
  "148976.11427815",  // [5] 成交量 (ckb)
  1499644799999,      // [6] 收盘时间
  "2434.19055334",    // [7] 成交额 (usdt)
  308,                // [8] 成交笔数
  "1756.87402397",    // [9] 主动买入成交量
  "28.46694368",      // [10] 主动买入成交额
  "17928899.62484339" // [11] 忽略
]
```

本项目主要使用：
- **startTime** [0]：唯一标识
- **lastPrice** [4]：用于 MA 计算
- **ckb** [5]：成交量
- **usdt** [7]：成交额

## API 文档

### POST /calculateMA

计算指定时间范围的移动平均价格。

**请求体**：
```json
{
  "startTime1": 1672531200000,  // 开始时间戳（毫秒）
  "startTime2": 1675209600000   // 结束时间戳（毫秒）
}
```

**响应示例**：
```json
{
  "MA": "0.003456",
  "sum": "0.103680",
  "days": 30,
  "dailyLastPrice": [
    {
      "date": "2023-01-01",
      "lastPrice": "0.003450",
      "ckb": "1234567",
      "usdt": "4262.35"
    },
    ...
  ]
}
```

## 相关链接

- [CKB/USDT 交易页](https://www.binance.com/zh-CN/trade/CKB_USDT)
- [Binance K线数据 API 文档](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api_CN.md#k线数据)

## 许可证

ISC
