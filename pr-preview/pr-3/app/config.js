export const REFRESH_MS = 30_000;
export const CHART_CACHE_MS = 60_000;
export const SNAPSHOT_CACHE_MS = 300_000;
export const CHART_PREFS_KEY = 'blink.chart_prefs';

export const palette = {
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
