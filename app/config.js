export const REFRESH_MS = 30_000;
export const CHART_CACHE_MS = 60_000;
export const SNAPSHOT_CACHE_MS = 300_000;
export const DASHBOARD_SNAPSHOT_PREFIX = 'blink.dashboard.v2';
export const CHART_PREFS_KEY = 'blink.chart_prefs';
export const THEME_KEY = 'blink.theme';

const chartThemes = {
  dark: {
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
    cyan: '#00d6ff',
    purple: '#9d6cff',
    text: '#ededed',
    dim: '#707070',
    faint: '#404040',
    grid: 'rgba(255, 255, 255, 0.04)',
    axis: 'rgba(255, 255, 255, 0.06)',
    bg: '#050505',
    tooltipBg: '#000',
    tooltipBorder: '#262626',
    pointContrast: '#000',
  },
  light: {
    accent: '#5f8000',
    accentSoft: 'rgba(95, 128, 0, 0.16)',
    accentLine: 'rgba(95, 128, 0, 0.85)',
    red: '#d43030',
    redSoft: 'rgba(212, 48, 48, 0.16)',
    ash: '#7a7f88',
    ashSoft: 'rgba(122, 127, 136, 0.16)',
    blue: '#1d6fd1',
    blueSoft: 'rgba(29, 111, 209, 0.16)',
    amber: '#b3730a',
    cyan: '#0193b3',
    purple: '#7a4fd6',
    text: '#191919',
    dim: '#64645f',
    faint: '#a6a69e',
    grid: 'rgba(0, 0, 0, 0.05)',
    axis: 'rgba(0, 0, 0, 0.08)',
    bg: '#f4f4f1',
    tooltipBg: '#fff',
    tooltipBorder: '#cccdc4',
    pointContrast: '#fff',
  },
};

export const palette = { ...chartThemes.dark };

export function applyChartTheme(theme) {
  Object.assign(palette, chartThemes[theme] || chartThemes.dark);
  baseScales.x.ticks.color = palette.dim;
  baseScales.x.grid.color = palette.grid;
  baseScales.x.border.color = palette.axis;
  baseScales.y.ticks.color = palette.dim;
  baseScales.y.grid.color = palette.grid;
  baseTooltip.backgroundColor = palette.tooltipBg;
  baseTooltip.borderColor = palette.tooltipBorder;
  baseTooltip.titleColor = palette.text;
  baseTooltip.bodyColor = palette.text;
  baseChartDefaults.plugins.legend.labels.color = palette.dim;
}

export const baseScales = {
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

export const baseTooltip = {
  backgroundColor: palette.tooltipBg,
  borderColor: palette.tooltipBorder,
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

export const baseChartDefaults = {
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

export const defaultChains = [
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
    short_name: 'GNOSIS',
    native_symbol: 'xDAI',
    explorer_url: 'https://gnosisscan.io',
    icon_key: 'gnosis',
  },
];

export function configureChartDefaults(Chart) {
  Chart.defaults.color = palette.dim;
  Chart.defaults.borderColor = palette.grid;
  Chart.defaults.font.family = '"JetBrains Mono", ui-monospace, monospace';
  Chart.defaults.font.size = 10.5;
}
