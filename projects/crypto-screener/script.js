// ============================================================
//  CRYPTO PRO SCREENER v2
//  Живой скринер: Binance REST + WebSocket, Lightweight Charts v5
// ============================================================

// ==================== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ====================
const activeCharts = {};         // { cardId: { chart, series, volSeries, ws, symbol, interval, ro, retryTimer } }
const cardMetrics = new Map();   // { symbol: { price, change24, changeTf, volume24, volRatio, momentum, spike, candles, ... } }
let cardCounter = 0;
let targetCardForChange = null;
let isAudioEnabled = true;
const alertedCoins = new Set();
let currentView = 'grid';        // 'table' | 'grid'
let currentPreset = 'all';
let wsLatency = 0;
let wsOnline = false;
let restOnline = true;
let audioCtx = null;
let previewChart = null;
let previewTf = '5m';
let previewSymbol = null;
let pairCache = null;            // список пар USDT с биржи (для модалки)
let netRetrying = false;

// Сохраняемая раскладка: [{ symbol, tf }]
let layout = [];
// Избранное
let favorites = new Set();

const DEFAULT_LAYOUT = [
    { symbol: 'BTC/USDT', tf: '5m' },
    { symbol: 'ETH/USDT', tf: '5m' },
    { symbol: 'SOL/USDT', tf: '5m' },
    { symbol: 'BNB/USDT', tf: '5m' },
];

const DEFAULT_COINS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
    'TON/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'NEAR/USDT',
    'SUI/USDT', 'LINK/USDT', 'DOT/USDT', 'LTC/USDT', 'PEPE/USDT'
];

// ==================== ХРАНИЛИЩЕ НАСТРОЕК ====================
const STORE_KEY = 'screener_v2';

function loadStore() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        isAudioEnabled = raw.audio !== false;
        favorites = new Set(raw.favorites || []);
        layout = Array.isArray(raw.layout) && raw.layout.length ? raw.layout : null;
    } catch (e) { /* пустое хранилище */ }
}

function saveStore() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
            audio: isAudioEnabled,
            favorites: Array.from(favorites),
            layout: layout,
        }));
    } catch (e) { /* приватный режим */ }
}

function syncLayout() {
    layout = Object.values(activeCharts).map(c => ({ symbol: c.symbol, tf: c.interval }));
    saveStore();
}

// ==================== АУДИО УВЕДОМЛЕНИЯ ====================
function playAlertSound() {
    if (!isAudioEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) { console.warn('Audio error:', e); }
}

// ==================== ТОСТЫ ====================
function showToast(symbol, dir, ratio) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = 'toast ' + dir;
    el.innerHTML =
        '<div><div class="t-title">' + (dir === 'up' ? '▲' : '▼') + ' ' + getBaseTicker(symbol) + ' — всплеск объёма ' + ratio.toFixed(1) + 'x</div>' +
        '<div class="t-sub">' + (dir === 'up' ? 'Покупатели разогнали объём' : 'Продавцы разогнали объём') + ' · клик — график</div></div>' +
        '<button class="t-close" aria-label="Закрыть">×</button>';

    el.addEventListener('click', (e) => {
        if (e.target.classList.contains('t-close')) { dismiss(); return; }
        dismiss();
        openPreview(symbol);
    });

    stack.appendChild(el);
    while (stack.children.length > 4) stack.firstChild.remove();

    const timer = setTimeout(dismiss, 6000);
    function dismiss() {
        clearTimeout(timer);
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 260);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ====================
function formatSymbol(ticker) {
    return ticker ? ticker.replace('/', '').toUpperCase() : '';
}

function getBaseTicker(symbol) {
    return symbol ? symbol.split('/')[0] : '';
}

function formatNumber(num) {
    if (!num || isNaN(num) || num === 0) return '—';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toFixed(2);
}

function formatPrice(price) {
    if (!price || isNaN(price)) return '—';
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
}

function formatCount(n) {
    if (!n || isNaN(n)) return '—';
    return n.toLocaleString('ru-RU');
}

function themeVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ==================== РАСЧЕТ MOMENTUM ====================
function calculateMomentum(candles) {
    if (!candles || candles.length < 3) return { direction: 'neutral', strength: 'neutral', arrow: '→' };

    const last3 = candles.slice(-3);
    const c1 = last3[0].close, c2 = last3[1].close, c3 = last3[2].close;
    const change1 = ((c2 - c1) / c1) * 100;
    const change2 = ((c3 - c2) / c2) * 100;
    const totalChange = change1 + change2;

    let direction = 'neutral', strength = 'neutral', arrow = '→';

    if (totalChange > 1.5) {
        direction = 'up';
        arrow = '▲';
        strength = totalChange > 5 ? 'strong' : 'neutral';
    } else if (totalChange < -1.5) {
        direction = 'down';
        arrow = '▼';
        strength = totalChange < -5 ? 'strong' : 'neutral';
    }

    return { direction, strength, arrow, totalChange: totalChange.toFixed(2) };
}

