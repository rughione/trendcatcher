import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Bell, Settings, TrendingUp, Search, Loader2, 
  Target, Zap, BarChart3, AlertTriangle, RefreshCw, Clock, TrendingDown 
} from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]);
  const [resistanceLevels, setResistanceLevels] = useState([]);
  const [fibTargets, setFibTargets] = useState(null);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [overboughtLimit, setOverboughtLimit] = useState(65); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [timeframe, setTimeframe] = useState('1d'); 
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Generatore dati di emergenza
  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.toUpperCase().includes('BTC') ? 65000 : ticker.toUpperCase().includes('EUR') ? 1.09 : 150;
    const today = new Date();
    const points = timeframe === '1d' ? 260 : 300;
    for (let i = 0; i < points; i++) {
      const macro = Math.sin(i / 25) * (currentPrice * 0.08) + Math.cos(i / 60) * (currentPrice * 0.12);
      const noise = (Math.random() - 0.5) * (currentPrice * 0.015);
      const price = currentPrice + macro + noise;
      const d = new Date(today); 
      if (timeframe === '1d') d.setDate(today.getDate() - (points - i));
      else d.setHours(today.getHours() - (points - i));
      newData.push({ price: Math.max(price, 0.01), time: d });
    }
    setChartData(newData);
    setSymbol(ticker.toUpperCase() + ' (Simulato)');
    setIsSimulated(true);
    setError("Utilizzo dati simulati causa saturazione server.");
  };

  const calculateRSI = (data, period) => {
    let rsi = new Array(data.length).fill(null);
    if (data.length < period + 1) return rsi;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      let diff = data[i].price - data[i - 1].price;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    rsi[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
    for (let i = period + 1; i < data.length; i++) {
      let diff = data[i].price - data[i - 1].price;
      let gain = diff >= 0 ? diff : 0; let loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
    }
    return rsi;
  };

  const analyzeUltimateCycles = (data, rsiValues, lowThresh, highThresh) => {
    if (data.length < 20) return { signalsList: [], supports: [], resistances: [] };
    const signalsList = [];
    const supports = [];
    const resistances = [];
    
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];
      let signal = null;

      let isDivBuy = false;
      for (let prev = i - 5; prev > i - 40; prev--) {
        if (data[prev] && data[prev-1] && data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
          if (data[i-1].price <= data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) {
             if (p0 > p1) { isDivBuy = true; break; }
          }
        }
      }
      if (isDivBuy) signal = { type: 'BUY', stype: 'divergence', msg: "Divergenza Rialzista" };
      else if (rsi1 < lowThresh && p0 > p1) signal = { type: 'BUY', stype: 'standard', msg: "Inizio Ciclo Rialzista" };

      if (!signal) {
        let isDivSell = false;
        for (let prev = i - 5; prev > i - 40; prev--) {
          if (data[prev] && data[prev-1] && data[prev].price > data[prev-1].price && data[prev].price > data[prev+1].price) {
            if (data[i-1].price >= data[prev].price && rsiValues[i-1] < rsiValues[prev] && rsiValues[i-1] > 55) {
               if (p0 < p1) { isDivSell = true; break; }
            }
          }
        }
        if (isDivSell) signal = { type: 'SELL', stype: 'divergence', msg: "Divergenza Ribassista" };
        else if (rsi1 > highThresh && p0 < p1) signal = { type: 'SELL', stype: 'standard', msg: "Massimo Ciclico" };
      }

      if (signal) {
        const sigData = { ...signal, index: i - 1, price: p1, date: data[i-1].time.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) };
        signalsList.push(sigData);
        if (signal.type === 'BUY' && !supports.some(s => Math.abs(s.price - p1) / p1 < 0.003)) supports.push({ price: p1, index: i - 1 });
        if (signal.type === 'SELL' && !resistances.some(r => Math.abs(r.price - p1) / p1 < 0.003)) resistances.push({ price: p1, index: i - 1 });
      }
    }
    return { signalsList, supports, resistances };
  };

  const calculateFibTargets = (data, lastSignal) => {
    if (!lastSignal || data.length < 30) return null;
    const lookback = 40;
    const slice = data.slice(Math.max(0, lastSignal.index - lookback), lastSignal.index);
    if (slice.length === 0) return null;
    const prices = slice.map(d => d.price);
    const swingHigh = Math.max(...prices);
    const swingLow = Math.min(...prices);
    const diff = swingHigh - swingLow;
    if (lastSignal.type === 'BUY') {
      return { tp1: lastSignal.price + diff * 0.618, tp2: lastSignal.price + diff * 1.618, type: 'BUY' };
    } else {
      return { tp1: lastSignal.price - diff * 0.618, tp2: lastSignal.price - diff * 1.618, type: 'SELL' };
    }
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true); setError(null); setIsSimulated(false);
    const range = timeframe === '1d' ? '1y' : '1mo';
    const interval = timeframe === '1d' ? '1d' : '60m';
    try {
      const t = ticker.toUpperCase();
      const proxy = `/api/yahoo/${t}?interval=${interval}&range=${range}`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const result = json.chart.result[0];
      const prices = result.timestamp.map((ts, i) => ({ price: result.indicators.quote[0].close[i], time: new Date(ts * 1000) })).filter(d => d.price != null);
      if (prices.length > 0) { setChartData(prices); setSymbol(t); } else { generateSimulatedData(ticker); }
    } catch (e) { generateSimulatedData(ticker); } finally { setIsLoading(false); }
  };

  // EFFETTO PRINCIPALE: CALCOLO E DISEGNO
  useEffect(() => {
    if (chartData.length === 0) return;

    // 1. Eseguiamo i calcoli localmente per evitare stale closures
    const rsi = calculateRSI(chartData, rsiPeriod);
    const { signalsList, supports, resistances } = analyzeUltimateCycles(chartData, rsi, oversoldLimit, overboughtLimit);
    const sortedSignals = [...signalsList].reverse();
    const targets = sortedSignals.length > 0 ? calculateFibTargets(chartData, sortedSignals[0]) : null;

    // 2. Aggiorniamo gli stati (React 18 gestisce il batching, non causerà loop se non sono in dipendenza)
    setSignals(sortedSignals);
    setSupportLevels(supports);
    setResistanceLevels(resistances);
    setFibTargets(targets);

    // 3. Funzione di disegno sincronizzata
    const draw = () => {
      const canvas = canvasRef.current;
      const rsiCanvas = rsiCanvasRef.current;
      if (!canvas || !rsiCanvas || canvas.clientWidth === 0) return;

      const ctx = canvas.getContext('2d'), rCtx = rsiCanvas.getContext('2d');
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
      rsiCanvas.width = rsiCanvas.clientWidth; rsiCanvas.height = rsiCanvas.clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const prices = chartData.map(d => d.price), minP = Math.min(...prices), maxP = Math.max(...prices);
      const range = (maxP - minP) * 1.15, padding = (maxP - minP) * 0.07;
      if (range === 0) return;
      const getX = (i) => (i / (chartData.length - 1)) * canvas.width;
      const getY = (v) => canvas.height - ((v - (minP - padding)) / range) * canvas.height;

      // Linee Orizzontali
      ctx.setLineDash([5, 8]);
      supports.forEach(s => { ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)'; ctx.beginPath(); ctx.moveTo(0, getY(s.price)); ctx.lineTo(canvas.width, getY(s.price)); ctx.stroke(); });
      resistances.forEach(r => { ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.beginPath(); ctx.moveTo(0, getY(r.price)); ctx.lineTo(canvas.width, getY(r.price)); ctx.stroke(); });
      ctx.setLineDash([]);

      // Prezzo
      ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5;
      chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
      ctx.stroke();

      // Fibonacci Targets (usiamo il valore locale 'targets' per sicurezza)
      if (targets && sortedSignals.length > 0) {
        const startX = getX(sortedSignals[0].index);
        ctx.setLineDash([2, 2]); ctx.font = '10px monospace';
        ctx.strokeStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(startX, getY(targets.tp1)); ctx.lineTo(canvas.width, getY(targets.tp1)); ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.fillText(`TP1: ${targets.tp1.toFixed(4)}`, canvas.width - 65, getY(targets.tp1) - 5);
        ctx.strokeStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(startX, getY(targets.tp2)); ctx.lineTo(canvas.width, getY(targets.tp2)); ctx.stroke();
        ctx.fillStyle = '#fb923c'; ctx.fillText(`TP2: ${targets.tp2.toFixed(4)}`, canvas.width - 65, getY(targets.tp2) - 5);
        ctx.setLineDash([]);
      }

      // Pallini
      signalsList.forEach(s => {
        const x = getX(s.index), y = getY(s.price);
        ctx.fillStyle = s.type === 'BUY' ? (s.stype === 'divergence' ? '#a855f7' : '#22c55e') : (s.stype === 'divergence' ? '#ef4444' : '#f87171');
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      });

      // RSI
      rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
      rCtx.strokeStyle = 'rgba(255,255,255,0.05)'; [30, 70].forEach(l => { const y = rsiCanvas.height - (l/100) * rsiCanvas.height; rCtx.beginPath(); rCtx.moveTo(0, y); rCtx.lineTo(rsiCanvas.width, y); rCtx.stroke(); });
      rCtx.beginPath(); rCtx.strokeStyle = '#a855f7'; rCtx.lineWidth = 2;
      rsi.forEach((v, i) => { if (v !== null) { const x = (i / (rsi.length - 1)) * rsiCanvas.width; const y = rsiCanvas.height - (v / 100) * rsiCanvas.height; i === 0 ? rCtx.moveTo(x, y) : rCtx.lineTo(x, y); } });
      rCtx.stroke();
    };

    const timer = setTimeout(draw, 100);
    window.addEventListener('resize', draw);
    return () => { clearTimeout(timer); window.removeEventListener('resize', draw); };
    // RIMOSSA dipendenza da fibTargets per evitare loop infinito
  }, [chartData, oversoldLimit, timeframe, overboughtLimit, rsiPeriod]); 

  useEffect(() => { fetchYahooData(inputSymbol); }, [timeframe]);

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-200 p-3 md:p-4 font-sans flex flex-col overflow-hidden">
      <header className="flex justify-between items-center mb-3 h-12 border-b border-slate-800 shrink-0">
        <div className="flex items-center space-x-2">
          <Zap className="text-yellow-500 fill-yellow-500" size={20} />
          <h1 className="text-lg font-black tracking-tighter uppercase italic">CycleMaster <span className="text-blue-500 text-[10px] not-italic font-bold">PRO ULTIMATE</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-700 shadow-inner">
            <button onClick={() => setTimeframe('1d')} className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${timeframe === '1d' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>1G</button>
            <button onClick={() => setTimeframe('1h')} className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${timeframe === '1h' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>1H</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
            <input className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-l-md outline-none focus:border-blue-500 text-xs w-24 md:w-40 text-white" value={inputSymbol} onChange={e => setInputSymbol(e.target.value.toUpperCase())} />
            <button className="bg-blue-600 px-4 py-1.5 rounded-r-md hover:bg-blue-700 transition-colors shadow-lg"><Search size={16} /></button>
          </form>
        </div>
      </header>

      {error && <div className="bg-yellow-950/20 border border-yellow-900/50 p-2 text-[10px] text-yellow-400 rounded-lg mb-2 flex items-center shrink-0"><AlertTriangle size={14} className="mr-2"/> {error}</div>}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        <div className="flex-[3] flex flex-col gap-4 min-h-0">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl relative min-h-0">
             <div className="flex justify-between items-center mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{symbol} <span className="text-blue-500 ml-2 bg-blue-500/10 px-2 py-0.5 rounded">[{timeframe.toUpperCase()}]</span></span>
                <div className="flex gap-4 text-[9px] font-bold uppercase tracking-tight">
                   <span className="flex items-center text-purple-400"><div className="w-2 h-2 bg-purple-500 rounded-full mr-1.5 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div> Divergenza</span>
                   <span className="flex items-center text-red-400"><div className="w-2 h-2 bg-red-400 rounded-full mr-1.5 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div> Massimo</span>
                   <span className="flex items-center text-green-400"><div className="w-2 h-2 bg-green-500 rounded-full mr-1.5 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div> Minimo</span>
                </div>
             </div>
             <div className="w-full h-[calc(100%-35px)] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/50 relative shadow-inner">
                <canvas ref={canvasRef} className="w-full h-full" />
                {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"><Loader2 className="animate-spin text-blue-500" size={32} /></div>}
             </div>
          </div>
          <div className="h-16 bg-slate-900 border border-slate-800 rounded-2xl p-3 shrink-0 shadow-lg relative">
             <div className="absolute top-1 left-2 text-[8px] font-bold text-slate-600 uppercase tracking-widest">RSI Strength</div>
             <canvas ref={rsiCanvasRef} className="w-full h-full bg-slate-950 rounded-lg" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0 lg:w-80">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shrink-0 shadow-xl border-t-2 border-t-blue-500/20">
            <h3 className="text-[11px] font-bold text-slate-400 mb-4 uppercase flex items-center tracking-widest"><Settings size={14} className="mr-2 text-blue-500"/> Calibrazione Pro</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase"><span>Soglia Buy (RSI)</span><span className="text-green-400">{oversoldLimit}</span></div>
                <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none accent-green-500 cursor-pointer" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase"><span>Soglia Sell (RSI)</span><span className="text-red-400">{overboughtLimit}</span></div>
                <input type="range" min="55" max="80" value={overboughtLimit} onChange={e => setOverboughtLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none accent-red-500 cursor-pointer" />
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col min-h-0 overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 right-0 p-2 opacity-10"><Activity size={60} /></div>
            <h3 className="text-[11px] font-bold text-slate-400 mb-4 uppercase flex items-center tracking-widest"><Target size={14} className="mr-2 text-yellow-500"/> Trade Explorer</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {signals.length === 0 ? <div className="text-center py-10 text-slate-600 text-[10px] italic">Nessun segnale rilevato...</div> : signals.map((s, i) => (
                <div key={i} className={`p-3 rounded-xl border transition-all hover:translate-x-1 ${s.type === 'SELL' ? 'bg-red-950/10 border-red-900/30' : (s.stype === 'divergence' ? 'bg-purple-900/10 border-purple-800/30' : 'bg-green-900/10 border-green-800/20')}`}>
                  <div className="flex justify-between font-mono text-slate-500 text-[9px] mb-1.5"><span>{s.date}</span><span className="text-slate-200 font-bold">{s.price.toFixed(4)}</span></div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.type === 'SELL' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <p className={`font-bold text-[10px] tracking-tight ${s.type === 'SELL' ? 'text-red-400' : (s.stype === 'divergence' ? 'text-purple-400' : 'text-green-400')}`}>{s.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 3px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}} />
    </div>
  );
}
