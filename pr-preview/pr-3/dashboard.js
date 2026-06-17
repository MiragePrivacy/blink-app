const REFRESH_MS = 30_000;
const CHART_CACHE_MS = 60_000;
const SNAPSHOT_CACHE_MS = 300_000;
const palette = {
  accent: '#bdff00',
  accentSoft: 'rgba(189, 255, 0, 0.14)',
  accentLine: 'rgba(189, 255, 0, 0.85)',
  red: '#ff4d4d',
  redSoft: 'rgba(255, 77, 77, 0.16)',
  ash: '#8a8f98',
  ashSoft: 'rgba(138, 143, 152, 0.16)',
  blue: '#4da6ff',
  blueSoft: 'rgba(77, 166, 255, 0.16)',
  amber: '#ffb547',
  text: '#ededed',
  dim: '#707070',
  faint: '#404040',
  grid: 'rgba(255, 255, 255, 0.04)',
  axis: 'rgba(255, 255, 255, 0.06)',
  bg: '#050505',
};

Chart.defaults.color = palette.dim;
Chart.defaults.borderColor = palette.grid;
Chart.defaults.font.family = '"JetBrains Mono", ui-monospace, monospace';
Chart.defaults.font.size = 10.5;

const baseScales = {
  x: {
    ticks: { color: palette.dim, maxRotation: 0, autoSkipPadding: 24, font: { size: 10 } },
    grid: { color: palette.grid, drawTicks: false },
    border: { color: palette.axis },
  },
  y: {
    ticks: { color: palette.dim, font: { size: 10 }, padding: 6 },
    grid: { color: palette.grid, drawTicks: false },
    border: { display: false },
    beginAtZero: true,
  },
};

const baseTooltip = {
  backgroundColor: '#000',
  borderColor: '#262626',
  borderWidth: 1,
  cornerRadius: 0,
  padding: 10,
  titleColor: palette.text,
  titleFont: { family: '"JetBrains Mono", monospace', size: 10, weight: '500' },
  bodyColor: palette.text,
  bodyFont: { family: '"JetBrains Mono", monospace', size: 11 },
  displayColors: true,
  boxPadding: 4,
};

const baseChartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: {
        color: palette.dim,
        font: { size: 10, family: '"JetBrains Mono", monospace' },
        usePointStyle: true,
        pointStyle: 'rectRounded',
        boxWidth: 8,
        boxHeight: 8,
      },
    },
    tooltip: baseTooltip,
  },
  scales: baseScales,
};

const buckets = { deploys: 'day', verified: 'week' };
const chartWindows = { deploys: null, verified: null };
const chartBuckets = {
  deploys: ['hour', 'day', 'week', 'month'],
  verified: ['day', 'week', 'month'],
};
const charts = {};
const chartDataCache = new Map();
const dashboardPayloadCache = new Map();
const lastRenderedCharts = {};
const recentState = {
  limit: 20,
  page: 0,
  cursors: [null],
  nextCursor: null,
  hasMore: false,
  loading: false,
};

const chains = [
  {
    chain_id: 1,
    name: 'Ethereum',
    short_name: 'ETH',
    native_symbol: 'ETH',
    explorer_url: 'https://etherscan.io',
    icon_key: 'ethereum',
  },
  {
    chain_id: 100,
    name: 'Gnosis',
    short_name: 'GNO',
    native_symbol: 'xDAI',
    explorer_url: 'https://gnosisscan.io',
    icon_key: 'gnosis',
  },
];

const chainState = {
  chains,
  selectedId: Number(localStorage.getItem('blink.chain_id')) || 1,
  menuOpen: false,
};

const API_BASE = 'https://blink-api.mirageprivacy.com';
const CHART_PREFS_KEY = 'blink.chart_prefs';
let renderEpoch = 0;

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function fetchJson(path) {
  const url = apiUrl(path);
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`request failed (${r.status})`);
    err.path = path;
    err.detail = data.error || `${path} → ${r.status}`;
    throw err;
  }
  return data;
}

async function postJson(path, payload) {
  const url = apiUrl(path);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`request failed (${r.status})`);
    err.path = path;
    err.detail = data.error || `${path} → ${r.status}`;
    throw err;
  }
  return data;
}

function chartWindowKey(endBlock = null) {
  return endBlock === null || endBlock === undefined ? 'latest' : String(endBlock);
}

function chartCacheKey(target, chainId, bucket, endBlock = null) {
  return `${target}:${chainId}:${bucket}:${chartWindowKey(endBlock)}`;
}

function chartEndpoint(target) {
  if (target === 'deploys') return '/api/deploys-over-time';
  if (target === 'verified') return '/api/verified-ratio';
  throw new Error(`unknown chart target ${target}`);
}

async function fetchChartData(target, chainId, bucket, endBlock = null, refresh = false) {
  const key = chartCacheKey(target, chainId, bucket, endBlock);
  const cached = chartDataCache.get(key);
  const fresh = cached && Date.now() - cached.storedAt <= CHART_CACHE_MS;
  if (!refresh && fresh && cached.data) return cached.data;
  if (!refresh && cached?.pending) return cached.pending;

  const params = { range: bucket };
  if (endBlock !== null && endBlock !== undefined) params.end_block = String(endBlock);
  const pending = fetchJson(chainPathFor(chainId, chartEndpoint(target), params))
    .then(data => {
      chartDataCache.set(key, { data, storedAt: Date.now(), pending: null });
      return data;
    })
    .catch(err => {
      if (cached?.data) {
        chartDataCache.set(key, {
          data: cached.data,
          storedAt: cached.storedAt,
          pending: null,
        });
      } else {
        chartDataCache.delete(key);
      }
      throw err;
    });
  chartDataCache.set(key, {
    data: cached?.data || null,
    storedAt: cached?.storedAt || 0,
    pending,
  });
  return pending;
}

function cachedChartData(target, chainId, bucket, endBlock = null) {
  return chartDataCache.get(chartCacheKey(target, chainId, bucket, endBlock))?.data || null;
}

function chartCanvasId(target) {
  return target === 'deploys' ? 'chart-deploys' : 'chart-verified';
}

function chartInstanceKey(target) {
  return target === 'deploys' ? 'deploys' : 'verified';
}

function renderChartTarget(target, data, bucket, endBlock = null) {
  lastRenderedCharts[target] = { data, bucket, endBlock };
  if (target === 'deploys') renderDeploys(data);
  else renderVerified(data, bucket);
}

function bucketDisplayName(bucket) {
  if (bucket === 'hour') return '1H';
  if (bucket === 'day') return '1D';
  if (bucket === 'week') return '1W';
  if (bucket === 'month') return '1M';
  return bucket;
}

function showChartLoading(target, bucket) {
  const key = chartInstanceKey(target);
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
  clearCanvasMessage(chartCanvasId(target), `loading ${bucketDisplayName(bucket)} data`);
}