// ==================== REST API BINANCE ====================
async function fetchHistoricalKlines(symbol, interval = '5m', limit = 100) {
    const binanceSymbol = formatSymbol(symbol);
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        setRestStatus(true);

        const candles = raw.map(item => ({
            time: Math.floor(item[0] / 1000),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
        }));

        const volumes = raw.map(item => ({
            time: Math.floor(item[0] / 1000),
            value: parseFloat(item[5]),
            color: parseFloat(item[4]) >= parseFloat(item[1]) ? 'rgba(0,208,132,0.3)' : 'rgba(255,71,87,0.3)'
        }));

        return { candles, volumes, raw };
    } catch (e) {
        console.error(`Fetch error ${symbol}:`, e);
        setRestStatus(false);
        return { candles: [], volumes: [], raw: [] };
    }
}

async function fetch24hTicker(symbol) {
    const binanceSymbol = formatSymbol(symbol);
    try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`);
        if (!res.ok) return null;
        setRestStatus(true);
        return await res.json();
    } catch (e) {
        setRestStatus(false);
        return null;
    }
}

// Список всех спотовых пар USDT (для модалки выбора)
async function fetchUsdtPairs() {
    if (pairCache) return pairCache;
    try {
        const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        pairCache = (j.symbols || [])
            .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.isSpotTradingAllowed)
            .map(s => s.symbol)
            .sort();
    } catch (e) {
        pairCache = null;
    }
    return pairCache;
}

// ==================== СТАТУС СЕТИ ====================
let restFailCount = 0;

function setRestStatus(ok) {
    restOnline = ok;
    const banner = document.getElementById('net-banner');
    if (!banner) return;
    if (ok) { restFailCount = 0; banner.classList.remove('show'); netRetrying = false; }
    else {
        restFailCount++;
        if (restFailCount >= 2) banner.classList.add('show');
    }
}

function updateStatus() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;

    const anyWs = Object.values(activeCharts).some(c => c.ws && c.ws.readyState === WebSocket.OPEN);

    if (anyWs) {
        wsOnline = true;
        dot.classList.add('online');
        text.textContent = `WS: ${wsLatency}ms`;
        text.style.color = 'var(--accent-color)';
    } else if (restOnline) {
        wsOnline = false;
        dot.classList.remove('online');
        text.textContent = 'REST: ок';
        text.style.color = 'var(--text-muted)';
    } else {
        wsOnline = false;
        dot.classList.remove('online');
        text.textContent = 'ОФФЛАЙН';
        text.style.color = 'var(--neon-red)';
    }
}

// ==================== РАСЧЕТ И ОБНОВЛЕНИЕ МЕТРИК ====================
async function updateMetrics(symbol, interval = '5m') {
    const threshold = parseFloat(document.getElementById('spike-threshold')?.value || 3.0);

    const [tickerData, klineData] = await Promise.all([
        fetch24hTicker(symbol),
        fetchHistoricalKlines(symbol, interval, 30)
    ]);

    if (!tickerData || !tickerData.lastPrice) return null;

    const { candles, raw } = klineData;
    let volRatio = 1.0, isSpike = false, spikeDir = 'neutral';

    if (raw && raw.length >= 21) {
        const current = raw[raw.length - 1];
        const currentVol = parseFloat(current[5]);
        const prev20 = raw.slice(-21, -1);
        const avgVol = prev20.reduce((a, c) => a + parseFloat(c[5]), 0) / 20;

        if (avgVol > 0) {
            volRatio = currentVol / avgVol;
            if (volRatio >= threshold) {
                isSpike = true;
                spikeDir = parseFloat(current[4]) >= parseFloat(current[1]) ? 'up' : 'down';
            }
        }
    }

    const momentum = calculateMomentum(candles);
    const price = parseFloat(tickerData.lastPrice);
    const change24 = parseFloat(tickerData.priceChangePercent);

    let changeTf = 0;
    if (candles && candles.length > 0) {
        const last = candles[candles.length - 1];
        changeTf = ((last.close - last.open) / last.open) * 100;
    }

    const prev = cardMetrics.get(symbol);
    const metrics = {
        symbol,
        price,
        prevPrice: prev ? prev.price : price,
        change24,
        changeTf,
        volume24: parseFloat(tickerData.quoteVolume),
        volRatio,
        isSpike,
        spikeDir,
        momentum,
        trades24: parseInt(tickerData.count),
        candles,
        tf: interval,
        updated: Date.now(),
    };

    cardMetrics.set(symbol, metrics);

    // АЛЕРТ: всплеск объёма — звук + тост (один раз на монету)
    if (isSpike && !alertedCoins.has(symbol)) {
        alertedCoins.add(symbol);
        playAlertSound();
        showToast(symbol, spikeDir, volRatio);
    } else if (!isSpike) {
        alertedCoins.delete(symbol);
    }

    return metrics;
}

// ==================== ФИЛЬТРЫ / ПРЕСЕТЫ / СОРТИРОВКА ====================
function applyFilters(rows) {
    const filterChange = document.getElementById('filter-change')?.value || 'all';
    const filterVolume = document.getElementById('filter-volume')?.value || 'all';
    const filterVolatility = document.getElementById('filter-volatility')?.value || 'all';

    return rows.filter(m => {
        if (filterChange === 'up' && m.change24 <= 0) return false;
        if (filterChange === 'down' && m.change24 >= 0) return false;
        if (filterChange === 'pump5' && m.change24 < 5) return false;
        if (filterChange === 'dump5' && m.change24 > -5) return false;

        if (filterVolume === 'high' && m.volume24 < 1e6) return false;
        if (filterVolume === 'spike' && !m.isSpike) return false;

        const volatility = Math.abs(m.change24);
        if (filterVolatility === 'high' && volatility < 3) return false;
        if (filterVolatility === 'extreme' && volatility < 10) return false;

        if (currentPreset === 'pumps' && m.changeTf < 2) return false;
        if (currentPreset === 'accum' && m.volRatio < 2) return false;
        if (currentPreset === 'volatile' && Math.abs(m.change24) < 5) return false;
        if (currentPreset === 'fav' && !favorites.has(m.symbol)) return false;

        return true;
    });
}

function sortedRows(rows) {
    const sortTh = document.querySelector('.screener-table th.sort-asc, .screener-table th.sort-desc');
    if (!sortTh) return rows;
    const key = sortTh.dataset.sort;
    const asc = sortTh.classList.contains('sort-asc');
    return rows.slice().sort((a, b) => {
        let va = a[key], vb = b[key];
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        va = va || 0; vb = vb || 0;
        return asc ? (va - vb) : (vb - va);
    });
}

function passPreset(m) {
    if (currentPreset === 'pumps' && m.changeTf < 2) return false;
    if (currentPreset === 'accum' && m.volRatio < 2) return false;
    if (currentPreset === 'volatile' && Math.abs(m.change24) < 5) return false;
    if (currentPreset === 'fav' && !favorites.has(m.symbol)) return false;
    return true;
}

// ==================== ОТРИСОВКА ТАБЛИЦЫ ====================
function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    const all = Array.from(cardMetrics.values());
    const rows = sortedRows(applyFilters(all));
    const shown = document.getElementById('rows-shown');
    if (shown) shown.textContent = all.length ? `${rows.length} из ${all.length} монет` : '— монет';

    if (rows.length === 0) {
        const msg = all.length === 0
            ? 'Загружаем метрики с Binance...'
            : 'Ничего не найдено — ослабьте фильтры или выберите пресет «Все».';
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 24px; color: var(--text-muted);">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(m => {
        const trendColor = m.candles && m.candles.length > 1 && m.candles[m.candles.length - 1].close >= m.candles[0].close
            ? 'var(--neon-green)' : 'var(--neon-red)';
        return `
        <tr data-symbol="${m.symbol}" onclick="openPreview('${m.symbol}')">
            <td>
                <div class="ticker-cell">
                    <button class="fav-btn ${favorites.has(m.symbol) ? 'active' : ''}" title="В избранное" onclick="event.stopPropagation(); toggleFav('${m.symbol}', this)">★</button>
                    <div class="ticker-icon">${getBaseTicker(m.symbol)[0] || 'C'}</div>
                    ${m.symbol}
                </div>
            </td>
            <td>${formatPrice(m.price)}</td>
            <td class="${m.change24 >= 0 ? 'positive' : 'negative'}">
                ${m.change24 >= 0 ? '+' : ''}${m.change24.toFixed(2)}%
            </td>
            <td class="${m.changeTf >= 0 ? 'positive' : 'negative'}">
                ${m.changeTf >= 0 ? '+' : ''}${m.changeTf.toFixed(2)}%
            </td>
            <td>${formatNumber(m.volume24)}</td>
            <td>
                ${m.isSpike
                    ? `<span class="vol-badge spike-${m.spikeDir}">${m.volRatio.toFixed(1)}x ${m.spikeDir === 'up' ? '▲' : '▼'}</span>`
                    : `${m.volRatio.toFixed(1)}x`
                }
            </td>
            <td>
                <div class="momentum">
                    <span class="momentum-arrow ${m.momentum.direction === 'up' ? 'positive' : m.momentum.direction === 'down' ? 'negative' : ''}">
                        ${m.momentum.arrow}
                    </span>
                    <span class="momentum-label momentum-${m.momentum.strength}">
                        ${m.momentum.strength.toUpperCase()}
                    </span>
                </div>
            </td>
            <td class="spark-cell"><canvas data-spark="${m.symbol}" width="90" height="26" style="color:${trendColor}"></canvas></td>
            <td>${formatCount(m.trades24)}</td>
            <td><button class="table-chart-btn" onclick="event.stopPropagation(); openPreview('${m.symbol}')">График</button></td>
        </tr>`;
    }).join('');

    drawSparks();
}

// Спарклайны: тренд за последние 30 свечей
function drawSparks() {
    document.querySelectorAll('canvas[data-spark]').forEach(cv => {
        const m = cardMetrics.get(cv.dataset.spark);
        if (!m || !m.candles || m.candles.length < 2) return;
        const ctx = cv.getContext('2d');
        const w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);

        const closes = m.candles.map(c => c.close);
        const min = Math.min(...closes), max = Math.max(...closes);
        const range = (max - min) || 1;
        const step = w / (closes.length - 1);

        ctx.beginPath();
        closes.forEach((c, i) => {
            const x = i * step;
            const y = h - 3 - ((c - min) / range) * (h - 6);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = cv.style.color || 'var(--neon-green)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // точка последней цены
        const ly = h - 3 - ((closes[closes.length - 1] - min) / range) * (h - 6);
        ctx.beginPath();
        ctx.arc(w - 2, ly, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    });
}

// ==================== ИЗБРАННОЕ ====================
function toggleFav(symbol, btn) {
    if (favorites.has(symbol)) favorites.delete(symbol); else favorites.add(symbol);
    saveStore();
    document.querySelectorAll(`.fav-btn`).forEach(b => {
        const sym = b.closest('tr')?.dataset.symbol;
        if (sym === symbol) b.classList.toggle('active', favorites.has(symbol));
    });
    renderTable();
    updateTopMovers();
    // карточка без метрик тоже могла быть в пресете fav — перерисуем сетку
    applyGridPreset();
}

// ==================== ОПОВЕЩЕНИЯ В TOP MOVERS ====================
function updateTopMovers() {
    const tape = document.getElementById('top-movers-tape');
    if (!tape || cardMetrics.size === 0) return;

    const sorted = Array.from(cardMetrics.values())
        .sort((a, b) => Math.abs(b.change24) - Math.abs(a.change24))
        .slice(0, 6);

    const html = sorted.map(m => {
        const isUp = m.change24 >= 0;
        return `<span class="mover-item ${isUp ? 'up' : 'down'}" onclick="openPreview('${m.symbol}')">
            <span class="mover-ticker">${getBaseTicker(m.symbol)}</span>
            ${isUp ? '+' : ''}${m.change24.toFixed(2)}%
        </span>`;
    }).join('');

    tape.innerHTML = html + html + html;
}

// ==================== ГРАФИКИ В РЕАЛЬНОМ ВРЕМЕНИ (v5 API) ====================
function chartColors() {
    return {
        grid: themeVar('--border-color') || '#1a1b22',
        text: '#6b6d78',
    };
}

async function initLiveChart(containerId, symbol, interval = '5m') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const prev = activeCharts[containerId];
    if (prev) {
        if (prev.retryTimer) clearTimeout(prev.retryTimer);
        if (prev.ws) { try { prev.ws.onclose = null; prev.ws.close(); } catch (e) {} }
        if (prev.ro) prev.ro.disconnect();
        if (prev.chart) { try { prev.chart.remove(); } catch (e) {} }
        delete activeCharts[containerId];
    }

    const cc = chartColors();

    const chart = LightweightCharts.createChart(container, {
        autoSize: true,
        layout: { background: { color: 'transparent' }, textColor: cc.text },
        grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
        timeScale: { borderColor: cc.grid, timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: cc.grid },
    });

    // v5: серии создаются через addSeries + определение
    const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#00d084', downColor: '#ff4757',
        borderVisible: false,
        wickUpColor: '#00d084', wickDownColor: '#ff4757'
    });

    const volSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const { candles, volumes } = await fetchHistoricalKlines(symbol, interval, 100);
    if (candles.length > 0) {
        candleSeries.setData(candles);
        volSeries.setData(volumes);
        chart.timeScale().fitContent();
    }

    const binanceSymbol = formatSymbol(symbol).toLowerCase();
    let ws = connectKlineWs(binanceSymbol, interval, candleSeries, volSeries);

    activeCharts[containerId] = { chart, series: candleSeries, volumeSeries: volSeries, ws, symbol, interval, container, containerId };
    updateStatus();
}

function connectKlineWs(binanceSymbol, interval, candleSeries, volSeries, attempt = 0) {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${interval}`);

    ws.onopen = () => { updateStatus(); };
    ws.onerror = () => updateStatus();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.e !== 'kline') return;
        const k = msg.k;
        const evtTime = k.E || msg.E || k.t;
        const lat = Date.now() - evtTime;
        if (!isNaN(lat)) wsLatency = Math.max(0, Math.min(9999, lat));

        candleSeries.update({
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o), high: parseFloat(k.h),
            low: parseFloat(k.l), close: parseFloat(k.c)
        });

        if (volSeries) volSeries.update({
            time: Math.floor(k.t / 1000),
            value: parseFloat(k.v),
            color: parseFloat(k.c) >= parseFloat(k.o) ? 'rgba(0,208,132,0.3)' : 'rgba(255,71,87,0.3)'
        });

        // живая цена в шапке карточки
        const rec = Object.values(activeCharts).find(c => c.ws === ws);
        if (rec) updateCardPrice(rec, parseFloat(k.c), parseFloat(k.o));

        updateStatus();
    };

    ws.onclose = () => {
        updateStatus();
        // авто-reconnect до 5 раз
        if (attempt < 5) {
            const rec = Object.values(activeCharts).find(c => c.ws === ws);
            if (rec) {
                rec.retryTimer = setTimeout(() => {
                    if (activeCharts[rec.containerId] !== rec) return; // карточку удалили
                    rec.ws = connectKlineWs(binanceSymbol, interval, candleSeries, volSeries, attempt + 1);
                }, 3000 + attempt * 2000);
            }
        }
    };

    return ws;
}

