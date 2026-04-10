import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingDown, TrendingUp, AlertTriangle, Search, Loader2, Info } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [sensitivity, setSensitivity] = useState(12); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Genera dati simulati realistici se tutto fallisce
  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.toUpperCase().includes('BTC') ? 60000 : 
                       ticker.toUpperCase().includes('EUR') ? 1.08 : 
                       ticker.toUpperCase().includes('GC=F') ? 2000 : 150;
    const today = new Date();

    for (let i = 0; i < 252; i++) {
      const macroTrend = Math.sin(i / 30) * (currentPrice * 0.1) + Math.sin(i / 80) * (currentPrice * 0.15);
      const noise = (Math.random() - 0.5) * (currentPrice * 0.02);
      let dayPrice = currentPrice + macroTrend + noise;

      if (i > 210) dayPrice -= (i - 210) * (currentPrice * 0.005);

      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - (252 - i));

      newData.push({
        price: Math.max(dayPrice, 0.01),
        time: pastDate
      });
    }
    
    setChartData(newData);
    setSymbol(ticker.toUpperCase() + ' (Simulato)');
    setIsSimulated(true);
    setError(`Connessione a Yahoo fallita. Mostrando dati simulati per "${ticker.toUpperCase()}".`);
  };

  // Fetch dati da Yahoo Finance (usando Vercel Rewrite)
  const fetchYahooData = async (ticker) => {
    setIsLoading(true);
    setError(null);
    setIsSimulated(false);
    
    try {
      const tickerClean = ticker.toUpperCase();
      const directYahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${tickerClean}?interval=1d&range=1y`;
      
      // Ora la priorità #1 è il nostro proxy privato su Vercel (velocissimo e non bloccato)
      const proxies = [
        `/api/yahoo/${tickerClean}?interval=1d&range=1y`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(directYahooUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(directYahooUrl)}`
      ];

      let json = null;
      let success = false;

      for (const proxyUrl of proxies) {
        try {
          const res = await fetch(proxyUrl);
          if (!res.ok) continue; 

          const text = await res.text(); 
          
          try {
            const parsedJson = JSON.parse(text);
            if (parsedJson && parsedJson.chart && parsedJson.chart.result) {
              json = parsedJson;
              success = true;
              break; 
            }
          } catch (parseError) {
            console.warn(`Risposta non JSON dal proxy: ${proxyUrl}`);
          }
        } catch (err) {
          console.warn(`Proxy fallito: ${proxyUrl}`);
        }
      }

      if (!success || !json) {
        generateSimulatedData(ticker);
        return; 
      }

      const result = json.chart.result[0];
      const closes = result.indicators.quote[0].close;
      const timestamps = result.timestamp;

      const cleanData = closes
        .map((close, index) => ({
          price: close,
          time: new Date(timestamps[index] * 1000)
        }))
        .filter(item => item.price !== null);

      if (cleanData.length === 0) {
        generateSimulatedData(ticker);
        return;
      }

      setChartData(cleanData);
      setSymbol(tickerClean);
    } catch (err) {
      console.error(err);
      generateSimulatedData(ticker);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (inputSymbol.trim()) {
      fetchYahooData(inputSymbol.trim());
    }
  };

  const analyzeData = (dataArray, period) => {
    if (dataArray.length === 0) return [];
    const newSignals = [];
    const sma = []; 

    for (let i = 0; i < dataArray.length; i++) {
      if (i < period) {
        sma.push(dataArray[i].price);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += dataArray[i - j].price;
        }
        sma.push(sum / period);
      }
    }

    let currentTrend = 0; 
    const currentPrice = dataArray[dataArray.length - 1].price;
    const slopeThreshold = currentPrice * 0.002; 

    for (let i = 1; i < sma.length; i++) {
      const slope = sma[i] - sma[i - 1];
      
      if (slope > slopeThreshold && currentTrend !== 1) {
        currentTrend = 1;
        newSignals.push({