function prefetchChartTarget(target, chainId, epoch) {
  for (const bucket of chartBuckets[target] || []) {
    if (!canRender(epoch, chainId)) return;
    fetchChartData(target, chainId, bucket, chartWindows[target]).catch(err => {
      logDashboardError(`${target} ${bucket} prefetch`, err);
    });
  }
}

function prefetchChartBuckets(chainId, epoch) {
  for (const [target, values] of Object.entries(chartBuckets)) {
    for (const bucket of values) {
      if (!canRender(epoch, chainId)) return;
      fetchChartData(target, chainId, bucket, chartWindows[target]).catch(err => {
        logDashboardError(`${target} ${bucket} prefetch`, err);
      });
    }
  }
}

function dashboardSnapshotKey(
  chainId,
  deployBucket = buckets.deploys,
  verifiedBucket = buckets.verified,
  deployEndBlock = chartWindows.deploys,
  verifiedEndBlock = chartWindows.verified,
) {
  return `blink.dashboard.${chainId}.${deployBucket}.${chartWindowKey(deployEndBlock)}.${verifiedBucket}.${chartWindowKey(verifiedEndBlock)}`;
}

function dashboardLatestSnapshotKey(chainId) {
  return `blink.dashboard.${chainId}.latest`;
}

function readStoredDashboardSnapshot(key) {
  const memorySnapshot = dashboardPayloadCache.get(key);
  if (memorySnapshot) return memorySnapshot;

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot?.storedAt || Date.now() - snapshot.storedAt > SNAPSHOT_CACHE_MS) return null;
    dashboardPayloadCache.set(key, snapshot);
    return snapshot;
  } catch (err) {
    console.warn('[blink] failed to read dashboard snapshot', err);
    return null;
  }
}

function readDashboardSnapshot(chainId) {
  const exact = readStoredDashboardSnapshot(dashboardSnapshotKey(chainId));
  if (
    exact &&
    exact.deployBucket === buckets.deploys &&
    exact.verifiedBucket === buckets.verified &&
    chartWindowKey(exact.deployEndBlock) === chartWindowKey(chartWindows.deploys) &&
    chartWindowKey(exact.verifiedEndBlock) === chartWindowKey(chartWindows.verified)
  ) {
    return exact;
  }

  return readStoredDashboardSnapshot(dashboardLatestSnapshotKey(chainId));
}

function writeDashboardSnapshot(chainId, payload) {
  const key = dashboardSnapshotKey(
    chainId,
    payload.deployBucket,
    payload.verifiedBucket,
    payload.deployEndBlock,
    payload.verifiedEndBlock,
  );
  const latestKey = dashboardLatestSnapshotKey(chainId);
  const snapshot = {
    ...payload,
    storedAt: Date.now(),
  };
  dashboardPayloadCache.set(key, snapshot);
  dashboardPayloadCache.set(latestKey, snapshot);
  try {
    sessionStorage.setItem(key, JSON.stringify(snapshot));
    sessionStorage.setItem(latestKey, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[blink] failed to write dashboard snapshot', err);
  }
}

function hydrateChartCacheFromSnapshot(chainId, payload) {
  if (payload.deploys) {
    chartDataCache.set(chartCacheKey('deploys', chainId, payload.deployBucket, payload.deployEndBlock), {
      data: payload.deploys,
      storedAt: payload.storedAt || Date.now(),
      pending: null,
    });
  }
  if (payload.verified) {
    chartDataCache.set(chartCacheKey('verified', chainId, payload.verifiedBucket, payload.verifiedEndBlock), {
      data: payload.verified,
      storedAt: payload.storedAt || Date.now(),
      pending: null,
    });
  }
}

function selectedChainId() {
  const selected = chainState.selectedId || 1;
  if (chainState.chains.some(chain => Number(chain.chain_id) === selected)) return selected;
  return Number(chainState.chains[0]?.chain_id || chains[0].chain_id || 1);
}

function validChartBucket(target, bucket) {
  return (chartBuckets[target] || []).includes(bucket);
}

function readChartPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(CHART_PREFS_KEY) || '{}');
    for (const target of ['deploys', 'verified']) {
      if (validChartBucket(target, prefs?.buckets?.[target])) {
        buckets[target] = prefs.buckets[target];
      }
      const endBlock = prefs?.windows?.[target];
      chartWindows[target] = Number.isFinite(endBlock) ? endBlock : null;
    }
  } catch (err) {
    console.warn('[blink] failed to read chart preferences', err);
  }
}

function writeChartPrefs() {
  try {
    localStorage.setItem(
      CHART_PREFS_KEY,
      JSON.stringify({
        buckets: { ...buckets },
        windows: { ...chartWindows },
      }),
    );
  } catch (err) {
    console.warn('[blink] failed to write chart preferences', err);
  }
}

function syncBucketButtons() {
  document.querySelectorAll('.seg').forEach(group => {
    const target = group.dataset.target;
    group.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bucket === buckets[target]);
    });
  });
}

function activeChain() {
  return (
    chainState.chains.find(chain => Number(chain.chain_id) === selectedChainId()) ||
    chainState.chains[0] ||
    chains[0]
  );
}

function chainPathFor(chainId, path, params = {}) {
  const query = new URLSearchParams(params);
  query.set('chain_id', String(chainId));
  return `${path}?${query.toString()}`;
}

function explorerAddressUrl(address) {
  const base = (activeChain().explorer_url || chains[0].explorer_url).replace(/\/$/, '');
  return `${base}/address/${encodeURIComponent(address)}`;
}

function resetRecentState() {
  recentState.page = 0;
  recentState.cursors = [null];
  recentState.nextCursor = null;
  recentState.hasMore = false;
  recentState.loading = false;
}

function nextRenderEpoch() {
  renderEpoch += 1;
  return renderEpoch;
}

function canRender(epoch, chainId) {
  return epoch === renderEpoch && chainId === selectedChainId();
}

function defaultSqlForChain(chainId = selectedChainId()) {
  return `SELECT
  chain_id,
  block_number,
  address,
  compiler_version,
  language,
  n_code_bytes,
  is_verified
FROM contract_metadata
WHERE chain_id = ${chainId}
ORDER BY block_number DESC, create_index DESC
LIMIT 50`;
}

function syncDefaultSqlToChain(force = false) {
  const editor = document.getElementById('query-editor');
  if (!editor) return false;
  const chainScopedDefaultPattern = /^SELECT\s+chain_id,\s+block_number,\s+address,\s+compiler_version,\s+language,\s+n_code_bytes,\s+is_verified\s+FROM\s+contract_metadata\s+WHERE\s+chain_id\s+=\s+\d+\s+ORDER\s+BY\s+block_number\s+DESC,\s+create_index\s+DESC\s+LIMIT\s+50\s*$/i;
  const legacyDefaultPattern = /^SELECT\s+block_number,\s+address,\s+compiler_version,\s+language,\s+n_code_bytes,\s+is_verified\s+FROM\s+contract_metadata\s+ORDER\s+BY\s+block_number\s+DESC,\s+create_index\s+DESC\s+LIMIT\s+50\s*$/i;
  const currentSql = editor.value.trim();
  if (
    force ||
    !currentSql ||
    chainScopedDefaultPattern.test(currentSql) ||
    legacyDefaultPattern.test(currentSql)
  ) {
    editor.value = defaultSqlForChain();
    return true;
  }
  return false;
}