function updateCardPrice(rec, price, open) {
    const card = document.querySelector(`[data-card-id="${rec.containerId}"]`);
    if (!card || !price) return;
    const el = card.querySelector('.coin-price');
    if (!el) return;
    const txt = formatPrice(price) + ' · ' + (open ? ((price - open) / open * 100 >= 0 ? '+' : '') + ((price - open) / open * 100).toFixed(2) + '%' : '');
    el.textContent = txt;
    const cls = price >= open ? 'up' : 'down';
    if (el.dataset.cls !== cls) {
        el.classList.remove('up', 'down');
        el.classList.add(cls);
        el.dataset.cls = cls;
    }
}

// ==================== КАРТОЧКИ: визуал по метрикам ====================
function updateCardVisual(containerId, metrics) {
    const card = document.querySelector(`[data-card-id="${containerId}"]`);
    if (!card) return;
    card.classList.remove('skeleton');

    card.querySelector('.m-vol') && (card.querySelector('.m-vol').textContent = metrics.volRatio.toFixed(1) + 'x');
    const tfEl = card.querySelector('.m-tf');
    if (tfEl) {
        tfEl.textContent = (metrics.changeTf >= 0 ? '+' : '') + metrics.changeTf.toFixed(2) + '%';
        tfEl.className = 'metric-value m-tf ' + (metrics.changeTf >= 0 ? 'positive' : 'negative');
    }
    const d24 = card.querySelector('.m-24');
    if (d24) {
        d24.textContent = (metrics.change24 >= 0 ? '+' : '') + metrics.change24.toFixed(2) + '%';
        d24.className = 'metric-value m-24 ' + (metrics.change24 >= 0 ? 'positive' : 'negative');
    }
    const trEl = card.querySelector('.m-tr');
    if (trEl) trEl.textContent = formatCount(metrics.trades24);

    const priceEl = card.querySelector('.coin-price');
    if (priceEl && metrics.price) {
        priceEl.textContent = formatPrice(metrics.price);
    }

    card.classList.remove('spike-up', 'spike-down');
    if (metrics.isSpike) card.classList.add(`spike-${metrics.spikeDir}`);
}

