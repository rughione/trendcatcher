import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Bell, Settings, TrendingUp, Search, Loader2, 
  Info, Target, Zap, ArrowUpRight, BarChart3, AlertTriangle, 
  RefreshCw, Clock, TrendingDown, SplitSquareVertical, Timer
} from 'lucide-react';

export default function App() {
  const canvasRef = useRef(null);
  const rsiCanvasRef = useRef(null);
  const [chartData, setChartData] = useState([]); 
  const [signals, setSignals] = useState([]);
  const [supportLevels, setSupportLevels] = useState([]); 
  const [resistanceLevels, setResistanceLevels] = useState([]); 
  const [midCycleLines, setMidCycleLines] = useState([]); 
  const [avgCycleDuration, setAvgCycleDuration] = useState(0); // Durata media in candele
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversoldLimit, setOversoldLimit] = useState(35); 
  const [overboughtLimit, setOverboughtLimit] = useState(65); 
  const [isLoading, setIsLoading] = useState(false);
  const [symbol, setSymbol] = useState('EURUSD=X'); 
  const [inputSymbol, setInputSymbol] = useState('EURUSD=X');
  const [timeframe, setTimeframe] = useState('1d'); 
  const [error, setError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  const generateSimulatedData = (ticker) => {
    const newData = [];
    let currentPrice = ticker.toUpperCase().includes('BTC') ? 65000 : 1.09;
    const today = new Date();
    const points = timeframe === '1d' ? 260 : 300;
    for (let i = 0; i < points; i++) {
      const macro = Math.sin(i / 30) * (currentPrice * 0.1) + Math.cos(i / 50) * (currentPrice * 0.05);
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
    setError("Utilizzo dati simulati causa timeout server.");
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

  // Algoritmo V9 con Proiezione Temporale
  const analyzeCyclesV9 = (data, rsiValues, lowThresh, highThresh) => {
    if (data.length < 20) return { signalsList: [], supports: [], resistances: [], midLines: [], avgDur: 0 };
    const signalsList = [];
    const supports = [];
    const resistances = [];
    const midLines = [];
    const buyIndices = [];
    
    // Passo 1: Trova tutti i Buy (Inizi Ciclo)
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];
      let foundBuy = false;

      // Divergenza o Supporto o Oversold
      const isDivergence = (() => {
        for (let prev = i - 5; prev > i - 40; prev--) {
          if (data[prev] && data[prev-1] && data[prev].price < data[prev-1].price && data[prev].price < data[prev+1].price) {
            if (data[i-1].price <= data[prev].price && rsiValues[i-1] > rsiValues[prev] && rsiValues[i-1] < 45) return true;
          }
        }
        return false;
      })();

      const isSupport = supports.some(l => Math.abs(p1 - l.price)/l.price < 0.0022);
      const isOversold = rsi1 < lowThresh;

      if ((isDivergence || isSupport || isOversold) && p0 > p1) {
        foundBuy = true;
        buyIndices.push(i - 1);
        signalsList.push({ index: i - 1, price: p1, type: 'BUY', stype: isDivergence ? 'divergence' : (isSupport ? 'support' : 'standard'), 
          msg: isDivergence ? "Inizio Ciclo (Divergenza)" : "Inizio Ciclo Rialzista", 
          date: data[i-1].time.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })});
        if (!supports.some(s => Math.abs(s.price - p1)/p1 < 0.004)) supports.push({price: p1, index: i-1});
      }
    }

    // Passo 2: Calcola durata media
    let avgDur = 0;
    if (buyIndices.length >= 2) {
      let sum = 0;
      for (let k = 1; k < buyIndices.length; k++) sum += (buyIndices[k] - buyIndices[k-1]);
      avgDur = Math.floor(sum / (buyIndices.length - 1));
    } else {
      avgDur = timeframe === '1d' ? 40 : 60; // Default statistico se pochi dati
    }

    // Passo 3: Identifica Giro di Boa con filtro temporale (Regola del 40%)
    let lastBuyIdx = -1;
    for (let i = 10; i < data.length - 1; i++) {
      const p1 = data[i-1].price;
      const p0 = data[i].price;
      const rsi1 = rsiValues[i-1];
      
      if (buyIndices.includes(i-1)) lastBuyIdx = i - 1;

      // Solo se non è un buy, cerchiamo un sell
      if (!buyIndices.includes(i-1) && lastBuyIdx !== -1) {
        const candlesFromStart = i - 1 - lastBuyIdx;
        const isDivergenceSell = (() => {
          for (let prev = i - 5; prev > i - 40; prev--) {
            if (data[prev] && data[prev-1] && data[prev].price > data[prev-1].price && data[prev].price > data[prev+1].price) {
              if (data[i-1].price >= data[prev].price && rsiValues[i-1] < rsiValues[prev] && rsiValues[i-1] > 55) return true;
            }
          }
          return false;
        })();

        const isRes = resistances.some(l => Math.abs(p1 - l.price)/l.price < 0.0022);
        const isOverbought = rsi1 > highThresh;

        if ((isDivergenceSell || isRes || isOverbought) && p0 < p1) {
          // FILTRO TEMPORALE: Una metà ciclo non può avvenire troppo presto (es < 35% della durata media)
          const minWait = avgDur * 0.35;
          const isMidPoint = candlesFromStart >= minWait && !midLines.some(m => m.index > lastBuyIdx);

          if (isMidPoint) {
            midLines.push({ index: i - 1, price: p1 });
            signalsList.push({ index: i - 1, price: p1, type: 'SELL', isBoa: true, stype: 'standard', msg: "GIRO DI BOA (Tempo Statistico)", 
              date: data[i-1].time.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })});
          } else {
            signalsList.push({ index: i - 1, price: p1, type: 'SELL', isBoa: false, stype: 'standard', msg: "Ritracciamento Interno", 
              date: data[i-1].time.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })});
          }
          if (!resistances.some(s => Math.abs(s.price - p1)/p1 < 0.004)) resistances.push({price: p1, index: i-1});
        }
      }
    }

    return { signalsList, supports, resistances, midLines, avgDur };
  };

  const fetchYahooData = async (ticker) => {
    setIsLoading(true); setError(null);
    const range = timeframe === '1d' ? '1y' : '1mo';
    const interval = timeframe === '1d' ? '1d' : '60m';
    try {
      const t = ticker.toUpperCase();
      const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=${interval}&range=${range}`;
      const proxy = `/api/yahoo/${t}?interval=${interval}&range=${range}`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const result = json.chart.result[0];
      const prices = result.timestamp.map((ts, i) => ({
        price: result.indicators.quote[0].close[i], time: new Date(ts * 1000)
      })).filter(d => d.price != null);
      setChartData(prices); setSymbol(t);
    } catch (e) { generateSimulatedData(ticker); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (chartData.length === 0) return;
    const rsi = calculateRSI(chartData, rsiPeriod);
    const { signalsList, supports, resistances, midLines, avgDur } = analyzeCyclesV9(chartData, rsi, oversoldLimit, overboughtLimit);
    setSignals([...signalsList].sort((a,b) => b.index - a.index));
    setSupportLevels(supports); setResistanceLevels(resistances); setMidCycleLines(midLines); setAvgCycleDuration(avgDur);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const prices = chartData.map(d => d.price);
      const minP = Math.min(...prices); const maxP = Math.max(...prices);
      const range = (maxP - minP) * 1.15; const padding = (maxP - minP) * 0.07;
      const getX = (i) => (i / (chartData.length - 1)) * canvas.width;
      const getY = (v) => canvas.height - ((v - (minP - padding)) / range) * canvas.height;

      // 1. Proiezione Prossimo Minimo (Zona Sfumata)
      const lastBuy = signalsList.find(s => s.type === 'BUY');
      if (lastBuy && avgDur > 0) {
        const projectedIdx = lastBuy.index + avgDur;
        const xProj = getX(projectedIdx);
        const grad = ctx.createLinearGradient(xProj - 20, 0, xProj + 20, 0);
        grad.addColorStop(0, 'rgba(34, 197, 94, 0)');
        grad.addColorStop(0.5, 'rgba(34, 197, 94, 0.1)');
        grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(xProj - 30, 0, 60, canvas.height);
        
        ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
        ctx.beginPath(); ctx.moveTo(xProj, 0); ctx.lineTo(xProj, canvas.height); ctx.stroke();
      }

      // 2. Linee Verticali Arancioni (Boa)
      ctx.setLineDash([10, 10]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
      midLines.forEach(m => { ctx.beginPath(); ctx.moveTo(getX(m.index), 0); ctx.lineTo(getX(m.index), canvas.height); ctx.stroke(); });

      // 3. Griglie Orizzontali
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
      supports.forEach(s => { ctx.strokeStyle = 'rgba(34, 197, 94, 0.1)'; ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(canvas.width, getY(s.price)); ctx.stroke(); });
      resistances.forEach(s => { ctx.strokeStyle = 'rgba(239, 68, 68, 0.1)'; ctx.beginPath(); ctx.moveTo(getX(s.index), getY(s.price)); ctx.lineTo(canvas.width, getY(s.price)); ctx.stroke(); });
      ctx.setLineDash([]);

      // 4. Prezzo
      ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
      chartData.forEach((d, i) => i === 0 ? ctx.moveTo(getX(i), getY(d.price)) : ctx.lineTo(getX(i), getY(d.price)));
      ctx.stroke();

      // 5. Segnali
      signalsList.forEach(s => {
        const x = getX(s.index), y = getY(s.price);
        ctx.fillStyle = s.type === 'BUY' ? (s.stype === 'divergence' ? '#a855f7' : '#22c55e') : (s.isBoa ? '#f97316' : '#ef4444');
        ctx.beginPath(); ctx.arc(x, y, s.isBoa ? 6 : 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      });
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
          <Timer className="text-blue-400" size={18} />
          <h1 className="text-md font-black tracking-tighter uppercase italic">CycleMaster <span className="text-blue-500 text-[9px] not-italic font-bold">V9 TIME PROJECTION</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-700">
            <button onClick={() => setTimeframe('1d')} className={`px-3 py-1 text-[10px] font-bold rounded ${timeframe === '1d' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>1G</button>
            <button onClick={() => setTimeframe('1h')} className={`px-3 py-1 text-[10px] font-bold rounded ${timeframe === '1h' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>1H</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); fetchYahooData(inputSymbol); }} className="flex">
            <input className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-l-md outline-none focus:border-blue-500 text-xs w-24 md:w-40 text-white" value={inputSymbol} onChange={e => setInputSymbol(e.target.value.toUpperCase())} />
            <button className="bg-blue-600 px-3 py-1 rounded-r-md hover:bg-blue-700"><Search size={14} /></button>
          </form>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        <div className="flex-[3] flex flex-col gap-3 min-h-0">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl relative min-h-0">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{symbol} <span className="text-blue-500 ml-1">Avg Cycle: {avgCycleDuration} bars</span></span>
                <div className="flex gap-3 text-[8px] font-bold uppercase">
                   <span className="flex items-center text-green-500/50"><div className="w-1.5 h-1.5 bg-green-500/20 border border-green-500 rounded mr-1"></div> Prossimo Minimo</span>
                   <span className="flex items-center text-orange-400"><div className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-1"></div> Metà Ciclo</span>
                </div>
             </div>
             <div className="w-full h-[calc(100%-25px)] bg-slate-950 rounded border border-slate-800/50">
                <canvas ref={canvasRef} className="w-full h-full" />
                {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50"><Loader2 className="animate-spin text-blue-500" size={24} /></div>}
             </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 min-h-0 lg:w-72">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shrink-0 shadow-lg">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><Settings size={12} className="mr-1"/> Configurazione</h3>
            <div className="space-y-3">
              <input type="range" min="20" max="45" value={oversoldLimit} onChange={e => setOversoldLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg accent-green-500 cursor-pointer" />
              <input type="range" min="55" max="80" value={overboughtLimit} onChange={e => setOverboughtLimit(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg accent-red-500 cursor-pointer" />
            </div>
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col min-h-0 overflow-hidden shadow-2xl font-sans">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase flex items-center"><SplitSquareVertical size={12} className="mr-1 text-blue-500"/> Analisi Fasi</h3>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {signals.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-[9px] uppercase italic">In attesa di dati...</div>
              ) : (
                signals.map((s, i) => (
                  <div key={i} className={`p-1.5 rounded border text-[9px] ${
                    s.isBoa ? 'bg-orange-950/30 border-orange-500/50' :
                    (s.type === 'SELL' ? 'bg-red-950/20 border-red-900/30' : 'bg-green-950/20 border-green-800/30')
                  }`}>
                    <div className="flex justify-between font-mono text-slate-500 text-[7px] mb-0.5">
                      <span>{s.date}</span>
                      <span className="text-slate-300 font-bold">{s.price.toFixed(4)}</span>
                    </div>
                    <p className={`font-bold leading-tight ${
                      s.isBoa ? 'text-orange-400' : (s.type === 'SELL' ? 'text-red-400' : 'text-green-400')
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
