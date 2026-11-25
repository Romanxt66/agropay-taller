// API HTTP de la web de AgroPay. Sirve también el frontend compilado.
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { ErrorServicio } = require('./servicio');

const asincrono = fn => (req, res, next) => fn(req, res).catch(next);

/** Límite de peticiones por IP: ventana fija de un minuto, en memoria. */
function limitador(maximo) {
  const cubos = new Map();
  return (req, _res, next) => {
    const ahora = Date.now();
    let cubo = cubos.get(req.ip);
    if (!cubo || cubo.reinicio < ahora) {
      cubo = { n: 0, reinicio: ahora + 60_000 };
      cubos.set(req.ip, cubo);
      if (cubos.size > 5000) for (const [k, v] of cubos) if (v.reinicio < ahora) cubos.delete(k);
    }
    if (++cubo.n > maximo) return next(new ErrorServicio(429, 'Demasiadas peticiones. Espera un momento.'));
    next();
  };
}

function crearApp(servicio, { carpetaWeb, limitePorMinuto = 300, limiteReinicios = 6 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.set({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  app.get('/health', asincrono(async (_req, res) => {
    await servicio.leerEstado();
    res.json({ ok: true });
  }));

  const api = express.Router();
  api.use(limitador(limitePorMinuto));
  api.use((req, _res, next) => {
    if (req.method === 'POST') {
      if (req.get('sec-fetch-site') === 'cross-site') return next(new ErrorServicio(403, 'Petición no permitida.'));
      if (!req.is('application/json')) return next(new ErrorServicio(415, 'Se esperaba contenido JSON.'));
    }
    next();
  });
  api.use(express.json({ limit: '8kb' }));

  api.get('/estado', asincrono(async (_req, res) => res.json(await servicio.leerEstado())));
  api.get('/eventos', asincrono(async (_req, res) => res.json(await servicio.eventos())));
  api.post('/garantia', asincrono(async (req, res) => res.status(201).json(await servicio.depositar(req.body ?? {}))));
  api.post('/lecturas', asincrono(async (req, res) => res.status(201).json(await servicio.enviarLectura(req.body ?? {}))));
  api.post('/retiros', asincrono(async (req, res) => res.status(201).json(await servicio.retirar(req.body ?? {}))));
  api.post('/reconstruir', asincrono(async (_req, res) => res.json(await servicio.reconstruirProyeccion())));
  // Reiniciar redespliega el contrato: tiene su propio límite, más estricto
  api.post('/reiniciar', limitador(limiteReinicios), asincrono(async (_req, res) => res.status(201).json(await servicio.reiniciar())));
  api.use((_req, _res, next) => next(new ErrorServicio(404, 'No encontrado.')));
  app.use('/api', api);

  if (carpetaWeb && fs.existsSync(carpetaWeb)) {
    app.use(express.static(carpetaWeb, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(carpetaWeb, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ErrorServicio) return res.status(err.estado).json({ error: err.message, codigo: err.codigo });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
    console.error('Error interno:', err);
    res.status(500).json({ error: 'Ocurrió un error interno. Inténtalo de nuevo.' });
  });

  return app;
}

module.exports = { crearApp };