// ==================== ПРЕВЬЮ ГРАФИКА ====================
function openPreview(symbol, tf) {
    const modal = document.getElementById('chart-preview');
    const title = document.getElementById('preview-title');
    const container = document.getElementById('preview-chart');

    if (!modal || !container) return;

    previewSymbol = symbol;
    previewTf = tf || previewTf || '5m';
    title.textContent = symbol;
    document.querySelectorAll('#preview-tf button').forEach(b =>
        b.classList.toggle('active', b.dataset.tf === previewTf));
    modal.classList.add('active');

    if (previewChart) {
        try { previewChart.remove(); } catch (e) {}
        previewChart = null;
    }

    container.innerHTML = '';

    setTimeout(() => {
        const cc = chartColors();
        previewChart = LightweightCharts.createChart(container, {
            autoSize: true,
            layout: { background: { color: 'transparent' }, textColor: cc.text },
            grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
            timeScale: { borderColor: cc.grid, timeVisible: true }
        });

        const series = previewChart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: '#00d084', downColor: '#ff4757',
            borderVisible: false,
            wickUpColor: '#00d084', wickDownColor: '#ff4757'
        });

        fetchHistoricalKlines(symbol, previewTf, 200).then(({ candles }) => {
            if (candles.length > 0 && previewChart) {
                series.setData(candles);
                previewChart.timeScale().fitContent();
            }
        });
    }, 60);
}

