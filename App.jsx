import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingUp, Search, Loader2, Info, Target, Zap, ArrowUpRight } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]); 
  const [targetLevels, setTargetLevels] = useState([]); // Nuovi target di vendita
  const [rsiData, setRsiData] = useState([]);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);

  // Calcolo RSI
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

  // Algoritmo Avanzato: Cicli, Supporti e Divergenze
  const analyzeCycleMaster = (data, rsiValues, threshold) => {
    if (data.length < 10) return { signalsList: [], supports: [], targets: [] };
    const signalsList = [];
    const supports = [];
    const targets = [];
    
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];
      const rsi0 = rsiValues[i];

      // Identificazione Picchi per Target (Resistenze)
      if (data[i-1].price > data[i-2].price && data[i-1].price > data[i].price) {
        if (!targets.some(t => Math.abs(t.price - data[i-1].price) / t.price < 0.005)) {
          targets.push({ price: data[i-1].price, index: i-1 });
        }
      }

      let isBuySignal = false;
      let signalType = "standard";
      let msg = "";

      // 1. DIVERGENZA RIALZISTA (Il segnale più forte)
      // Cerchiamo un minimo precedente per confrontare
      for (let prev = i - 5; prev > i - 30; prev--) {
        if (data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
          // Se il prezzo oggi è più basso di prima, ma l'RSI è più alto
          if (data[i-1].price < data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) {
             if (p0 > p1) {
                isBuySignal = true;
                signalType = "divergence";
                msg = "Divergenza Rialzista (Ciclo Forte)";
                break;
             }
          }
        }
      }

      // 2. SUPPORTO STORICO
      if (!isBuySignal) {
        supports.forEach(level => {
          const diff = Math.abs(p1 - level.price) / level.price;
          if (diff < 0.0025 && p1 < data[i-2].price && p0 > p1) {
            isBuySignal = true;
            signalType = "support";
            msg = "Rimbalzo su Supporto Ciclico";
          }
        });
      }

      // 3. RSI OVERSOLD
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
        // Salva il nuovo supporto
        if (!supports.some(s => Math.abs(s.price - p1) / p1 < 0.005)) {
          supports.push({ price: p1, index: i - 1 });
        }
      }
    }
    return { signalsList, supports, targets };
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true); setError(null);
    try {
      const t = ticker.toUpperCase();
      const proxy = `/api/yahoo/${t}?interval=1d&range=1y`;
      const res = await fetch(proxy);
      const json = await res.json();
      const result = json.chart.result[0];
      const prices = result.indicators.quote[0].close.map((p, i) => ({
        price: p, time: new Date(result.timestamp[i] * 1000)
      })).filter(d => d.price != null);
      setChartData(prices);
      setSymbol(t);
    } catch (e) { setError("Errore connessione API."); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (chartData.length === 0) return;
    const rsi = calculateRSI(chartData, rsiPeriod);
    setRsiData(rsi);
    const { signalsList, supports, targets } = analyzeCycleMaster(chartData, rsi, oversoldLimit);
    setSignals([...signalsList].reverse());
    setSupportLevels(supports);
    setTargetLevels(targets);

    const canvas = canvasRef.current;
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

    // Disegno Target (Linee Rosse)
    ctx.setLineDash([3, 10]);
    targets.forEach(t => {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.beginPath(); ctx.moveTo(getX(t.index), getY(t.price)); ctx.lineTo(width, getY(t.price)); ctx.stroke();
    });

    // Disegno Supporti (Linee Verdi)
    ctx.setLineDash([5, 5]);
    supports.forEach(s => {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(width, getY(s.price)); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Linea Prezzo
    ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5;
    chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
    ctx.stroke();

    // Segnali
    signalsList.forEach(s => {
      const x = getX(s.index); const y = getY(s.price);
      ctx.fillStyle = s.stype === 'divergence' ? '#a855f7' : '#22c55e';
      ctx.beginPath(); ctx.arc(x, y, s.stype === 'divergence' ? 8 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    });

    // Disegno RSI
    const rsiCanvas = rsiCanvasRef.current;
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
          <Zap className="text-yellow-500 fill-yellow-500" size={24} />
          <h1 className="text-xl font-black tracking-tighter uppercase">CycleMaster <span className="text-blue-500 text-xs">V4 PRO</span></h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
          <input className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-l-md outline-none focus:border-blue-500 text-sm w-32 md:w-48" value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} />
          <button className="bg-blue-600 px-4 py-1.5 rounded-r-md hover:bg-blue-700"><Search size={18} /></button>
        </form>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{symbol} - Cicli & Target</h2>
              <div className="flex space-x-3 text-[9px] font-bold">
                <span className="flex items-center text-purple-400"><div className="w-2 h-2 bg-purple-500 rounded-full mr-1"></div> Divergenza</span>
                <span className="flex items-center text-green-400"><div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div> Supporto</span>
                <span className="flex items-center text-red-400"><div className="w-3 h-0.5 bg-red-500/30 border-t border-dashed mr-1"></div> Target TP</span>
              </div>
            </div>
            <div className="relative aspect-[21/9] bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={canvasRef} width={1200} height={500} className="w-full h-full" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Analisi Oscillatore RSI</h2>
            <div className="relative h-20 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={rsiCanvasRef} width={1000} height={100} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="space-y-4 flex flex-col">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase"><Settings size={14} className="mr-2"/> Setup Ciclo</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1 text-slate-500">Soglia Sensibilità ({oversoldLimit})</label>
                <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full accent-blue-500" />
              </div>
              <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                <p className="text-[10px] text-blue-300 leading-tight">
                  <ArrowUpRight size={12} className="inline mr-1" />
                  <strong>V4 Tip:</strong> I pallini viola indicano una divergenza, il segnale più affidabile per una ripartenza ciclica violenta.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col overflow-hidden min-h-[300px]">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase"><Bell size={14} className="mr-2 text-blue-500"/> Segnali Operativi</h3>
            <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {signals.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-[10px]">In attesa di dati...</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-2 rounded border transition-all ${
                    s.stype === 'divergence' ? 'bg-purple-900/20 border-purple-800/40' : 
                    s.stype === 'support' ? 'bg-blue-900/10 border-blue-800/30' : 'bg-green-900/10 border-green-800/30'
                  }`}>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                      <span>{s.date}</span>
                      <span className="text-slate-300">{s.price.toFixed(4)}</span>
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
