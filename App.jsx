import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingDown, TrendingUp, AlertTriangle, Search, Loader2, Info } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [sensitivity, setSensitivity] = useState(14); // Periodo EMA
  const [noiseFilter, setNoiseFilter] = useState(0.15); // Soglia pendenza % (filtro rumore)
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Fallback in caso di problemi con i dati reali
  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.includes('BTC') ? 65000 : ticker.includes('EUR') ? 1.09 : 150;
    const today = new Date();
    for (let i = 0; i < 260; i++) {
      const macro = Math.sin(i / 25) * (currentPrice * 0.08) + Math.cos(i / 60) * (currentPrice * 0.12);
      const noise = (Math.random() - 0.5) * (currentPrice * 0.015);
      const price = currentPrice + macro + noise;
      const d = new Date(today); d.setDate(today.getDate() - (260 - i));
      newData.push({ price: Math.max(price, 0.01), time: d });
    }
    setChartData(newData);
    setSymbol(ticker.toUpperCase() + ' (Simulato)');
    setIsSimulated(true);
    setError(`Utilizzo dati simulati causa timeout dei server.`);
  };

  // Funzione per scaricare i dati reali (tramite proxy Vercel o pubblico)
  const fetchYahooData = async (ticker) => {
    setIsLoading(true);
    setError(null);
    setIsSimulated(false);
    try {
      const t = ticker.toUpperCase();
      const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1y`;
      const proxies = [
        `/api/yahoo/${t}?interval=1d&range=1y`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`
      ];

      let json = null;
      for (const p of proxies) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const text = await res.text();
            json = JSON.parse(text);
            if (json?.chart?.result) break;
          }
        } catch (e) { continue; }
      }

      if (json?.chart?.result) {
        const res = json.chart.result[0];
        const data = res.timestamp.map((ts, i) => ({
          price: res.indicators.quote[0].close[i],
          time: new Date(ts * 1000)
        })).filter(d => d.price != null);
        setChartData(data);
        setSymbol(t);
      } else {
        generateSimulatedData(ticker);
      }
    } catch (e) {
      generateSimulatedData(ticker);
    } finally {
      setIsLoading(false);
    }
  };

  // Calcolo EMA (Exponential Moving Average) - Più reattiva della media semplice
  const calculateEMA = (data, period) => {
    const k = 2 / (period + 1);
    let ema = [data[0].price];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i].price * k + ema[i - 1] * (1 - k));
    }
    return ema;
  };

  // Algoritmo di analisi EMA + Filtro Volatilità
  const analyzeTrend = (data, period, filter) => {
    if (data.length < period) return { ema: [], signalsList: [] };
    const ema = calculateEMA(data, period);
    const signalsList = [];
    let state = 0; // 1 per Up, -1 per Down

    for (let i = 1; i < ema.length; i++) {
      const price = data[i].price;
      const prevEma = ema[i - 1];
      const currEma = ema[i];
      const slope = (currEma - prevEma) / prevEma * 100; // Pendenza in %

      // Segnale SELL: Prezzo taglia sotto EMA e pendenza negativa > filtro
      if (price < currEma && slope < -filter && state !== -1) {
        state = -1;
        signalsList.push({
          index: i, price, type: 'SELL', date: data[i].time.toLocaleDateString('it-IT'),
          msg: "Inizio Trend Discendente"
        });
      } 
      // Segnale BUY: Prezzo taglia sopra EMA e pendenza positiva > filtro
      else if (price > currEma && slope > filter && state !== 1) {
        state = 1;
        signalsList.push({
          index: i, price, type: 'BUY', date: data[i].time.toLocaleDateString('it-IT'),
          msg: "Inversione Rialzista Rilevata"
        });
      }
    }
    return { ema, signalsList };
  };

  useEffect(() => {
    if (chartData.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const prices = chartData.map(d => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = (maxP - minP) * 1.1;
    const padding = (maxP - minP) * 0.05;

    const getX = (i) => (i / (chartData.length - 1)) * width;
    const getY = (v) => height - ((v - (minP - padding)) / range) * height;

    // Disegno Griglia Sfondo
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    for(let i=0; i<=4; i++) {
      const y = getY(minP + (maxP-minP)*(i/4));
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const { ema, signalsList } = analyzeTrend(chartData, sensitivity, noiseFilter);
    setSignals([...signalsList].reverse());

    // Disegno EMA (Linea tratteggiata grigia)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ema.forEach((v, i) => i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Disegno linea Prezzo
    const split = Math.floor(chartData.length * 0.85);
    ctx.lineWidth = 2.5;
    
    ctx.beginPath(); ctx.strokeStyle = '#3b82f6';
    chartData.slice(0, split + 1).forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
    ctx.stroke();

    ctx.beginPath(); ctx.strokeStyle = '#f97316';
    chartData.slice(split).forEach((d, i) => i === 0 ? ctx.moveTo(getX(split + i), getY(d.price)) : ctx.lineTo(getX(split + i), getY(d.price)));
    ctx.stroke();

    // Marker Segnali (Triangoli)
    signalsList.forEach(s => {
      const x = getX(s.index), y = getY(s.price);
      ctx.fillStyle = s.type === 'BUY' ? '#22c55e' : '#ef4444';
      ctx.beginPath();
      if(s.type === 'BUY') {
        ctx.moveTo(x, y - 15); ctx.lineTo(x - 8, y); ctx.lineTo(x + 8, y);
      } else {
        ctx.moveTo(x, y + 15); ctx.lineTo(x - 8, y); ctx.lineTo(x + 8, y);
      }
      ctx.fill();
    });
  }, [chartData, sensitivity, noiseFilter]);

  useEffect(() => { fetchYahooData('EURUSD=X'); }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 flex flex-col">
      <header className="flex flex-col md:flex-row items-center justify-between mb-6 border-b border-slate-800 pb-4 gap-4">
        <div className="flex items-center space-x-3">
          <Activity size={28} className="text-blue-500" />
          <div>
            <h1 className="text-xl font-bold">TrendCatcher <span className="text-blue-400">V2 Precision</span></h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">EMA + Filtro Dinamico</p>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex w-full md:w-auto">
          <input 
            className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-l-md outline-none focus:border-blue-500 text-white w-full"
            value={inputSymbol} onChange={e => setInputSymbol(e.target.value.toUpperCase())}
          />
          <button className="bg-blue-600 px-4 py-2 rounded-r-md hover:bg-blue-700">
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        <div className="lg:col-span-3 flex flex-col space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-lg font-bold mb-4">{symbol}</h2>
            <div className="relative aspect-[21/9] bg-slate-950 rounded-lg border border-slate-800/50">
              <canvas ref={canvasRef} width={1200} height={500} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <h3 className="text-xs font-bold mb-6 text-slate-400 uppercase flex items-center">
              <Settings size={14} className="mr-2" /> Parametri Analisi
            </h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>Periodo EMA</span>
                  <span className="text-blue-400 font-mono">{sensitivity}</span>
                </div>
                <input type="range" min="5" max="50" value={sensitivity} onChange={e => setSensitivity(Number(e.target.value))} className="w-full accent-blue-500" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>Filtro Rumore</span>
                  <span className="text-blue-400 font-mono">{noiseFilter.toFixed(2)}%</span>
                </div>
                <input type="range" min="0" max="100" value={noiseFilter * 100} onChange={e => setNoiseFilter(Number(e.target.value)/100)} className="w-full accent-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex-1 overflow-hidden flex flex-col shadow-lg">
            <h3 className="text-xs font-bold mb-4 text-slate-400 uppercase">Segnali Recenti</h3>
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 custom-scrollbar">
              {signals.map((s, i) => (
                <div key={i} className={`p-3 rounded-lg border ${s.type === 'BUY' ? 'bg-green-900/10 border-green-800/30 text-green-400' : 'bg-red-900/10 border-red-800/30 text-red-400'}`}>
                  <div className="flex justify-between text-[10px] mb-1 font-mono text-slate-400">
                    <span>{s.date}</span>
                    <span>{s.price.toFixed(4)}</span>
                  </div>
                  <p className="text-[11px] font-bold">{s.msg}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }`}} />
    </div>
  );
}
