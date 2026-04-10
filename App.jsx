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

  // Genera dati simulati realistici se i proxy falliscono
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
    setError(`Proxy sovraccarichi. Mostrando dati simulati per "${ticker.toUpperCase()}".`);
  };

  // Fetch dati da Yahoo Finance
  const fetchYahooData = async (ticker) => {
    setIsLoading(true);
    setError(null);
    setIsSimulated(false);
    
    try {
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}?interval=1d&range=1y`;
      
      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
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
            console.warn(`Proxy non JSON: ${proxyUrl}`);
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
      setSymbol(ticker.toUpperCase());
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
          index: i,
          price: dataArray[i].price,
          type: 'BUY',
          message: 'Fine fase discendente rilevata',
          time: dataArray[i].time.toLocaleDateString('it-IT')
        });
      } else if (slope < -slopeThreshold && currentTrend !== -1) {
        currentTrend = -1;
        newSignals.push({
          index: i,
          price: dataArray[i].price,
          type: 'SELL',
          message: 'Inizio fase discendente rilevata',
          time: dataArray[i].time.toLocaleDateString('it-IT')
        });
      }
    }

    setSignals(newSignals.reverse()); 
    return { sma, signalsList: newSignals };
  };

  useEffect(() => {
    if (chartData.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.05; 
    const range = (maxPrice + padding) - (minPrice - padding);

    const getX = (index) => (index / (chartData.length - 1)) * width;
    const getY = (val) => height - ((val - (minPrice - padding)) / range) * height;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      const y = height * (i / 4);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      const priceLabel = ((maxPrice + padding) - range * (i / 4)).toFixed(isSimulated ? 2 : 4);
      ctx.fillText(priceLabel, 5, y - 5);
    }

    const { signalsList } = analyzeData(chartData, sensitivity);

    const orangeStart = Math.floor(chartData.length * 0.85);

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(prices[0]));
    for (let i = 1; i <= orangeStart; i++) {
      ctx.lineTo(getX(i), getY(prices[i]));
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (orangeStart < chartData.length) {
      ctx.beginPath();
      ctx.moveTo(getX(orangeStart), getY(prices[orangeStart]));
      for (let i = orangeStart + 1; i < chartData.length; i++) {
        ctx.lineTo(getX(i), getY(prices[i]));
      }
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    signalsList.forEach(sig => {
      const x = getX(sig.index);
      const y = getY(sig.price);

      ctx.beginPath();
      ctx.fillStyle = sig.type === 'SELL' ? '#ef4444' : '#22c55e';
      
      if (sig.type === 'SELL') {
        ctx.moveTo(x - 6, y - 15);
        ctx.lineTo(x + 6, y - 15);
        ctx.lineTo(x, y - 5);
      } else {
        ctx.moveTo(x - 6, y + 15);
        ctx.lineTo(x + 6, y + 15);
        ctx.lineTo(x, y + 5);
      }
      ctx.fill();
    });

  }, [chartData, sensitivity, isSimulated]);

  useEffect(() => {
    fetchYahooData('EURUSD=X');
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-6 flex flex-col">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 border-b border-slate-800 pb-4 gap-4">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Activity size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center">
              TrendCatcher Pro 
              <span className={`text-xs px-2 py-1 rounded ml-2 ${isSimulated ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-800 text-slate-300'}`}>
                {isSimulated ? 'Simulato' : 'Yahoo API'}
              </span>
            </h1>
            <p className="text-sm text-slate-400">Dati a 1 anno (Daily)</p>
          </div>
        </div>
        
        <form onSubmit={handleSearch} className="flex w-full md:w-auto">
          <input 
            type="text" 
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
            placeholder="Es. EURUSD=X"
            className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-l-md outline-none focus:border-blue-500 w-full md:w-48"
          />
          <button 
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-r-md flex items-center"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </form>
      </header>

      {error && (
        <div className={`mb-6 p-3 rounded-lg text-sm flex items-start border ${isSimulated ? 'bg-yellow-950/30 border-yellow-900/50 text-yellow-400' : 'bg-red-950/50 border-red-900 text-red-400'}`}>
          {isSimulated ? <Info size={18} className="mr-2 mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mr-2 mt-0.5 shrink-0" />}
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-slate-300 flex items-center text-lg">
                <span className="text-blue-400 font-bold mr-2">{symbol}</span> Grafico
              </h2>
            </div>
            <div className="relative w-full aspect-[2/1] bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
              {isLoading ? (
                <div className="text-slate-500 flex flex-col items-center">
                  <Loader2 size={32} className="animate-spin mb-2 text-blue-500" />
                  <span>Scaricamento dati...</span>
                </div>
              ) : (
                <canvas ref={canvasRef} width={800} height={400} className="absolute inset-0 w-full h-full" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <h2 className="font-semibold text-slate-300 mb-4 flex items-center">
              <Settings size={18} className="mr-2 text-slate-400" /> Sensibilità Media
            </h2>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Giorni</span>
              <span className="text-blue-400 font-mono">{sensitivity}</span>
            </div>
            <input 
              type="range" min="3" max="30" value={sensitivity}
              onChange={(e) => setSensitivity(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex-1 flex flex-col overflow-hidden max-h-[500px]">
            <h2 className="font-semibold text-slate-300 mb-4 flex items-center">
              <Bell size={18} className="mr-2 text-yellow-500" /> Storico Segnali
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {signals.map((sig, i) => (
                <div key={i} className={`p-3 rounded-lg border ${sig.type === 'SELL' ? 'bg-red-950/20 border-red-900/50' : 'bg-green-950/20 border-green-900/50'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${sig.type === 'SELL' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
                      {sig.type === 'SELL' ? 'Discesa (Vendi)' : 'Ripresa (Compra)'}
                    </span>
                    <span className="text-xs text-slate-500">{sig.time}</span>
                  </div>
                  <p className="text-sm text-slate-300 font-medium mt-1">{sig.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.5); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.8); }`}} />
    </div>
  );
  }