function clearCanvasMessage(id, message) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.faint;
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

function clearCharts(message = 'loading chain data') {
  Object.keys(charts).forEach(key => {
    if (charts[key]) charts[key].destroy();
    charts[key] = null;
  });
  clearCanvasMessage('chart-deploys', message);
  clearCanvasMessage('chart-verified', message);
  clearCanvasMessage('chart-sizes', message);
  clearCanvasMessage('chart-compilers', message);
  clearCanvasMessage('chart-standards', message);
}

function resetMetrics(message = 'loading chain data') {
  document.getElementById('m-total').textContent = '—';
  document.getElementById('m-block-range').textContent = message;
  document.getElementById('m-verified').textContent = '—';
  document.getElementById('m-verified-pct').textContent = message;
  document.getElementById('m-unverified').textContent = '—';
  document.getElementById('m-coverage').textContent = '—';
  document.getElementById('m-last-block').textContent = '—';
  document.getElementById('m-last-block-time').textContent = message;
  document.getElementById('m-lang-top').textContent = '—';
  document.getElementById('m-lang-sub').textContent = message;
}

function resetRecentTable(message = 'loading chain data') {
  const tbody = document.querySelector('#recent-table tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="query-empty">${escapeHtml(message)}</td></tr>`;
  }
  document.getElementById('recent-range').textContent = '—';
  updateRecentPager();
}

function resetDashboardForChain() {
  resetMetrics('loading chain data');
  document.getElementById('compilers-source').textContent = 'decoded';
  document.getElementById('standards-coverage').textContent = '— decoded';
  clearCharts('loading chain data');
  resetRecentTable('loading chain data');
}

function logDashboardError(context, err) {
  console.error(`[blink] ${context}`, err.detail || err.message, err);
}

async function capture(context, work) {
  try {
    return await work;
  } catch (err) {
    logDashboardError(context, err);
    return null;
  }
}

function updateFooterRefresh(isoString = new Date().toISOString()) {
  const refreshDate = new Date(isoString);
  const ts = refreshDate.toISOString().slice(11, 19) + ' UTC';
  document.getElementById('footer-refresh').textContent = `last refresh ${ts}`;
}

function chainIcon(key) {
  if (key === 'ethereum') {
    return `<img src="./assets/ethereum.svg" alt="" aria-hidden="true" />`;
  }
  if (key === 'gnosis') {
    return `<img src="./assets/gnosis.svg" alt="" aria-hidden="true" />`;
  }
  return '<span class="chain-initial">•</span>';
}