function closePreview() {
    const modal = document.getElementById('chart-preview');
    modal?.classList.remove('active');
    if (previewChart) {
        try { previewChart.remove(); } catch (e) {}
        previewChart = null;
    }
}

// ==================== КАРТОЧКИ: DOM ====================
function createCardDOM(cardId, symbol = 'ETH/USDT') {
    const card = document.createElement('div');
    card.className = 'crypto-card skeleton';
    card.setAttribute('data-card-id', cardId);
    card.setAttribute('data-symbol', symbol);

    card.innerHTML = `
        <div class="card-header">
            <div class="coin-info">
                <span class="coin-badge">${getBaseTicker(symbol).slice(0, 4)}</span>
                <div class="coin-name">
                    <span class="coin-ticker">${symbol}</span>
                    <span class="coin-price">—</span>
                </div>
            </div>
            <div class="coin-actions">
                <button class="icon-btn change-btn" title="Сменить монету">⇄</button>
                <button class="icon-btn delete-btn" title="Удалить">×</button>
            </div>
        </div>
        <div class="metrics-overlay">
            <div class="metric-item"><span class="metric-label">VOL</span><span class="metric-value m-vol">—</span></div>
            <div class="metric-item"><span class="metric-label">TF</span><span class="metric-value m-tf">—</span></div>
            <div class="metric-item"><span class="metric-label">24h</span><span class="metric-value m-24">—</span></div>
            <div class="metric-item"><span class="metric-label">Сделки</span><span class="metric-value m-tr">—</span></div>
        </div>
        <div class="chart-container" id="${cardId}"></div>
        <div class="timeframes">
            <button class="tf-btn" data-tf="1m">1m</button>
            <button class="tf-btn active" data-tf="5m">5m</button>
            <button class="tf-btn" data-tf="15m">15m</button>
            <button class="tf-btn" data-tf="1h">1h</button>
            <button class="tf-btn" data-tf="4h">4h</button>
        </div>
    `;

    return card;
}

