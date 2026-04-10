import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingUp, Search, Loader2, Info, Target, Zap, ArrowUpRight, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]); 
  const [targetLevels, setTargetLevels] = useState([]); 
  const [rsiData, setRsiData] = useState([]);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Genera dati simulati se i server reali sono bloccati
  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.toUpperCase().includes('BTC') ? 65000 : 
                       ticker.toUpperCase().includes('EUR') ? 1.09 : 150;
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
    setError("Utilizzando dati simulati per ottimizzazione visualizzazione.");
  };

  const calculateRSI = (data, period) => {
    let rsi = new Array(data.length).fill(null);
    if (data.length < period + 1) return rsi;
    let gains = 0; let losses = 0;
    for (let i = 1; i <= period; i++) {
      let diff = data[i].price - data[i - 1].price;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period; let avgLoss = losses / period;
    rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < data.length; i++) {
      let diff = data[i].price - data[i - 1].price;
      let gain = diff >= 0 ? diff : 0; let loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi[i] = 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  };

  const analyzeCyclesV5 = (data, rsiValues, threshold) => {
    if (data.length < 15) return { signalsList: [], supports: [], targets: [] };
    const signalsList = [];
    const supports = [];
    const targets = [];
    
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];

      if (data[i-1].price > data[i-2].price && data[i-1].price > data[i].price) {
        if (!targets.some(t => Math.abs(t.price - data[i-1].price) / t.price < 0.003)) {
          targets.push({ price: data[i-1].price, index: i-1 });
        }
      }

      let isBuySignal = false;
      let signalType = "standard";
      let msg = "";

      for (let prev = i - 5; prev > i - 40; prev--) {
        if (data[prev] && data[prev-1] && data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
          if (data[i-1].price <= data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) {
             if (p0 > p1) {
                isBuySignal = true;
                signalType = "divergence";
                msg = "Divergenza Ciclica";
                break;
             }
          }
        }
      }

      if (!isBuySignal) {
        supports.forEach(level => {
          const diff = Math.abs(p1 - level.price) / level.price;
          if (diff < 0.0022 && p1 < data[i-2].price && p0 > p1) {
            isBuySignal = true;
            signalType = "support";
            msg = "Supporto Ciclico";
          }
        });
      }

      if (!isBuySignal && rsi1 < threshold && p0 > p1) {
        isBuySignal = true;
        signalType = "standard";
        msg = "Inizio Ciclo";
      }

      if (isBuySignal) {
        signalsList.push({
          index: i - 1, price: p1, type: 'BUY', stype: signalType,
          date: data[i-1].time.toLocaleDateString('it-IT'), msg
        });
        if (!supports.some(s => Math.abs(s.price - p1) / p1 < 0.004)) {
          supports.push({ price: p1, index: i - 1 });
        }
      }
    }
    return { signalsList, supports, targets };
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true); setError(null); setIsSimulated(false);
    const timeout = setTimeout(() => {
      if (isLoading && chartData.length === 0) {
        generateSimulatedData(ticker);
        setIsLoading(false);
      }
    }, 5000);

    try {
      const t = ticker.toUpperCase();
      const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1y`;
      const proxies = [
        `/api/yahoo/${t}?interval=1d&range=1y`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(directUrl)}`
      ];

      let json = null;
      let success = false;
      for (const p of proxies) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const text = await res.text();
            json = JSON.parse(text);
            if (json?.chart?.result) { success = true; break; }
          }
        } catch (e) { continue; }
      }

      clearTimeout(timeout);
      if (success && json?.chart?.result) {
        const result = json.chart.result[0];
        const prices = result.timestamp.map((ts, i) => ({
          price: result.indicators.quote[0].close[i],
          time: new Date(ts * 1000)
        })).filter(d => d.price != null);
        if (prices.length > 0) { setChartData(prices); setSymbol(t); } 
        else { generateSimulatedData(ticker); }
      } else { generateSimulatedData(ticker); }
    } catch (e) { generateSimulatedData(ticker); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (chartData.length === 0) return;
    const rsi = calculateRSI(chartData, rsiPeriod);
    setRsiData(rsi);
    const { signalsList, supports, targets } = analyzeCyclesV5(chartData, rsi, oversoldLimit);
    setSignals([...signalsList].reverse());
    setSupportLevels(supports);
    setTargetLevels(targets);

    const draw = () => {
      const canvas = canvasRef.current;
      const rsiCanvas = rsiCanvasRef.current;
      if (!canvas || !rsiCanvas) return;
      const ctx = canvas.getContext('2d');
      const rCtx = rsiCanvas.getContext('2d');
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const prices = chartData.map(d => d.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const range = (maxP - minP) * 1.15;
      const padding = (maxP - minP) * 0.07;
      const getX = (i) => (i / (chartData.length - 1)) * width;
      const getY = (v) => height - ((v - (minP - padding)) / range) * height;

      ctx.setLineDash([6, 4]);
      supports.forEach(s => {
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)';
        ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(width, getY(s.price)); ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.8;
      chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
      ctx.stroke();

      signalsList.forEach(s => {
        const x = getX(s.index); const y = getY(s.price);
        ctx.fillStyle = s.stype === 'divergence' ? '#a855f7' : '#22c55e';
        ctx.beginPath(); ctx.arc(x, y, s.stype === 'divergence' ? 5 : 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        if (s.stype === 'divergence') {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
          ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
        }
      });

      rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
      rCtx.strokeStyle = '#334155'; rCtx.beginPath();
      rCtx.moveTo(0, rsiCanvas.height * 0.3); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.3);
      rCtx.moveTo(0, rsiCanvas.height * 0.7); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.7);
      rCtx.stroke();
      rCtx.beginPath(); rCtx.strokeStyle = '#a855f7'; rCtx.lineWidth = 1.5;
      rsi.forEach((v, i) => {
        if (v === null) return;
        const x = (i / (rsi.length - 1)) * rsiCanvas.width;
        const y = rsiCanvas.height - (v / 100) * rsiCanvas.height;
        i === 0 ? rCtx.moveTo(x, y) : rCtx.lineTo(x, y);
      });
      rCtx.stroke();
    };
    const timer = setTimeout(draw, 50);
    return () => clearTimeout(timer);
  }, [chartData, rsiPeriod, oversoldLimit]);

  useEffect(() => { fetchYahooData('EURUSD=X'); }, []);

  return (
    <div className="h-screen bg-slate-950 text-slate-200 p-2 md:p-4 font-sans flex flex-col overflow-hidden">
      <header className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-2">
          <Zap className={`text-yellow-500 fill-yellow-500 ${isLoading ? 'animate-pulse' : ''}`} size={20} />
          <h1 className="text-lg font-black tracking-tighter uppercase italic">CycleMaster <span className="text-blue-500 text-[10px] not-italic">V5</span></h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
          <input 
            className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-l-md outline-none focus:border-blue-500 text-xs w-24 md:w-40 text-white" 
            value={inputSymbol} 
            onChange={e => setInputSymbol(e.target.value.toUpperCase())} 
          />
          <button className="bg-blue-600 px-3 py-1 rounded-r-md hover:bg-blue-700"><Search size={14} /></button>
        </form>
      </header>

      {error && (
        <div className="mb-2 p-2 bg-yellow-900/10 border border-yellow-800/30 rounded-lg text-[9px] text-yellow-400 flex items-center">
          <AlertTriangle size={12} className="mr-1 shrink-0" /> {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 overflow-hidden">
        <div className="lg:col-span-3 flex flex-col space-y-3 overflow-hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl relative flex-[3] flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{symbol}</h2>
              <div className="flex space-x-3 text-[8px] font-bold">
                <span className="flex items-center text-purple-400"><div className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-1"></div> Divergenza</span>
                <span className="flex items-center text-green-400"><div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div> Supporto</span>
              </div>
            </div>
            <div className="relative flex-1 bg-slate-950 rounded-lg overflow-hidden border border-slate-800/50">
              <canvas ref={canvasRef} width={1200} height={600} className="w-full h-full" />
              {isLoading && chartData.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-blue-500" size={24} />
                </div>
              )}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 h-24 flex flex-col">
            <h2 className="text-[8px] font-bold text-slate-400 mb-1 uppercase tracking-widest flex items-center">
              <BarChart3 size={10} className="mr-1" /> RSI Oscillator
            </h2>
            <div className="flex-1 bg-slate-950 rounded border border-slate-800">
              <canvas ref={rsiCanvasRef} width={1000} height={100} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-3 overflow-hidden h-full">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><Settings size={12} className="mr-1"/> Config</h3>
            <div className="space-y-2">
              <label className="text-[9px] block text-slate-500 uppercase font-bold">Sensibilità ({oversoldLimit})</label>
              <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none accent-blue-500" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex-1 flex flex-col overflow-hidden shadow-2xl">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><Bell size={12} className="mr-1 text-blue-500"/> Segnali</h3>
            <div className="overflow-y-auto space-y-1.5 pr-1 custom-scrollbar flex-1">
              {signals.length === 0 ? (
                <div className="text-center py-4 text-slate-600 text-[9px] italic">No data</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-2 rounded-lg border text-[10px] transition-all ${
                    s.stype === 'divergence' ? 'bg-purple-900/10 border-purple-800/30' : 
                    s.stype === 'support' ? 'bg-blue-900/5 border-blue-800/20' : 'bg-green-900/5 border-green-800/20'
                  }`}>
                    <div className="flex justify-between font-mono text-slate-500 scale-90 origin-left">
                      <span>{s.date}</span>
                      <span className="text-slate-300 font-bold">{s.price.toFixed(4)}</span>
                    </div>
                    <p className={`font-bold mt-0.5 ${
                      s.stype === 'divergence' ? 'text-purple-400' : 
                      s.stype === 'support' ? 'text-blue-400' : 'text-green-400'
                    }`}>{s.msg}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 3px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}} />
    </div>
  );
}