function setChainMenuOpen(open) {
  chainState.menuOpen = open;
  const picker = document.getElementById('chain-picker');
  const trigger = document.getElementById('chain-trigger');
  if (picker) picker.classList.toggle('open', open);
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function selectChain(chainId) {
  if (chainId === selectedChainId()) {
    setChainMenuOpen(false);
    return;
  }
  chainState.selectedId = chainId;
  localStorage.setItem('blink.chain_id', String(chainId));
  nextRenderEpoch();
  resetRecentState();
  renderChainDropdown();
  updateChainMeta();
  syncDefaultSqlToChain();
  clearQueryResult('run query for selected chain');
  setChainMenuOpen(false);
  if (!renderCachedDashboard()) {
    resetDashboardForChain();
  }
  refresh({ reset: false });
}

function renderChainDropdown() {
  const trigger = document.getElementById('chain-trigger');
  const icon = document.getElementById('active-chain-icon');
  const label = document.getElementById('active-chain-label');
  const menu = document.getElementById('chain-menu');
  if (!trigger || !icon || !label || !menu) return;

  const active = activeChain();
  icon.innerHTML = chainIcon(active.icon_key);
  label.textContent = active.short_name || active.name || `chain ${selectedChainId()}`;
  trigger.title = active.name || `chain ${selectedChainId()}`;
  menu.innerHTML = '';

  for (const chain of chainState.chains) {
    const chainId = Number(chain.chain_id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = chainId === selectedChainId() ? 'chain-option active' : 'chain-option';
    button.role = 'option';
    button.setAttribute('aria-selected', chainId === selectedChainId() ? 'true' : 'false');
    button.dataset.chainId = String(chainId);
    button.title = chain.name || `chain ${chainId}`;
    button.innerHTML = `
      <span class="chain-icon">${chainIcon(chain.icon_key)}</span>
      <span class="chain-option-text">
        <span class="chain-option-name">${escapeHtml(chain.name || `chain ${chainId}`)}</span>
        <span class="chain-option-id">${escapeHtml(chain.short_name || chain.native_symbol || chainId)}</span>
      </span>
    `;
    button.addEventListener('click', () => selectChain(chainId));
    menu.appendChild(button);
  }
}

function updateChainMeta() {
  const chain = activeChain();
  document.title = `blink · ${(chain.name || 'contracts').toLowerCase()} contract intel`;
}

async function loadChains() {
  const data = await capture('chains', fetchJson('/api/chains'));
  const apiChains = Array.isArray(data?.chains) && data.chains.length ? data.chains : chains;
  chainState.chains = apiChains;
  const defaultId = Number(data?.default_chain_id || chains[0].chain_id);
  const requestedId = chainState.selectedId || defaultId;
  const selectedExists = apiChains.some(chain => Number(chain.chain_id) === requestedId);
  if (!selectedExists) {
    chainState.selectedId = defaultId;
    localStorage.setItem('blink.chain_id', String(defaultId));
  }
  renderChainDropdown();
  updateChainMeta();
  syncDefaultSqlToChain();
}

function fmtNumber(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function fmtFull(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function bucketLabel(row, bucket) {
  if (!row.timestamp) return `${fmtFull(row.block_start)}-${fmtFull(row.block_end)}`;
  const timestamp = Date.parse(row.timestamp);
  if (!Number.isFinite(timestamp)) return `${fmtFull(row.block_start)}-${fmtFull(row.block_end)}`;
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return bucket === 'month' ? day.slice(0, 7) : day;
}

function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  dot.classList.remove('connected', 'sync', 'live', 'error');
  if (state === 'connected') dot.classList.add('connected');
  if (state === 'sync') dot.classList.add('sync');
  if (state === 'live') dot.classList.add('live');
  if (state === 'error') dot.classList.add('error');
  txt.textContent = text;
}

function isoAgeMs(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

function shortError(message) {
  if (!message) return '';
  return message.length > 72 ? message.slice(0, 69) + '...' : message;
}

function renderRuntimeStatus(runtime) {
  const ts = new Date().toISOString().slice(11, 19) + ' UTC';
  if (!runtime) {
    setStatus('connected', `snapshot · ${ts}`);
    return;
  }

  if (runtime.tail_enabled) {
    const freshMs = Math.max((runtime.tail_interval_secs || 60) * 3 * 1000, 180_000);
    const tailErrorIsLatest =
      runtime.tail_last_error &&
      isoAgeMs(runtime.tail_last_error_at) < isoAgeMs(runtime.tail_last_ok_at);
    if (tailErrorIsLatest) {
      console.warn('[blink] tail delayed', runtime.tail_last_error);
      setStatus('sync', 'tail delayed');
      return;
    }
    if (runtime.tail_last_ok_at && isoAgeMs(runtime.tail_last_ok_at) <= freshMs) {
      const block = runtime.tail_last_block ? ` · block ${fmtFull(runtime.tail_last_block)}` : '';
      setStatus('live', `live${block}`);
      return;
    }
    if (runtime.tail_last_error) {
      console.warn('[blink] tail delayed', runtime.tail_last_error);
      setStatus('sync', 'tail delayed');
      return;
    }
    setStatus('sync', runtime.tail_running ? 'tailing latest contracts' : 'tail starting');
    return;
  }

  setStatus('connected', runtime.read_only ? `read only · ${ts}` : `snapshot · ${ts}`);
}

function renderStats(s) {
  document.getElementById('m-total').textContent = fmtFull(s.total_contracts);
  document.getElementById('m-block-range').textContent =
    s.first_block === 0 && s.last_block === 0
      ? 'no data yet'
      : `block range: ${fmtFull(s.first_block)} - ${fmtFull(s.last_block)}`;

  document.getElementById('m-verified').textContent = fmtNumber(s.verified_count);
  document.getElementById('m-verified-pct').innerHTML =
    s.verified_pct > 0
      ? `<span class="pct">${s.verified_pct.toFixed(2)}%</span> of checked`
      : 'awaiting verification import';

  document.getElementById('m-unverified').textContent = fmtNumber(s.unverified_count);
  document.getElementById('m-coverage').textContent = `${s.enrichment_coverage_pct.toFixed(2)}%`;

  document.getElementById('m-last-block').textContent = fmtFull(s.last_block);
  document.getElementById('m-last-block-time').textContent = `updated ${fmtTime(s.last_updated)}`;
}

async function loadStats(chainId = selectedChainId(), epoch = renderEpoch) {
  const s = await fetchJson(chainPathFor(chainId, '/api/stats'));
  if (!canRender(epoch, chainId)) return null;
  renderStats(s);
  return s;
}

function renderStatsUnavailable() {
  document.getElementById('m-total').textContent = '—';
  document.getElementById('m-block-range').textContent = 'data unavailable';
  document.getElementById('m-verified').textContent = '—';
  document.getElementById('m-verified-pct').textContent = 'verification unavailable';
  document.getElementById('m-unverified').textContent = '—';
  document.getElementById('m-coverage').textContent = '—';
  document.getElementById('m-last-block').textContent = '—';
  document.getElementById('m-last-block-time').textContent = 'waiting for API';
}

function renderDeploys(data) {
  const points = data.buckets.map(b => ({ x: b.timestamp, y: b.count }));
  const ctx = document.getElementById('chart-deploys');
  if (charts.deploys) charts.deploys.destroy();
  charts.deploys = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'contracts',
        data: points,
        borderColor: palette.accentLine,
        backgroundColor: palette.accentSoft,
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: palette.accent,
        pointHoverBorderColor: '#000',
        borderWidth: 1.4,
      }],
    },
    options: {
      ...baseChartDefaults,
      plugins: { ...baseChartDefaults.plugins, legend: { display: false } },
      scales: {
        x: { ...baseScales.x, type: 'time', time: { tooltipFormat: 'yyyy-MM-dd HH:mm' } },
        y: { ...baseScales.y, ticks: { ...baseScales.y.ticks, callback: v => fmtNumber(v) } },
      },
    },
  });
}

async function loadDeploys(chainId = selectedChainId(), epoch = renderEpoch, bucket = buckets.deploys) {
  const endBlock = chartWindows.deploys;
  const data = await fetchChartData('deploys', chainId, bucket, endBlock);
  if (!canRender(epoch, chainId) || bucket !== buckets.deploys) return null;
  renderChartTarget('deploys', data, bucket, endBlock);
  return data;
}

function renderVerified(data, bucket = buckets.verified) {
  const all = data.buckets || [];

  const ctx = document.getElementById('chart-verified');
  if (charts.verified) charts.verified.destroy();

  if (all.length === 0) {
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    c.fillStyle = palette.faint;
    c.font = '11px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.fillText('no contract data yet', ctx.width / 2, ctx.height / 2);
    return;
  }

  const points = all.map(b => {
    const total = (b.verified || 0) + (b.unverified || 0) + (b.unknown || 0);
    const pct = (n) => total > 0 ? (100 * n / total) : 0;
    return {
      verified: pct(b.verified || 0),
      unverified: pct(b.unverified || 0),
      unknown: pct(b.unknown || 0),
      vAbs: b.verified || 0,
      uAbs: b.unverified || 0,
      kAbs: b.unknown || 0,
      blockStart: b.block_start,
      blockEnd: b.block_end,
    };
  });

  const labels = all.map(b => bucketLabel(b, bucket));

  charts.verified = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'verified',
          data: points.map(p => p.vAbs),
          borderColor: palette.accent,
          backgroundColor: 'transparent',
          fill: false, pointRadius: 0, borderWidth: 1.8, tension: 0.45,
        },
        {
          label: 'unverified',
          data: points.map(p => p.uAbs),
          borderColor: palette.amber,
          backgroundColor: 'transparent',
          fill: false, pointRadius: 0, borderWidth: 1.8, tension: 0.45,
        },
      ],
    },
    options: {
      ...baseChartDefaults,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...baseChartDefaults.plugins,
        tooltip: {
          ...baseChartDefaults.plugins.tooltip,
          callbacks: {
            title: items => labels[items[0].dataIndex],
            label: (item) => {
              const p = points[item.dataIndex];
              const abs = item.datasetIndex === 0 ? p.vAbs : p.uAbs;
              const share = item.datasetIndex === 0 ? p.verified : p.unverified;
              return `${item.dataset.label}: ${fmtFull(abs)} (${share.toFixed(1)}%)`;
            },
            afterBody: items => {
              const p = points[items[0].dataIndex];
              return `blocks ${fmtFull(p.blockStart)} - ${fmtFull(p.blockEnd)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ...baseScales.x,
          ticks: { ...baseScales.x.ticks, autoSkipPadding: 20, maxTicksLimit: 6 },
        },
        y: {
          ...baseScales.y,
          beginAtZero: true,
          ticks: { ...baseScales.y.ticks, callback: v => fmtNumber(v) },
        },
      },
    },
  });
}

async function loadVerified(chainId = selectedChainId(), epoch = renderEpoch, bucket = buckets.verified) {
  const endBlock = chartWindows.verified;
  const data = await fetchChartData('verified', chainId, bucket, endBlock);
  if (!canRender(epoch, chainId) || bucket !== buckets.verified) return null;
  renderChartTarget('verified', data, bucket, endBlock);
  return data;
}

function renderSizes(data) {
  const labels = data.bins.map(b => b.label || `${fmtBytes(b.size_min)}-${fmtBytes(b.size_max)}`);
  const shortLabels = labels;
  const counts = data.bins.map(b => b.count);
  const grandTotal = counts.reduce((a, b) => a + b, 0);

  const ctx = document.getElementById('chart-sizes');
  if (charts.sizes) charts.sizes.destroy();
  charts.sizes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [{
        label: 'contracts',
        data: counts,
        backgroundColor: palette.blueSoft,
        borderColor: palette.blue,
        borderWidth: 1,
        barPercentage: 0.95,
        categoryPercentage: 0.95,
      }],
    },
    options: {
      ...baseChartDefaults,
      plugins: {
        ...baseChartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          ...baseTooltip,
          callbacks: {
            title: items => `size ${labels[items[0].dataIndex]}`,
            label: item => {
              const pct = grandTotal > 0
                ? (item.parsed.y / grandTotal * 100).toFixed(2)
                : '0.00';
              return `${fmtFull(item.parsed.y)} contracts (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          ...baseScales.x,
          title: { display: true, text: 'bytecode size', color: palette.faint, font: { size: 10 } },
          ticks: { ...baseScales.x.ticks, font: { size: 9 }, maxRotation: 45, minRotation: 45 },
        },
        y: {
          ...baseScales.y,
          title: { display: true, text: 'contracts in range', color: palette.faint, font: { size: 10 } },
          ticks: { ...baseScales.y.ticks, callback: v => fmtNumber(v) },
        },
      },
    },
  });
}

