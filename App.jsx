import React, { useState, useEffect, useRef } from 'react';
import { Activity, Bell, Settings, TrendingUp, Search, Loader2, Info, BarChart2 } from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [rsiData, setRsiData] = useState([]);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); // Soglia iper-venduto
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [error, setError] = useState(null);

  // Calcolo RSI (Relative Strength Index)
  const calculateRSI = (data, period) => {
    let rsi = new Array(data.length).fill(null);
    if (data.length < period + 1) return rsi;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      let diff = data[i].price - data[i - 1].price;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = period + 1; i < data.length; i++) {
      let diff = data[i].price - data[i - 1].price;
      let gain = diff >= 0 ? diff : 0;
      let loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rsi[i] = 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  };

  // Algoritmo di rilevamento "Inizio Ciclo" (Trough Detection)
  const analyzeCycles = (data, rsiValues, threshold) => {
    if (data.length < 5) return [];
    const signalsList = [];
    
    for (let i = 2; i < data.length - 1; i++) {
      const p2 = data[i-2].price;
      const p1 = data[i-1].price;
      const p0 = data[i].price; // Punto corrente
      const rsi = rsiValues[i];

      // LOGICA DI RIMBALZO (V-SHAPE):
      // 1. L'RSI deve essere in zona "Iper-venduto" (vicino al fondo)
      // 2. Il prezzo deve mostrare un'inversione (p1 era il minimo, p0 sta salendo)
      if (rsi !== null && rsi < threshold) {
        if (p1 < p2 && p0 > p1) {
          signalsList.push({
            index: i - 1,
            price: p1,
            type: 'BUY',
            date: data[i-1].time.toLocaleDateString('it-IT'),
            msg: "Ripartenza Ciclica (Bottom)"
          });
        }
      }
      
      // LOGICA DI VENDITA (OPPOSTA):
      if (rsi !== null && rsi > (100 - threshold + 10)) {
        if (p1 > p2 && p0 < p1) {
          signalsList.push({
            index: i - 1,
            price: p1,
            type: 'SELL',
            date: data[i-1].time.toLocaleDateString('it-IT'),
            msg: "Esaurimento Ciclo (Top)"
          });
        }
      }
    }
    return signalsList;
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true);
    setError(null);
    try {
      const t = ticker.toUpperCase();
      const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1y`;
      const proxy = `/api/yahoo/${t}?interval=1d&range=1y`;
      
      const res = await fetch(proxy);
      if (!res.ok) throw new Error("Server occupato, riprova");
      
      const json = await res.json();
      const result = json.chart.result[0];
      const prices = result.indicators.quote[0].close.map((p, i) => ({
        price: p,
        time: new Date(result.timestamp[i] * 1000)
      })).filter(d => d.price != null);

      setChartData(prices);
      setSymbol(t);
    } catch (e) {
      setError("Errore caricamento dati reali.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (chartData.length === 0) return;

    // Calcolo indicatori
    const rsi = calculateRSI(chartData, rsiPeriod);
    setRsiData(rsi);
    const sigs = analyzeCycles(chartData, rsi, oversoldLimit);
    setSignals([...sigs].reverse());

    // --- DISEGNO GRAFICO PREZZO ---
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

    // Linea Prezzo
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
    ctx.stroke();

    // Segnali
    sigs.forEach(s => {
      ctx.fillStyle = s.type === 'BUY' ? '#22c55e' : '#ef4444';
      ctx.beginPath();
      const x = getX(s.index);
      const y = getY(s.price);
      if (s.type === 'BUY') {
        ctx.arc(x, y, 6, 0, Math.PI * 2); // Cerchio verde nei punti richiesti
      } else {
        ctx.moveTo(x-5, y-5); ctx.lineTo(x+5, y+5);
        ctx.moveTo(x+5, y-5); ctx.lineTo(x-5, y+5); // X rossa sui top
      }
      ctx.fill();
      if (s.type === 'BUY') {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    });

    // --- DISEGNO RSI ---
    const rsiCanvas = rsiCanvasRef.current;
    const rCtx = rsiCanvas.getContext('2d');
    rCtx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
    
    rCtx.strokeStyle = '#475569';
    rCtx.beginPath();
    rCtx.moveTo(0, rsiCanvas.height * 0.3); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.3);
    rCtx.moveTo(0, rsiCanvas.height * 0.7); rCtx.lineTo(rsiCanvas.width, rsiCanvas.height * 0.7);
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
          <h1 className="text-xl font-bold">CycleDetector <span className="text-green-500 text-xs">V3</span></h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
          <input className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-l-md outline-none" value={inputSymbol} onChange={e => setInputSymbol(e.target.value)} />
          <button className="bg-green-600 px-4 py-1 rounded-r-md hover:bg-green-700 transition-colors">
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">{symbol} - Grafico Prezzi</h2>
            <div className="relative aspect-[21/9] bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={canvasRef} width={1000} height={400} className="w-full h-full" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Oscillatore RSI (Rilevatore di Fondo)</h2>
            <div className="relative h-24 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
              <canvas ref={rsiCanvasRef} width={1000} height={100} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center"><Settings size={14} className="mr-2"/> FILTRO CICLICO</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1">Soglia Ipervenduto ({oversoldLimit})</label>
                <input type="range" min="10" max="50" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full accent-green-500" />
                <p className="text-[9px] text-slate-500 mt-1 italic">Più è bassa, più il segnale cercherà "fondi" profondi.</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col max-h-[400px]">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center"><Bell size={14} className="mr-2 text-green-500"/> SEGNALI DI RIPARTENZA</h3>
            <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {signals.filter(s => s.type === 'BUY').map((s, i) => (
                <div key={i} className="p-2 rounded bg-green-900/10 border border-green-800/30">
                  <div className="flex justify-between text-[10px] text-green-400 font-mono">
                    <span>{s.date}</span>
                    <span>{s.price.toFixed(4)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-200 mt-1">Inizio Ciclo Rialzista</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 3px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}} />
    </div>
  );
}