function addCard(symbol, tf) {
    const grid = document.getElementById('grid-view');
    const id = `chart-${cardCounter++}`;
    const card = createCardDOM(id, symbol);

    // активный TF
    card.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === tf));
    const badge = card.querySelector('.coin-badge');
    if (badge) badge.textContent = getBaseTicker(symbol).slice(0, 4);

    grid.appendChild(card);
    grid.classList.remove('empty');
    clearGridEmptyState();
    initLiveChart(id, symbol, tf);
    syncLayout();
    return id;
}

function removeCard(card) {
    const id = card.getAttribute('data-card-id');
    const sym = card.getAttribute('data-symbol');

    const rec = activeCharts[id];
    if (rec) {
        if (rec.retryTimer) clearTimeout(rec.retryTimer);
        if (rec.ws) { try { rec.ws.onclose = null; rec.ws.close(); } catch (e) {} }
        if (rec.ro) rec.ro.disconnect();
        if (rec.chart) { try { rec.chart.remove(); } catch (e) {} }
        delete activeCharts[id];
    }

    // метрики нужны таблице — удаляем только если символ больше нигде не открыт и не в дефолтных
    const stillUsed = Object.values(activeCharts).some(c => c.symbol === sym);
    if (!stillUsed) cardMetrics.delete(sym);

    card.remove();
    syncLayout();
    renderTable();
    updateTopMovers();
}

function clearGridEmptyState() {
    document.querySelector('.grid-empty')?.remove();
}

function renderGridEmptyState() {
    const grid = document.getElementById('grid-view');
    if (!grid) return;
    const anyVisible = Array.from(grid.querySelectorAll('.crypto-card')).some(c => c.style.display !== 'none');
    if (anyVisible) { clearGridEmptyState(); return; }
    if (grid.querySelector('.grid-empty')) return;
    const div = document.createElement('div');
    div.className = 'grid-empty';
    div.innerHTML =
        '<div class="big">📈</div>' +
        (currentPreset === 'fav'
            ? '<p>В избранном пока пусто. Добавляйте монеты звёздочкой в таблице.</p>'
            : '<p>Под этот фильтр ничего не подходит — ослабьте фильтры или добавьте график.</p>' +
              '<button class="add-chart-btn" onclick="openCoinModalForNew()">+ Добавить график</button>');
    grid.appendChild(div);
}

// Пересчёт видимости карточек под пресет (в сетке)
function applyGridPreset() {
    const cards = document.querySelectorAll('.crypto-card');
    cards.forEach(card => {
        const sym = card.getAttribute('data-symbol');
        const m = cardMetrics.get(sym);
        let show = true;
        if (m) show = passPreset(m);
        else if (currentPreset === 'fav') show = favorites.has(sym);
        card.style.display = show ? '' : 'none';
    });
    if (cards.length) renderGridEmptyState();
}

// ==================== МОДАЛКА ВЫБОРА МОНЕТЫ ====================
function openCoinModal(targetCard) {
    const modal = document.getElementById('coin-modal');
    const searchInput = document.getElementById('coin-search-input');
    const coinList = document.getElementById('coin-list');

    targetCardForChange = targetCard || null;
    modal.classList.add('active');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }

    renderCoinOptions('');
    fetchUsdtPairs().then(pairs => { if (pairs && modal.classList.contains('active')) renderCoinOptions(searchInput.value); });
}

function openCoinModalForNew() {
    openCoinModal(null);
}

function renderCoinOptions(query) {
    const coinList = document.getElementById('coin-list');
    if (!coinList) return;
    const q = (query || '').trim().toUpperCase();

    const base = DEFAULT_COINS.filter(s => s.includes(q)).slice(0, 12);
    const extra = pairCache ? pairCache
        .filter(s => (!q || s.includes(q)))
        .filter(s => !base.some(b => formatSymbol(b) === s))
        .slice(0, 60)
        .map(s => s.replace('USDT', '') + '/USDT') : [];

    if (!pairCache) {
        coinList.innerHTML = `<div class="coin-list-loading">Загружаем список пар с Binance...</div>` +
            base.map(sym => coinOptionHTML(sym)).join('');
        return;
    }

    const all = [...base, ...extra];
    if (!all.length) {
        coinList.innerHTML = `<div class="coin-list-loading">Ничего не найдено: «${q}»</div>`;
        return;
    }
    coinList.innerHTML = all.map(sym => coinOptionHTML(sym)).join('');
}