async function loadSizes(chainId = selectedChainId(), epoch = renderEpoch) {
  const data = await fetchJson(chainPathFor(chainId, '/api/bytecode-sizes'));
  if (!canRender(epoch, chainId)) return null;
  renderSizes(data);
  return data;
}

function renderLanguages(data) {
  const langs = data.languages || [];
  const total = langs.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    document.getElementById('m-lang-top').textContent = '—';
    document.getElementById('m-lang-sub').textContent = 'run `blink decode`';
    return;
  }
  const known = langs.filter(l => l.language !== 'unknown');
  const knownCount = known.reduce((a, b) => a + b.count, 0);
  const unknown = total - knownCount;
  const knownPct = total > 0 ? (knownCount / total * 100).toFixed(1) : '0.0';
  document.getElementById('m-lang-top').textContent = `${knownPct}% known`;
  const knownParts = known.slice(0, 2).map(l => `${l.language} ${fmtNumber(l.count)}`);
  const unknownPart = unknown > 0 ? `${fmtNumber(unknown)} unknown` : '';
  document.getElementById('m-lang-sub').textContent =
    [...knownParts, unknownPart].filter(Boolean).join(' · ') || `${fmtNumber(total)} decoded`;
}

async function loadLanguages(chainId = selectedChainId(), epoch = renderEpoch) {
  const data = await fetchJson(chainPathFor(chainId, '/api/languages'));
  if (!canRender(epoch, chainId)) return null;
  renderLanguages(data);
  return data;
}

function renderStandards(data) {
  const total = data.total_decoded || 0;
  const cov = document.getElementById('standards-coverage');
  cov.textContent = total > 0 ? `${fmtNumber(total)} decoded` : 'no data';

  const ctx = document.getElementById('chart-standards');
  if (charts.standards) charts.standards.destroy();

  if (total === 0) {
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    c.fillStyle = palette.faint;
    c.font = '11px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.fillText('no decoded contracts yet — run `blink decode`', ctx.width / 2, ctx.height / 2);
    return;
  }

  const labels = [
    'ERC-20 selectors',
    'ERC-721 selectors',
    'ERC-1155 selectors',
    'EIP-1167 minimal proxy',
    'EIP-1967 proxy',
    'PUSH0 opcode',
    'source metadata hash',
  ];
  const details = [
    'core ERC-20 function selectors found',
    'core ERC-721 function selectors found',
    'core ERC-1155 function selectors found',
    '45-byte clone shape (factory-deployed proxies)',
    'EIP-1967 implementation/admin slot found',
    'runtime bytecode uses the PUSH0 opcode',
    'compiler metadata includes a source hash',
  ];
  const counts = [
    data.erc20, data.erc721, data.erc1155,
    data.proxy_minimal || 0, data.proxy_eip1967,
    data.uses_push0, data.has_source_hash,
  ];
  const colors = [
    palette.accent, palette.blue, palette.amber,
    '#00d6ff', palette.red,
    '#9d6cff', palette.dim,
  ];

  charts.standards = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'contracts',
        data: counts,
        backgroundColor: colors.map(c => c + '33'),
        borderColor: colors,
        borderWidth: 1,
        barPercentage: 0.75,
        categoryPercentage: 0.75,
      }],
    },
    options: {
      ...baseChartDefaults,
      indexAxis: 'y',
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      plugins: {
        ...baseChartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          ...baseTooltip,
          callbacks: {
            title: items => labels[items[0].dataIndex],
            label: item => {
              const pct = (item.parsed.x / total * 100).toFixed(2);
              return `${fmtFull(item.parsed.x)} contracts (${pct}% of decoded)`;
            },
            afterLabel: item => details[item.dataIndex],
          },
        },
      },
      scales: {
        x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: v => fmtNumber(v) } },
        y: { ...baseScales.y, ticks: { ...baseScales.y.ticks } },
      },
    },
  });
}

async function loadStandards(chainId = selectedChainId(), epoch = renderEpoch) {
  const data = await fetchJson(chainPathFor(chainId, '/api/standards'));
  if (!canRender(epoch, chainId)) return null;
  renderStandards(data);
  return data;
}

