import app from '../src/server.js';

type Req = any;
type Res = any;

const rewriteUrl = (req: Req): void => {
  const fromQuery = req.query?.path;
  const requested =
    typeof fromQuery === 'string'
      ? fromQuery
      : Array.isArray(fromQuery) && typeof fromQuery[0] === 'string'
        ? fromQuery[0]
        : req.url || '/api';
  const path = requested.startsWith('/') ? requested : `/${requested}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const query = params.toString();
  req.url = `${path}${query ? `?${query}` : ''}`;
};

export default async function handler(req: Req, res: Res): Promise<void> {
  rewriteUrl(req);
  await new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    res.once('finish', done);
    res.once('close', done);
    app(req, res, (error?: unknown) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