function coinOptionHTML(sym) {
    return `<button class="coin-option" data-symbol="${sym}"><span>${getBaseTicker(sym)}</span> / USDT</button>`;
}

function selectCoin(symbol) {
    if (targetCardForChange) {
        const card = targetCardForChange;
        const containerId = card.getAttribute('data-card-id');
        const oldSym = card.getAttribute('data-symbol');
        const activeTf = card.querySelector('.tf-btn.active')?.dataset.tf || '5m';

        card.querySelector('.coin-ticker').textContent = symbol;
        card.querySelector('.coin-badge').textContent = getBaseTicker(symbol).slice(0, 4);
        card.querySelector('.coin-price').textContent = '—';
        delete card.querySelector('.coin-price').dataset.cls;
        card.querySelector('.coin-price').classList.remove('up', 'down');
        card.setAttribute('data-symbol', symbol);

        // старые метрики больше не нужны, если символ нигде не открыт
        const stillUsed = Object.values(activeCharts).some(c => c.symbol === oldSym && c.containerId !== containerId);
        if (!stillUsed) cardMetrics.delete(oldSym);

        initLiveChart(containerId, symbol, activeTf).then(() => syncLayout());
    } else {
        // режим «добавить график»
        addCard(symbol, '5m');
    }
    closeModal();
    renderTable();
    updateTopMovers();
}

function closeModal() {
    document.getElementById('coin-modal')?.classList.remove('active');
    targetCardForChange = null;
}

// ==================== СОБЫТИЯ ====================
function setupDynamicCards() {
    document.getElementById('add-chart-btn')?.addEventListener('click', () => openCoinModalForNew());

    document.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-btn');
        if (delBtn) {
            removeCard(delBtn.closest('.crypto-card'));
            applyGridPreset();
            if (!document.querySelector('.crypto-card')) renderGridEmptyState();
            return;
        }
        const changeBtn = e.target.closest('.change-btn');
        if (changeBtn) {
            openCoinModal(changeBtn.closest('.crypto-card'));
            return;
        }
        const tfBtn = e.target.closest('.tf-btn');
        if (tfBtn) {
            const card = tfBtn.closest('.crypto-card');
            if (!card) return;
            const containerId = card.getAttribute('data-card-id');
            const symbol = card.getAttribute('data-symbol');
            const tf = tfBtn.dataset.tf;

            card.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
            tfBtn.classList.add('active');

            initLiveChart(containerId, symbol, tf).then(() => syncLayout());
        }
    });
}

function setupViewToggle() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentView = btn.dataset.view;
            document.getElementById('table-view').classList.toggle('active', currentView === 'table');
            document.getElementById('grid-view').classList.toggle('active', currentView === 'grid');
            document.getElementById('filters-bar').classList.toggle('active', currentView === 'table');
            if (currentView === 'table') renderTable();
            else applyGridPreset();
        });
    });
}

function setupPresets() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPreset = btn.dataset.preset;
            renderTable();
            applyGridPreset();
            renderGridEmptyState();
        });
    });
}

function setupFilters() {
    ['filter-change', 'filter-volume', 'filter-volatility'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderTable);
    });
}

function setupTableSort() {
    document.querySelectorAll('.screener-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const isAsc = th.classList.contains('sort-asc');
            document.querySelectorAll('.screener-table th').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
            th.classList.add(isAsc ? 'sort-desc' : 'sort-asc');
            renderTable();
        });
    });
}

function setupCoinModal() {
    const modal = document.getElementById('coin-modal');
    const closeBtn = document.getElementById('close-modal');
    const searchInput = document.getElementById('coin-search-input');
    const coinList = document.getElementById('coin-list');

    const close = () => closeModal();
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderCoinOptions(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = coinList.querySelector('.coin-option:not([style*="display: none"])');
                if (first) selectCoin(first.dataset.symbol);
            }
        });
    }

    if (coinList) {
        coinList.addEventListener('click', (e) => {
            const opt = e.target.closest('.coin-option');
            if (opt) selectCoin(opt.dataset.symbol);
        });
    }
}

function setupPreview() {
    document.getElementById('preview-close')?.addEventListener('click', closePreview);
    document.getElementById('chart-preview')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePreview();
    });
    document.getElementById('preview-tf')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-tf]');
        if (!btn) return;
        document.querySelectorAll('#preview-tf button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        previewTf = btn.dataset.tf;
        if (previewSymbol) openPreview(previewSymbol, previewTf);
    });
}