function renderCompilers(data) {
  if (!data.compilers.length) {
    const ctx = document.getElementById('chart-compilers');
    if (charts.compilers) charts.compilers.destroy();
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    c.fillStyle = palette.faint;
    c.font = '11px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.fillText('no compiler data — run `blink decode`', ctx.width / 2, ctx.height / 2);
    return;
  }
  const fullLabels = data.compilers.map(c => c.compiler_version);
  const labels = fullLabels.map(c => c.replace(/^v/, '').split('+')[0]);
  const counts = data.compilers.map(c => c.count);
  const totalKnown = data.total_known || counts.reduce((a, b) => a + b, 0);
  const ctx = document.getElementById('chart-compilers');
  if (charts.compilers) charts.compilers.destroy();
  charts.compilers = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'contracts',
        data: counts,
        backgroundColor: palette.accentSoft,
        borderColor: palette.accent,
        borderWidth: 1,
        barPercentage: 0.85,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      ...baseChartDefaults,
      indexAxis: 'y',
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      plugins: {
        ...baseChartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          ...baseTooltip,
          callbacks: {
            title: items => fullLabels[items[0].dataIndex],
            label: item => {
              const pct = totalKnown > 0 ? (item.parsed.x / totalKnown * 100).toFixed(2) : '0.00';
              return `${fmtFull(item.parsed.x)} contracts (${pct}% of known compilers)`;
            },
          },
        },
      },
      scales: {
        x: { ...baseScales.x, ticks: { ...baseScales.x.ticks, callback: v => fmtNumber(v) } },
        y: { ...baseScales.y, ticks: { ...baseScales.y.ticks } },
      },
    },
  });
}

async function loadCompilers(chainId = selectedChainId(), epoch = renderEpoch) {
  const data = await fetchJson(chainPathFor(chainId, '/api/compilers', { limit: 12 }));
  if (!canRender(epoch, chainId)) return null;
  renderCompilers(data);
  return data;
}

