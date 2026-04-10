import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Bell, Settings, TrendingUp, Search, Loader2, 
  Info, Target, Zap, ArrowUpRight, BarChart3, AlertTriangle, 
  RefreshCw, Clock, TrendingDown 
} from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]); 
  const [resistanceLevels, setResistanceLevels] = useState([]); 
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [overboughtLimit, setOverboughtLimit] = useState(65); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [timeframe, setTimeframe] = useState('1d'); 
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Funzione per generare dati se Yahoo o i Proxy falliscono
  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.toUpperCase().includes('BTC') ? 65000 : 
                       ticker.toUpperCase().includes('EUR') ? 1.09 : 150;
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
    setError("Dati reali non disponibili. Modalità simulata attiva.");
  };

  // Calcolo RSI (Relative Strength Index)
  const calculateRSI = (data, period) => {
    let rsi = new Array(data.length).fill(null);
    if (data.length < period + 1) return rsi;
    let gains = 0; let losses = 0;
    for (let i = 1; i <= period; i++) {
      let diff = data[i].price - data[i - 1].price;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period; let avgLoss = losses / period;
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

  // Algoritmo CycleMaster V7: Analisi bi-direzionale (Minimi e Massimi)
  const analyzeCyclesV7 = (data, rsiValues, lowThresh, highThresh) => {
    if (data.length < 20) return { signalsList: [], supports: [], resistances: [] };
    const signalsList = [];
    const supports = [];
    const resistances = [];
    
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];
      let signal = null;

      // --- LOGICA RIALZISTA (Pallini Verdi/Viola) ---
      for (let prev = i - 5; prev > i - 40; prev--) {
        if (data[prev] && data[prev-1] && data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
          if (data[i-1].price <= data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) {
             if (p0 > p1) {
                signal = { type: 'BUY', stype: 'divergence', msg: "Divergenza Ciclica (Rialzo)" }; break;
             }
          }
        }
      }
      if (!signal) {
        supports.forEach(l => {
          if (Math.abs(p1 - l.price)/l.price < 0.0022 && p0 > p1) {
            signal = { type: 'BUY', stype: 'support', msg: "Rimbalzo su Base Ciclo" };
          }
        });
      }
      if (!signal && rsi1 < lowThresh && p0 > p1) {
        signal = { type: 'BUY', stype: 'standard', msg: "Inizio Ciclo Rialzista" };
      }

      // --- LOGICA RIBASSISTA (Pallini Rossi) ---
      if (!signal) {
        for (let prev = i - 5; prev > i - 40; prev--) {
          if (data[prev] && data[prev-1] && data[prev].price > data[prev-1].price && data[prev].price > data[prev+1].price) {
            if (data[i-1].price >= data[prev].price && rsiValues[i-1] < rsiValues[prev] && rsiValues[i-1] > 55) {
               if (p0 < p1) {
                  signal = { type: 'SELL', stype: 'divergence', msg: "Divergenza Ciclica (Ribasso)" }; break;
               }
            }
          }
        }
        if (!signal) {
          resistances.forEach(l => {
            if (Math.abs(p1 - l.price)/l.price < 0.0022 && p0 < p1) {
              signal = { type: 'SELL', stype: 'resistance', msg: "Picco su Resistenza Storica" };
            }
          });
        }
        if (!signal && rsi1 > highThresh && p0 < p1) {
          signal = { type: 'SELL', stype: 'standard', msg: "Massimo Ciclico Rilevato" };
        }
      }

      if (signal) {
        signalsList.push({
          ...signal, index: i - 1, price: p1,
          date: data[i-1].time.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        });
        if (signal.type === 'BUY' && !supports.some(s => Math.abs(s.price - p1)/p1 < 0.004)) supports.push({price: p1, index: i-1});
        if (signal.type === 'SELL' && !resistances.some(s => Math.abs(s.price - p1)/p1 < 0.004)) resistances.push({price: p1, index: i-1});
      }
    }
    return { signalsList, supports, resistances };
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true); setError(null); setIsSimulated(false);
    const range = timeframe === '1d' ? '1y' : '1mo';
    const interval = timeframe === '1d' ? '1d' : '60m';
    const timeout = setTimeout(() => { if (isLoading && chartData.length === 0) { generateSimulatedData(ticker); setIsLoading(false); } }, 5000);

    try {
      const t = ticker.toUpperCase();
      const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=${interval}&range=${range}`;
      const proxies = [`/api/yahoo/${t}?interval=${interval}&range=${range}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}` ];
      let json = null; let success = false;
      for (const p of proxies) {
        try {
          const res = await fetch(p);
          if (res.ok) { const text = await res.text(); json = JSON.parse(text); if (json?.chart?.result) { success = true; break; } }
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
    const { signalsList, supports, resistances } = analyzeCyclesV7(chartData, rsi, oversoldLimit, overboughtLimit);
    setSignals([...signalsList].reverse());
    setSupportLevels(supports);
    setResistanceLevels(resistances);

    const draw = () => {
      const canvas = canvasRef.current;
      const rsiCanvas = rsiCanvasRef.current;
      if (!canvas || !rsiCanvas) return;
      const ctx = canvas.getContext('2d');
      const rCtx = rsiCanvas.getContext('2d');
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
      rsiCanvas.width = rsiCanvas.clientWidth; rsiCanvas.height = rsiCanvas.clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const prices = chartData.map(d => d.price);
      const minP = Math.min(...prices); const maxP = Math.max(...prices);
      const range = (maxP - minP) * 1.15; const padding = (maxP - minP) * 0.07;
      const getX = (i) => (i / (chartData.length - 1)) * canvas.width;
      const getY = (v) => canvas.height - ((v - (minP - padding)) / range) * canvas.height;

      // Disegno Griglie tratteggiate
      ctx.setLineDash([6, 4]);
      supports.forEach(s => { ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)'; ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(canvas.width, getY(s.price)); ctx.stroke(); });
      resistances.forEach(s => { ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)'; ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(canvas.width, getY(s.price)); ctx.stroke(); });
      ctx.setLineDash([]);

      // Linea Prezzo Blu
      ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
      chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
      ctx.stroke();

      // Pallini Segnale
      signalsList.forEach(s => {
        const x = getX(s.index); const y = getY(s.price);
        ctx.fillStyle = s.type === 'BUY' ? (s.stype === 'divergence' ? '#a855f7' : '#22c55e') : '#ef4444';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      });

      // Disegno RSI Viola
      rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
      rCtx.strokeStyle = 'rgba(255,255,255,0.05)';
      [30, 70].forEach(l => { const y = rsiCanvas.height - (l/100) * rsiCanvas.height; rCtx.beginPath(); rCtx.moveTo(0, y); rCtx.lineTo(rsiCanvas.width, y); rCtx.stroke(); });
      rCtx.beginPath(); rCtx.strokeStyle = '#a855f7'; rCtx.lineWidth = 2;
      rsi.forEach((v, i) => { if (v !== null) { const x = (i / (rsi.length - 1)) * rsiCanvas.width; const y = rsiCanvas.height - (v / 100) * rsiCanvas.height; i === 0 ? rCtx.moveTo(x, y) : rCtx.lineTo(x, y); } });
      rCtx.stroke();
    };
    const timer = setTimeout(draw, 100);
    window.addEventListener('resize', draw);
    return () => { clearTimeout(timer); window.removeEventListener('resize', draw); };
  }, [chartData, oversoldLimit, timeframe, overboughtLimit]);

  useEffect(() => { fetchYahooData(inputSymbol); }, [timeframe]);

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-200 p-3 md:p-4 font-sans flex flex-col overflow-hidden">
      <header className="flex justify-between items-center mb-3 h-10 border-b border-slate-800 shrink-0">
        <div className="flex items-center space-x-2">
          <Zap className="text-yellow-500 fill-yellow-500" size={18} />
          <h1 className="text-md font-black tracking-tighter uppercase italic">CycleMaster <span className="text-blue-500 text-[9px] not-italic font-bold tracking-normal">V7 ULTIMATE</span></h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-700">
            <button onClick={() => setTimeframe('1d')} className={`px-3 py-1 text-[10px] font-bold rounded ${timeframe === '1d' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>1G</button>
            <button onClick={() => setTimeframe('1h')} className={`px-3 py-1 text-[10px] font-bold rounded ${timeframe === '1h' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>1H</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
            <input className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-l-md outline-none focus:border-blue-500 text-xs w-24 md:w-40 text-white" value={inputSymbol} onChange={e => setInputSymbol(e.target.value.toUpperCase())} />
            <button className="bg-blue-600 px-3 py-1 rounded-r-md hover:bg-blue-700 transition-colors"><Search size={14} /></button>
          </form>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        <div className="flex-[3] flex flex-col gap-3 min-h-0">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl relative min-h-0">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{symbol} <span className="text-blue-500 ml-1">[{timeframe.toUpperCase()}]</span></span>
                <div className="flex gap-4 text-[8px] font-bold uppercase tracking-tight">
                   <span className="flex items-center text-purple-400"><div className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-1"></div> Divergenza</span>
                   <span className="flex items-center text-red-400"><div className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1"></div> Massimo</span>
                   <span className="flex items-center text-green-400"><div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div> Minimo</span>
                </div>
             </div>
             <div className="w-full h-[calc(100%-25px)] bg-slate-950 rounded border border-slate-800/50">
                <canvas ref={canvasRef} className="w-full h-full" />
             </div>
          </div>
          <div className="h-16 bg-slate-900 border border-slate-800 rounded-xl p-2 shrink-0">
             <div className="text-[8px] font-bold text-slate-500 mb-1 uppercase">RSI Peak/Trough Flow</div>
             <canvas ref={rsiCanvasRef} className="w-full h-[calc(100%-12px)] bg-slate-950 rounded" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 min-h-0 lg:w-72">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shrink-0 shadow-lg">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><Settings size={12} className="mr-1"/> Configurazione</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[8px] block text-slate-500 uppercase font-bold mb-1">Ipervenduto ({oversoldLimit})</label>
                <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg accent-green-500" />
              </div>
              <div>
                <label className="text-[8px] block text-slate-500 uppercase font-bold mb-1">Ipercomprato ({overboughtLimit})</label>
                <input type="range" min="55" max="80" value={overboughtLimit} onChange={e => setOverboughtLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg accent-red-500" />
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col min-h-0 overflow-hidden shadow-2xl">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><Bell size={12} className="mr-1 text-blue-500"/> Segnali Operativi</h3>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={20}/></div>
              ) : signals.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-[9px] uppercase tracking-tighter italic">Analisi...</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-1.5 rounded-lg border text-[9px] ${
                    s.type === 'SELL' ? 'bg-red-950/20 border-red-900/30' : 
                    (s.stype === 'divergence' ? 'bg-purple-900/10 border-purple-800/20' : 'bg-slate-950/50 border-slate-800')
                  }`}>
                    <div className="flex justify-between font-mono text-slate-500 text-[7px] mb-0.5">
                      <span>{s.date}</span>
                      <span className="text-slate-300 font-bold">{s.price.toFixed(4)}</span>
                    </div>
                    <p className={`font-bold leading-tight ${
                      s.type === 'SELL' ? 'text-red-400' : 
                      (s.stype === 'divergence' ? 'text-purple-400' : 'text-green-400')
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
