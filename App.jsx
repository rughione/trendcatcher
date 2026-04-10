import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingUp, Search, Loader2, Info, Target, Zap, ArrowUpRight, BarChart3, AlertTriangle } from 'lucide-react';

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

  // Genera dati simulati se i proxy falliscono (per evitare lo schermo blu)
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
    setError("I server Yahoo non rispondono. Mostro dati simulati per testare i cicli.");
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

  // Algoritmo CycleMaster V5: Cicli, Supporti, Fibonacci e Divergenze
  const analyzeCyclesV5 = (data, rsiValues, threshold) => {
    if (data.length < 15) return { signalsList: [], supports: [], targets: [] };
    const signalsList = [];
    const supports = [];
    const targets = [];
    
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];

      // 1. Identificazione Picchi per Target
      if (data[i-1].price > data[i-2].price && data[i-1].price > data[i].price) {
        if (!targets.some(t => Math.abs(t.price - data[i-1].price) / t.price < 0.003)) {
          targets.push({ price: data[i-1].price, index: i-1 });
        }
      }

      let isBuySignal = false;
      let signalType = "standard";
      let msg = "";

      // 2. DIVERGENZA RIALZISTA
      for (let prev = i - 5; prev > i - 40; prev--) {
        if (data[prev] && data[prev-1] && data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
          if (data[i-1].price <= data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) {
             if (p0 > p1) {
                isBuySignal = true;
                signalType = "divergence";
                msg = "Divergenza Rialzista (Ciclo Forte)";
                break;
             }
          }
        }
      }

      // 3. SUPPORTO CICLICO STORICO
      if (!isBuySignal) {
        supports.forEach(level => {
          const diff = Math.abs(p1 - level.price) / level.price;
          if (diff < 0.0022 && p1 < data[i-2].price && p0 > p1) {
            isBuySignal = true;
            signalType = "support";
            msg = "Ripartenza su Supporto Ciclico";
          }
        });
      }

      // 4. RSI OVERSOLD
      if (!isBuySignal && rsi1 < threshold && p0 > p1) {
        isBuySignal = true;
        signalType = "standard";
        msg = "Inizio Ciclo (Ipervenduto)";
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

      if (success && json?.chart?.result) {
        const result = json.chart.result[0];
        const prices = result.timestamp.map((ts, i) => ({
          price: result.indicators.quote[0].close[i],
          time: new Date(ts * 1000)
        })).filter(d => d.price != null);
        setChartData(prices);
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

  useEffect(() => {
    if (chartData.length === 0) return;
    const rsi = calculateRSI(chartData, rsiPeriod);
    setRsiData(rsi);
    const { signalsList, supports, targets } = analyzeCyclesV5(chartData, rsi, oversoldLimit);
    setSignals([...signalsList].reverse());
    setSupportLevels(supports);
    setTargetLevels(targets);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const prices = chartData.map(d => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = (maxP - minP) * 1.15;
    const padding = (maxP - minP) * 0.07;

    const getX = (i) => (i / (chartData.length - 1)) * width;
    const getY = (v) => height - ((v - (minP - padding)) / range) * height;

    // Target (Rosse)
    ctx.setLineDash([2, 8]);
    targets.forEach(t => {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.beginPath(); ctx.moveTo(getX(t.index), getY(t.price)); ctx.lineTo(width, getY(t.price)); ctx.stroke();
    });

    // Supporti (Verdi)
    ctx.setLineDash([6, 4]);
    supports.forEach(s => {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(width, getY(s.price)); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Prezzo
    ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5;
    chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
    ctx.stroke();

    // Segnali
    signalsList.forEach(s => {
      const x = getX(s.index); const y = getY(s.price);
      ctx.fillStyle = s.stype === 'divergence' ? '#a855f7' : '#22c55e';
      ctx.beginPath(); ctx.arc(x, y, s.stype === 'divergence' ? 8 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      if (s.stype === 'divergence') {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // RSI
    const rsiCanvas = rsiCanvasRef.current;
    if (!rsiCanvas) return;
    const rCtx = rsiCanvas.getContext('2d');
    rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
    rCtx.strokeStyle = '#334155'; rCtx.beginPath();
    rCtx.moveTo(0, rsiCanvas.height * 0.3); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.3);
    rCtx.moveTo(0, rsiCanvas.height * 0.7); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.7);
    rCtx.stroke();
    rCtx.beginPath(); rCtx.strokeStyle = '#a855f7'; rCtx.lineWidth = 2;
    rsi.forEach((v, i) => {
      if (v === null) return;
      const x = (i / (rsi.length - 1)) * rsiCanvas.width;
      const y = rsiCanvas.height - (v / 100) * rsiCanvas.height;
      i === 0 ? rCtx.moveTo(x, y) : rCtx.lineTo(x, y);
    });
    rCtx.stroke();
  }, [chartData, rsiPeriod, oversoldLimit]);

  useEffect(() => { fetchYahooData('EURUSD=X'); }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 font-sans flex flex-col">
      <header className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2">
          <Zap className={`text-yellow-500 fill-yellow-500 ${isLoading ? 'animate-pulse' : ''}`} size={24} />
          <h1 className="text-xl font-black tracking-tighter uppercase italic">CycleMaster <span className="text-blue-500 text-xs not-italic">V5 ULTIMATE</span></h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
          <input className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-l-md outline-none focus:border-blue-500 text-sm w-32 md:w-48 text-white" value={inputSymbol} onChange={e => setInputSymbol(e.target.value.toUpperCase())} />
          <button className="bg-blue-600 px-4 py-1.5 rounded-r-md hover:bg-blue-700 shadow-lg shadow-blue-900/20"><Search size={18} /></button>
        </form>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-xl text-[10px] text-yellow-400 flex items-center shadow-lg">
          <AlertTriangle size={14} className="mr-2 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 overflow-hidden">
        <div className="lg:col-span-3 space-y-4 flex flex-col overflow-hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative flex-1 min-h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{symbol} - Analisi Ciclica</h2>
              <div className="flex space-x-4 text-[9px] font-bold">
                <span className="flex items-center text-purple-400"><div className="w-2 h-2 bg-purple-500 rounded-full mr-1 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div> Divergenza</span>
                <span className="flex items-center text-green-400"><div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div> Supporto</span>
              </div>
            </div>
            <div className="relative w-full h-[calc(100%-40px)] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/50">
              <canvas ref={canvasRef} width={1200} height={500} className="w-full h-full" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 h-32">
            <h2 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center">
              <BarChart3 size={12} className="mr-1" /> Oscillatore RSI
            </h2>
            <div className="relative h-16 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={rsiCanvasRef} width={1000} height={100} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="space-y-4 flex flex-col h-full overflow-hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase"><Settings size={14} className="mr-2"/> Setup</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1 text-slate-500">Soglia Sensibilità ({oversoldLimit})</label>
                <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full accent-blue-500" />
              </div>
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <p className="text-[10px] text-blue-300 leading-tight">
                  <ArrowUpRight size={12} className="inline mr-1" />
                  <strong>PRO Tip:</strong> Se i server Yahoo sono bloccati, l'app usa dati simulati realistici per farti testare i segnali.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex-1 flex flex-col overflow-hidden shadow-2xl">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase"><Bell size={14} className="mr-2 text-blue-500"/> Segnali Operativi</h3>
            <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar flex-1 text-white">
              {isLoading ? (
                 <div className="flex flex-col items-center justify-center py-20 text-slate-600 animate-pulse">
                    <Loader2 size={24} className="animate-spin mb-2" />
                    <span className="text-[10px] uppercase font-bold">Analisi in corso...</span>
                 </div>
              ) : signals.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-[10px]">Nessun segnale rilevato</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-3 rounded-xl border transition-all ${
                    s.stype === 'divergence' ? 'bg-purple-900/20 border-purple-800/40' : 
                    s.stype === 'support' ? 'bg-blue-900/10 border-blue-800/30' : 'bg-green-900/10 border-green-800/30'
                  }`}>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                      <span>{s.date}</span>
                      <span className="text-slate-300 font-bold">{s.price.toFixed(4)}</span>
                    </div>
                    <p className={`text-[10px] font-bold ${
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