function shortAddr(addr) {
  if (!addr) return '—';
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function verifiedBadge(v) {
  if (v === true)  return '<span class="badge ok">verified</span>';
  if (v === false) return '<span class="badge no">unverified</span>';
  return '<span class="badge dim">unchecked</span>';
}

function renderQueryValue(value) {
  if (value === null || value === undefined) return '<span class="dim-text">NULL</span>';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? fmtFull(value) : String(value);
  return escapeHtml(value);
}

function renderQueryResult(data) {
  const table = document.getElementById('query-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const cols = data.columns || [];
  const rows = data.rows || [];

  thead.innerHTML = cols.length
    ? `<tr>${cols.map(c => `<th title="${escapeHtml(c)}">${escapeHtml(c)}</th>`).join('')}</tr>`
    : '';
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="query-empty">0 rows</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = row.map(value => `<td title="${escapeHtml(value)}">${renderQueryValue(value)}</td>`).join('');
    tbody.appendChild(tr);
  }
}

function clearQueryResult(message = 'no query results') {
  const status = document.getElementById('query-status');
  if (status) status.textContent = 'ready';
  const table = document.getElementById('query-table');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = `<tr><td class="query-empty">${escapeHtml(message)}</td></tr>`;
}

async function runSqlQuery() {
  const button = document.getElementById('query-run');
  const status = document.getElementById('query-status');
  const editor = document.getElementById('query-editor');
  button.disabled = true;
  status.textContent = 'running';
  try {
    const data = await postJson('/api/query', {
      sql: editor.value,
      limit: 200,
      chain_id: selectedChainId(),
    });
    renderQueryResult(data);
    status.textContent = `${fmtFull(data.row_count)} rows · ${fmtFull(data.elapsed_ms)} ms`;
  } catch (err) {
    console.error(err);
    status.textContent = shortError(err.message);
    const tbody = document.querySelector('#query-table tbody');
    tbody.innerHTML = `<tr><td class="query-empty">${escapeHtml(err.message)}</td></tr>`;
  } finally {
    button.disabled = false;
  }
}

function recentPathFor(chainId) {
  const cursor = recentState.cursors[recentState.page];
  const params = new URLSearchParams({ limit: String(recentState.limit) });
  if (cursor) {
    params.set('before_block', String(cursor.block_number));
    params.set('before_create_index', String(cursor.create_index));
  }
  params.set('chain_id', String(chainId));
  return `/api/recent?${params.toString()}`;
}

function renderRecent(data) {
  const tbody = document.querySelector('#recent-table tbody');
  tbody.innerHTML = '';
  for (const c of data.contracts) {
    const tr = document.createElement('tr');
    const safeAddress = escapeHtml(c.address);
    const safeCompiler = c.compiler_version
      ? escapeHtml(c.compiler_version.replace(/^v/, '').split('+')[0])
      : '<span class="dim-text">—</span>';
    const name = c.contract_name
      ? `<span title="${escapeHtml(c.contract_name)}">${escapeHtml(c.contract_name)}</span>`
      : '<span class="dim-text">—</span>';
    tr.innerHTML = `
      <td>${fmtFull(c.block_number)}</td>
      <td><a class="address" href="${explorerAddressUrl(c.address)}" target="_blank" rel="noopener" title="${safeAddress}">${escapeHtml(shortAddr(c.address))}</a></td>
      <td>${name}</td>
      <td>${safeCompiler}</td>
      <td>${fmtBytes(c.n_code_bytes)}</td>
      <td>${verifiedBadge(c.is_verified)}</td>
    `;
    tbody.appendChild(tr);
  }
  recentState.hasMore = Boolean(data.has_more);
  const last = data.contracts[data.contracts.length - 1];
  recentState.nextCursor = last
    ? { block_number: last.block_number, create_index: last.create_index }
    : null;
  const start = recentState.page * recentState.limit + 1;
  const end = recentState.page * recentState.limit + data.contracts.length;
  document.getElementById('recent-range').textContent =
    data.contracts.length === 0 ? '0' : `${fmtFull(start)} – ${fmtFull(end)}`;
  updateRecentPager();
}

function renderRecentUnavailable() {
  const tbody = document.querySelector('#recent-table tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="query-empty">recent deployments unavailable</td></tr>';
  recentState.hasMore = false;
  recentState.nextCursor = null;
  document.getElementById('recent-range').textContent = '—';
  updateRecentPager();
}

async function loadRecent(chainId = selectedChainId(), epoch = renderEpoch) {
  if (recentState.loading) return null;
  recentState.loading = true;
  updateRecentPager();
  try {
    const data = await fetchJson(recentPathFor(chainId));
    if (!canRender(epoch, chainId)) return null;
    renderRecent(data);
    return data;
  } catch (err) {
    if (!canRender(epoch, chainId)) return null;
    logDashboardError('recent deployments', err);
    renderRecentUnavailable();
    return null;
  } finally {
    if (canRender(epoch, chainId)) {
      recentState.loading = false;
      updateRecentPager();
    }
  }
}

function updateRecentPager() {
  document.getElementById('recent-prev').disabled = recentState.loading || recentState.page === 0;
  document.getElementById('recent-next').disabled =
    recentState.loading || !recentState.hasMore || !recentState.nextCursor;
}

function renderDashboardPayload(payload, chainId, epoch) {
  if (!canRender(epoch, chainId)) return false;

  if (payload.stats) renderStats(payload.stats);
  else renderStatsUnavailable();

  const deploys =
    payload.deployBucket === buckets.deploys
      ? payload.deploys
      : cachedChartData('deploys', chainId, buckets.deploys, chartWindows.deploys);
  if (deploys) renderChartTarget('deploys', deploys, buckets.deploys, payload.deployEndBlock);
  else clearCanvasMessage('chart-deploys', 'loading chain data');

  const verified =
    payload.verifiedBucket === buckets.verified
      ? payload.verified
      : cachedChartData('verified', chainId, buckets.verified, chartWindows.verified);
  if (verified) renderChartTarget('verified', verified, buckets.verified, payload.verifiedEndBlock);
  else clearCanvasMessage('chart-verified', 'loading chain data');

  if (payload.sizes) renderSizes(payload.sizes);
  else clearCanvasMessage('chart-sizes', 'size data unavailable');

  if (payload.compilers) renderCompilers(payload.compilers);
  else clearCanvasMessage('chart-compilers', 'compiler data unavailable');

  if (payload.languages) renderLanguages(payload.languages);
  else {
    document.getElementById('m-lang-top').textContent = '—';
    document.getElementById('m-lang-sub').textContent = 'language data unavailable';
  }

  if (payload.standards) renderStandards(payload.standards);
  else {
    document.getElementById('standards-coverage').textContent = 'unavailable';
    clearCanvasMessage('chart-standards', 'standards unavailable');
  }

  recentState.loading = false;
  if (payload.recent) renderRecent(payload.recent);
  else renderRecentUnavailable();

  renderRuntimeStatus(payload.runtime);
  updateFooterRefresh(payload.refreshedAt || new Date().toISOString());
  return true;
}

function renderCachedDashboard() {
  const chainId = selectedChainId();
  const snapshot = readDashboardSnapshot(chainId);
  if (!snapshot) return false;
  chartWindows.deploys = snapshot.deployEndBlock ?? null;
  chartWindows.verified = snapshot.verifiedEndBlock ?? null;
  hydrateChartCacheFromSnapshot(chainId, snapshot);
  return renderDashboardPayload(snapshot, chainId, renderEpoch);
}

function switchChartBucket(target, bucket) {
  const chainId = selectedChainId();
  const endBlock = chartWindows[target];
  const key = chartCacheKey(target, chainId, bucket, endBlock);
  const cached = chartDataCache.get(key);
  const fresh = cached && Date.now() - cached.storedAt <= CHART_CACHE_MS;

  if (cached?.data) {
    renderChartTarget(target, cached.data, bucket, endBlock);
    if (fresh) return;
  } else if (
    lastRenderedCharts[target]?.bucket === bucket &&
    chartWindowKey(lastRenderedCharts[target].endBlock) === chartWindowKey(endBlock)
  ) {
    renderChartTarget(target, lastRenderedCharts[target].data, bucket, endBlock);
  } else {
    showChartLoading(target, bucket);
  }

  fetchChartData(target, chainId, bucket, endBlock, Boolean(cached?.data))
    .then(data => {
      if (
        chainId === selectedChainId() &&
        buckets[target] === bucket &&
        chartWindowKey(chartWindows[target]) === chartWindowKey(endBlock)
      ) {
        renderChartTarget(target, data, bucket, endBlock);
      }
    })
    .catch(err => {
      logDashboardError(`${target} ${bucket}`, err);
      if (
        chainId === selectedChainId() &&
        buckets[target] === bucket &&
        !cached?.data &&
        !charts[chartInstanceKey(target)]
      ) {
        clearCanvasMessage(chartCanvasId(target), `${target} unavailable`);
      }
    });
}

function chartWindowBounds(data) {
  const start = Number(data?.range_start_block);
  const end = Number(data?.range_end_block);
  const latest = Number(data?.latest_block);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return {
    start,
    end,
    latest: Number.isFinite(latest) ? latest : end,
    width: Math.max(1, end - start + 1),
  };
}

function panChartWindow(target, direction) {
  const rendered = lastRenderedCharts[target];
  const bounds = chartWindowBounds(rendered?.data);
  if (!bounds) return;

  if (direction < 0) {
    chartWindows[target] = Math.max(0, bounds.start - 1);
  } else {
    if (bounds.end >= bounds.latest) {
      chartWindows[target] = null;
      writeChartPrefs();
      return;
    }
    const nextEnd = Math.min(bounds.latest, bounds.end + bounds.width);
    chartWindows[target] = nextEnd >= bounds.latest ? null : nextEnd;
  }
  writeChartPrefs();
  switchChartBucket(target, buckets[target]);
}

function attachChartPan() {
  for (const target of ['deploys', 'verified']) {
    const canvas = document.getElementById(chartCanvasId(target));
    if (!canvas) continue;
    canvas.style.touchAction = 'pan-y';

    let pointerId = null;
    let startX = 0;
    let startY = 0;

    canvas.addEventListener('pointerdown', event => {
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      canvas.setPointerCapture(pointerId);
    });

    canvas.addEventListener('pointerup', event => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      pointerId = null;
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      panChartWindow(target, dx > 0 ? -1 : 1);
    });

    canvas.addEventListener('pointercancel', () => {
      pointerId = null;
    });
  }
}

async function refresh({ reset = false } = {}) {
  const epoch = nextRenderEpoch();
  const chainId = selectedChainId();
  const deployBucket = buckets.deploys;
  const verifiedBucket = buckets.verified;
  const deployEndBlock = chartWindows.deploys;
  const verifiedEndBlock = chartWindows.verified;
  const fallback = readDashboardSnapshot(chainId);
  if (fallback) hydrateChartCacheFromSnapshot(chainId, fallback);
  if (reset) {
    resetRecentState();
    resetDashboardForChain();
  }

  const payload = {
    deployBucket,
    verifiedBucket,
    deployEndBlock,
    verifiedEndBlock,
    refreshedAt: fallback?.refreshedAt || new Date().toISOString(),
    runtime: fallback?.runtime || null,
    stats: fallback?.stats || null,
    deploys:
      fallback?.deploys ||
      cachedChartData('deploys', chainId, deployBucket, deployEndBlock),
    verified:
      fallback?.verified ||
      cachedChartData('verified', chainId, verifiedBucket, verifiedEndBlock),
    sizes: fallback?.sizes || null,
    compilers: fallback?.compilers || null,
    languages: fallback?.languages || null,
    standards: fallback?.standards || null,
    recent: fallback?.recent || null,
  };
  let hasFreshData = false;
  const markFresh = () => {
    hasFreshData = true;
    payload.refreshedAt = new Date().toISOString();
    updateFooterRefresh(payload.refreshedAt);
  };

  recentState.loading = true;
  updateRecentPager();

  const runtimeJob = capture('runtime', fetchJson('/api/runtime')).then(runtime => {
    if (!canRender(epoch, chainId)) return runtime;
    if (runtime) {
      payload.runtime = runtime;
      renderRuntimeStatus(runtime);
      markFresh();
    } else {
      renderRuntimeStatus(payload.runtime);
    }
    return runtime;
  });

  const statsJob = capture('stats', fetchJson(chainPathFor(chainId, '/api/stats'))).then(stats => {
    if (!canRender(epoch, chainId)) return stats;
    if (stats) {
      payload.stats = stats;
      renderStats(stats);
      markFresh();
    } else if (!payload.stats) {
      renderStatsUnavailable();
    }
    return stats;
  });

  const deploysJob = capture(
    'deployments chart',
    fetchChartData('deploys', chainId, deployBucket, deployEndBlock, true),
  ).then(deploys => {
    if (
      !canRender(epoch, chainId) ||
      buckets.deploys !== deployBucket ||
      chartWindowKey(chartWindows.deploys) !== chartWindowKey(deployEndBlock)
    ) return deploys;
    if (deploys) {
      payload.deploys = deploys;
      renderChartTarget('deploys', deploys, deployBucket, deployEndBlock);
      markFresh();
      prefetchChartTarget('deploys', chainId, epoch);
    } else if (!payload.deploys) {
      clearCanvasMessage('chart-deploys', 'deployments unavailable');
    }
    return deploys;
  });

  const verifiedJob = capture(
    'verification chart',
    fetchChartData('verified', chainId, verifiedBucket, verifiedEndBlock, true),
  ).then(verified => {
    if (
      !canRender(epoch, chainId) ||
      buckets.verified !== verifiedBucket ||
      chartWindowKey(chartWindows.verified) !== chartWindowKey(verifiedEndBlock)
    ) return verified;
    if (verified) {
      payload.verified = verified;
      renderChartTarget('verified', verified, verifiedBucket, verifiedEndBlock);
      markFresh();
      prefetchChartTarget('verified', chainId, epoch);
    } else if (!payload.verified) {
      clearCanvasMessage('chart-verified', 'verification unavailable');
    }
    return verified;
  });

  prefetchChartBuckets(chainId, epoch);

  const sizesJob = capture(
    'bytecode size chart',
    fetchJson(chainPathFor(chainId, '/api/bytecode-sizes')),
  ).then(sizes => {
    if (!canRender(epoch, chainId)) return sizes;
    if (sizes) {
      payload.sizes = sizes;
      renderSizes(sizes);
      markFresh();
    } else if (!payload.sizes) {
      clearCanvasMessage('chart-sizes', 'size data unavailable');
    }
    return sizes;
  });

  const compilersJob = capture(
    'compiler chart',
    fetchJson(chainPathFor(chainId, '/api/compilers', { limit: 12 })),
  ).then(compilers => {
    if (!canRender(epoch, chainId)) return compilers;
    if (compilers) {
      payload.compilers = compilers;
      renderCompilers(compilers);
      markFresh();
    } else if (!payload.compilers) {
      clearCanvasMessage('chart-compilers', 'compiler data unavailable');
    }
    return compilers;
  });

  const languagesJob = capture(
    'language summary',
    fetchJson(chainPathFor(chainId, '/api/languages')),
  ).then(languages => {
    if (!canRender(epoch, chainId)) return languages;
    if (languages) {
      payload.languages = languages;
      renderLanguages(languages);
      markFresh();
    } else if (!payload.languages) {
      document.getElementById('m-lang-top').textContent = '—';
      document.getElementById('m-lang-sub').textContent = 'language data unavailable';
    }
    return languages;
  });

  const standardsJob = capture(
    'standards chart',
    fetchJson(chainPathFor(chainId, '/api/standards')),
  ).then(standards => {
    if (!canRender(epoch, chainId)) return standards;
    if (standards) {
      payload.standards = standards;
      renderStandards(standards);
      markFresh();
    } else if (!payload.standards) {
      document.getElementById('standards-coverage').textContent = 'unavailable';
      clearCanvasMessage('chart-standards', 'standards unavailable');
    }
    return standards;
  });

  const recentJob = capture('recent deployments', fetchJson(recentPathFor(chainId)))
    .then(recent => {
      if (!canRender(epoch, chainId)) return recent;
      recentState.loading = false;
      if (recent) {
        payload.recent = recent;
        renderRecent(recent);
        markFresh();
      } else if (!payload.recent) {
        renderRecentUnavailable();
      } else {
        updateRecentPager();
      }
      return recent;
    })
    .finally(() => {
      if (canRender(epoch, chainId)) {
        recentState.loading = false;
        updateRecentPager();
      }
    });

  await Promise.all([
    runtimeJob,
    statsJob,
    deploysJob,
    verifiedJob,
    sizesJob,
    compilersJob,
    languagesJob,
    standardsJob,
    recentJob,
  ]);
  if (!canRender(epoch, chainId)) return;
  if (hasFreshData || fallback) writeDashboardSnapshot(chainId, payload);
}

function attachBucketToggles() {
  document.querySelectorAll('.seg').forEach(group => {
    const target = group.dataset.target;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextBucket = btn.dataset.bucket;
        if (buckets[target] === nextBucket) return;
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        buckets[target] = nextBucket;
        writeChartPrefs();
        switchChartBucket(target, nextBucket);
      });
    });
  });
}

