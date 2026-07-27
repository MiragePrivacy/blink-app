const API_BASE = 'https://blink-api.mirageprivacy.com';

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function readJsonResponse(response, path) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`request failed (${response.status})`);
    err.path = path;
    err.detail = data.error || `${path} \u2192 ${response.status}`;
    throw err;
  }
  return data;
}

export async function fetchJson(path) {
  const response = await fetch(apiUrl(path));
  return readJsonResponse(response, path);
}

export async function postJson(path, payload) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, path);
}