function setupAlertControls() {
    const btn = document.getElementById('audio-toggle-btn');
    if (!btn) return;

    btn.classList.toggle('muted', !isAudioEnabled);
    btn.querySelector('#audio-status-text').textContent = isAudioEnabled ? 'ON' : 'OFF';

    btn.addEventListener('click', () => {
        isAudioEnabled = !isAudioEnabled;
        btn.classList.toggle('muted', !isAudioEnabled);
        btn.querySelector('#audio-status-text').textContent = isAudioEnabled ? 'ON' : 'OFF';
        saveStore();
        if (isAudioEnabled) playAlertSound();
    });
}

function setupTheme() {
    const select = document.getElementById('theme-select');
    if (!select) return;

    let savedTheme = 'green';
    try { savedTheme = localStorage.getItem('screener_theme') || 'green'; } catch (e) {}
    document.documentElement.setAttribute('data-theme', savedTheme);
    select.value = savedTheme;

    select.addEventListener('change', () => {
        const theme = select.value;
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('screener_theme', theme); } catch (e) {}
        // перерисовать цвета сеток графиков под новую тему
        const cc = chartColors();
        Object.values(activeCharts).forEach(rec => {
            rec.chart.applyOptions({
                grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
                timeScale: { borderColor: cc.grid },
                rightPriceScale: { borderColor: cc.grid },
            });
        });
        if (previewChart) {
            previewChart.applyOptions({
                grid: { vertLines: { color: cc.grid }, horzLines: { color: cc.grid } },
                timeScale: { borderColor: cc.grid },
            });
        }
        renderTable();
    });
}

function setupNetRetry() {
    document.getElementById('net-retry')?.addEventListener('click', async () => {
        if (netRetrying) return;
        netRetrying = true;
        document.getElementById('net-banner').querySelector('span').textContent = '↻ Проверяем связь с Binance...';
        const m = await updateMetrics('BTC/USDT', '5m');
        setRestStatus(!!m);
        if (m) {
            document.getElementById('net-banner').classList.remove('show');
            refreshAllMetrics();
        } else {
            document.getElementById('net-banner').querySelector('span').textContent = '⚠ Binance API недоступен — проверьте сеть. Показаны последние данные.';
        }
    });
}

// Esc закрывает окна
function setupEsc() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closePreview();
        closeModal();
    });
}

// Отладочный снимок состояния (консоль / автотесты)
window.__scState = () => JSON.stringify({
    charts: Object.keys(activeCharts).length,
    wsOpen: Object.values(activeCharts).filter(c => c.ws && c.ws.readyState === 1).length,
    symbols: Object.values(activeCharts).map(c => c.symbol + ':' + c.interval),
    metrics: cardMetrics.size,
    favorites: Array.from(favorites),
    view: currentView,
    preset: currentPreset,
    status: { ws: wsOnline, rest: restOnline, latency: wsLatency },
});

// ==================== ОБНОВЛЕНИЕ ВСЕХ МЕТРИК ====================
function refreshAllMetrics() {
    const symbols = new Set([
        ...Object.values(activeCharts).map(c => c.symbol),
        ...DEFAULT_COINS,
    ]);
    const list = Array.from(symbols);
    list.forEach((sym, idx) => {
        setTimeout(async () => {
            const ac = Object.values(activeCharts).find(c => c.symbol === sym);
            const tf = ac ? ac.interval : '5m';
            const m = await updateMetrics(sym, tf);
            if (m) {
                renderTable();
                updateTopMovers();
                // обновляем визуал карточек этого символа
                Object.values(activeCharts).forEach(rec => {
                    if (rec.symbol === sym) updateCardVisual(rec.containerId, m);
                });
                applyGridPreset();
            }
        }, idx * 120);
    });
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', () => {
    loadStore();
    setupTheme();
    setupViewToggle();
    setupPresets();
    setupFilters();
    setupTableSort();
    setupDynamicCards();
    setupCoinModal();
    setupPreview();
    setupAlertControls();
    setupEsc();
    setupNetRetry();

    // По умолчанию — сетка
    document.getElementById('grid-view').classList.add('active');
    document.getElementById('table-view').classList.remove('active');
    document.getElementById('filters-bar').classList.remove('active');

    // Восстановить сохранённую раскладку или дефолт
    const initial = layout || DEFAULT_LAYOUT;
    initial.forEach(({ symbol, tf }) => addCard(symbol, tf || '5m'));

    // Каскадный старт (щадим rate limit Binance)
    setTimeout(() => {
        Object.keys(activeCharts).forEach((id, index) => {
            const rec = activeCharts[id];
            setTimeout(() => {
                updateMetrics(rec.symbol, rec.interval).then(m => {
                    if (m) {
                        updateCardVisual(id, m);
                        renderTable();
                        updateTopMovers();
                    }
                });
            }, index * 250);
        });
    }, 100);

    // Метрики дефолтных монет (для таблицы)
    setTimeout(refreshAllMetrics, 1200);

    // Периодическое автообновление метрик
    setInterval(refreshAllMetrics, 12000);
});