function attachRecentPager() {
  document.getElementById('recent-prev').addEventListener('click', () => {
    if (recentState.loading || recentState.page === 0) return;
    recentState.page -= 1;
    loadRecent().catch(console.error);
  });
  document.getElementById('recent-next').addEventListener('click', () => {
    if (recentState.loading || !recentState.hasMore || !recentState.nextCursor) return;
    recentState.page += 1;
    recentState.cursors[recentState.page] = recentState.nextCursor;
    recentState.cursors.length = recentState.page + 1;
    loadRecent().catch(console.error);
  });
}

function attachQueryRunner() {
  const button = document.getElementById('query-run');
  const editor = document.getElementById('query-editor');
  button.addEventListener('click', () => runSqlQuery().catch(console.error));
  editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runSqlQuery().catch(console.error);
    }
  });
}

function attachChainDropdown() {
  const picker = document.getElementById('chain-picker');
  const trigger = document.getElementById('chain-trigger');
  if (!picker || !trigger) return;

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    setChainMenuOpen(!chainState.menuOpen);
  });

  document.addEventListener('click', event => {
    if (!picker.contains(event.target)) setChainMenuOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setChainMenuOpen(false);
  });
}

readChartPrefs();
syncBucketButtons();
attachBucketToggles();
attachChartPan();
attachRecentPager();
attachQueryRunner();
attachChainDropdown();
renderChainDropdown();
updateChainMeta();
resetDashboardForChain();

async function startDashboard() {
  await loadChains();
  const hadSnapshot = renderCachedDashboard();
  if (!hadSnapshot) {
    resetDashboardForChain();
  }
  refresh({ reset: false });
}

startDashboard().catch(err => {
  logDashboardError('startup', err);
  refresh({ reset: false }).catch(console.error);
});
setInterval(() => refresh({ reset: false }), REFRESH_MS);
