import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingUp, Search, Loader2, Info, Target } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]); // Livelli di partenza cicli precedenti
  const [rsiData, setRsiData] = useState([]);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);

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

  // Algoritmo di rilevamento "Inizio Ciclo" + Supporti Storici
  const analyzeCycles = (data, rsiValues, threshold) => {
    if (data.length < 5) return { signalsList: [], levels: [] };
    const signalsList = [];
    const detectedLevels = [];
    
    for (let i = 5; i < data.length - 1; i++) {
      const p2 = data[i-2].price;
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi = rsiValues[i];

      let isBuySignal = false;
      let signalMsg = "";

      // 1. LOGICA PRIMARIA: Rimbalzo su RSI Iper-venduto (Nuovo Ciclo)
      if (rsi !== null && rsi < threshold) {
        if (p1 < p2 && p0 > p1) {
          isBuySignal = true;
          signalMsg = "Inizio Nuovo Ciclo (RSI)";
          // Memorizziamo questo prezzo come livello di supporto per il futuro
          if (!detectedLevels.some(l => Math.abs(l.price - p1) / p1 < 0.005)) {
            detectedLevels.push({ price: p1, index: i - 1 });
          }
        }
      }

      // 2. LOGICA SECONDARIA: Ritorno al punto di partenza (Rimbalzo su Supporto Storico)
      if (!isBuySignal) {
        detectedLevels.forEach(level => {
          if (level.index < i - 10) { // Consideriamo solo livelli del passato
            const diff = Math.abs(p1 - level.price) / level.price;
            if (diff < 0.003 && p1 < p2 && p0 > p1) { // Prezzo vicino al supporto + accenno di rimbalzo
              isBuySignal = true;
              signalMsg = "Ripartenza su Supporto Storico";
            }
          }
        });
      }

      if (isBuySignal) {
        signalsList.push({
          index: i - 1,
          price: p1,
          type: 'BUY',
          date: data[i-1].time.toLocaleDateString('it-IT'),
          msg: signalMsg
        });
      }
    }
    return { signalsList, levels: detectedLevels };
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true);
    setError(null);
    try {
      const t = ticker.toUpperCase();
      const proxy = `/api/yahoo/${t}?interval=1d&range=1y`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error("Errore dati");
      const json = await res.json();
      const result = json.chart.result[0];
      const prices = result.indicators.quote[0].close.map((p, i) => ({
        price: p,
        time: new Date(result.timestamp[i] * 1000)
      })).filter(d => d.price != null);
      setChartData(prices);
      setSymbol(t);
    } catch (e) {
      setError("Impossibile connettersi a Yahoo. Riprova più tardi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (chartData.length === 0) return;

    const rsi = calculateRSI(chartData, rsiPeriod);
    setRsiData(rsi);
    const { signalsList, levels } = analyzeCycles(chartData, rsi, oversoldLimit);
    setSignals([...signalsList].reverse());
    setSupportLevels(levels);

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

    // Disegno Livelli di Supporto (Linee orizzontali tratteggiate)
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1;
    levels.forEach(level => {
      const y = getY(level.price);
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)'; // Verde tenue
      ctx.beginPath();
      ctx.moveTo(getX(level.index), y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Linea Prezzo
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
    ctx.stroke();

    // Segnali (Pallini Verdi)
    signalsList.forEach(s => {
      const x = getX(s.index);
      const y = getY(s.price);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    });

    // --- DISEGNO RSI ---
    const rsiCanvas = rsiCanvasRef.current;
    const rCtx = rsiCanvas.getContext('2d');
    rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
    rCtx.strokeStyle = '#334155';
    rCtx.beginPath();
    rCtx.moveTo(0, rsiCanvas.height * 0.35); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.35);
    rCtx.moveTo(0, rsiCanvas.height * 0.65); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.65);
    rCtx.stroke();
    rCtx.beginPath();
    rCtx.strokeStyle = '#a855f7';
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
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 font-sans">
      <header className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2">
          <Activity className="text-green-500" />
          <h1 className="text-xl font-bold italic tracking-tighter">CycleAnalyzer <span className="text-green-500 text-xs font-bold not-italic">V3.1 PRO</span></h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
          <input className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-l-md outline-none focus:border-green-500 text-sm" value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} />
          <button className="bg-green-600 px-4 py-1.5 rounded-r-md hover:bg-green-700 transition-colors">
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          </button>
        </form>
      </header>

      {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-xs">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{symbol} - Prezzo & Livelli Ciclici</h2>
              <div className="flex space-x-4 text-[10px]">
                <span className="flex items-center"><div className="w-3 h-0.5 bg-green-500/30 border-t border-dashed mr-1"></div> Supporto Storico</span>
                <span className="flex items-center text-green-400"><div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div> Inizio Ciclo</span>
              </div>
            </div>
            <div className="relative aspect-[21/9] bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={canvasRef} width={1200} height={500} className="w-full h-full" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">RSI (Relative Strength Index)</h2>
            <div className="relative h-20 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={rsiCanvasRef} width={1000} height={100} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase tracking-tighter"><Settings size={14} className="mr-2"/> Calibrazione</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1">Soglia Nuovi Cicli ({oversoldLimit})</label>
                <input type="range" min="15" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full accent-green-500" />
              </div>
              <div className="p-2 bg-blue-900/10 border border-blue-800/20 rounded text-[9px] text-slate-400">
                L'app memorizza i livelli di prezzo dove sono nati i cicli precedenti e genera nuovi segnali se il prezzo vi ritorna rimbalzando.
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col max-h-[450px]">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center uppercase tracking-tighter"><Target size={14} className="mr-2 text-green-500"/> Punti di Ripartenza</h3>
            <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {signals.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-[10px]">Nessun segnale rilevato</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-2 rounded border transition-all ${s.msg.includes('Storico') ? 'bg-blue-900/10 border-blue-800/30' : 'bg-green-900/10 border-green-800/30'}`}>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                      <span>{s.date}</span>
                      <span className="text-slate-300">{s.price.toFixed(4)}</span>
                    </div>
                    <p className={`text-[10px] font-bold ${s.msg.includes('Storico') ? 'text-blue-400' : 'text-green-400'}`}>{s.msg}</p>
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
