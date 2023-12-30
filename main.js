const axios = require('axios').default;
const sqlite3 = require('sqlite3');
const dbConnection = new sqlite3.Database('tradingData.db', (error) => {
    if (error) {
      console.error('ERROR CONNECTING TO DATABASE', error);
      return;
    }
    console.info('DATABASE CONNECTION ESTABLISHED');
  });
  

const apiBaseUrl = 'https://testnet.binance.vision/api/v3';
const PRICE_ASK = 'ask';
const PRICE_BID = 'bid';
const tradeDirections = [PRICE_ASK, PRICE_BID];
const symbolBTCUSDT = 'BTCUSDT';
const dataRefreshInterval = 5000;

async function fetchSymbols() {
  const response = await axios.get(`${apiBaseUrl}/exchangeInfo`);
  return response.data.symbols.map(({ symbol }) => symbol);
}

async function fetchMarketDepth(tradingPair, pricePoint = PRICE_ASK) {
  if (!tradeDirections.includes(pricePoint)) throw Error('Direction not recognized');
  const response = await axios.get(`${apiBaseUrl}/depth`, { params: { symbol: tradingPair, limit: 1 } });
  return pricePoint === PRICE_ASK ? response.data.asks[0] : response.data.bids[0];
}

async function fetchOrderBook(tradingPair) {
  const response = await axios.get(`${apiBaseUrl}/depth`, { params: { symbol: tradingPair } });
  return response.data;
}

async function updateCandleData(tradingPair, timeframe = '1m', quantity = 10) {
  const latestCandle = await fetchLatestCandle();
  const fetchedLatestCandle = await axios.get(`${apiBaseUrl}/klines`, {
    params: { symbol: tradingPair, interval: timeframe, limit: 1 },
  });
  const newCandleDate = fetchedLatestCandle.data[0][0];

  console.info(`${latestCandle} - ${newCandleDate}`);

  if (latestCandle < newCandleDate) {
    console.info('Fetching new candle data');
    const { data: newCandles } = await axios.get(`${apiBaseUrl}/klines`, {
      params: { symbol: tradingPair, interval: timeframe, limit: quantity },
    });
    await Promise.all(newCandles.map(convertCandleData).map(insertCandleData));
    return newCandles;
  }

  console.info('Candle data is up-to-date');
}

async function databaseMigrate() {
  return new Promise((resolve, reject) =>
    dbConnection.run(
      `CREATE TABLE IF NOT EXISTS candlestickData (Id INTEGER PRIMARY KEY, date INT, high REAL, low REAL, open REAL, close REAL, volume REAL)`,
      (err) => (err ? reject(err) : resolve(this)),
    ),
  );
}

async function insertCandleData({ date, high, low, open, close, volume }) {
  return new Promise((resolve, reject) =>
    dbConnection.run(
      `INSERT INTO candlestickData(date, high, low, open, close, volume) VALUES (?, ?, ?, ?, ?, ?);`,
      [date, high, low, open, close, volume],
      (err) => (err ? reject(err) : resolve()),
    ),
  );
}

function convertCandleData(candleData) {
  return {
    date: candleData[0],
    high: candleData[2],
    low: candleData[3],
    open: candleData[1],
    close: candleData[4],
    volume: candleData[5],
  };
}

async function fetchLatestCandle() {
  const latest = await new Promise((resolve, reject) =>
    dbConnection.get(`SELECT date FROM candlestickData ORDER BY date DESC LIMIT 1;`, [], (err, row) => (err ? reject(err) : resolve(row))),
  );
  return latest?.date;
}

async function initiateBot() {
  await databaseMigrate();
  setInterval(() => updateCandleData(symbolBTCUSDT), dataRefreshInterval);
}

initiateBot();
