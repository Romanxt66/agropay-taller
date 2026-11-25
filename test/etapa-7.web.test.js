// Etapa 7: la web. Se prueba la API completa sobre la red local de Hardhat, sin simulaciones.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { crearServicio } = require('../servidor/servicio');
const { crearApp } = require('../servidor/app');

describe('Etapa 7 · Servicio y API de la web', () => {
  let servidor;
  let base;
  const json = { 'Content-Type': 'application/json' };
  const post = (ruta, cuerpo, cabeceras = json) =>
    fetch(base + ruta, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) });
  const lectura = (extra = {}) => ({ idLote: 1, temperatura: 3, acidez: 16, productor: 0, montoEth: '1', ...extra });

  beforeEach(async () => {
    const servicio = await crearServicio({ ethers });
    servidor = crearApp(servicio, { limiteReinicios: 100 }).listen(0);
    base = `http://127.0.0.1:${servidor.address().port}`;
  });
  afterEach(() => servidor.close());

  it('responde la salud y el estado inicial', async () => {
    expect((await fetch(base + '/health')).status).to.equal(200);
    const estado = await (await fetch(base + '/api/estado')).json();
    expect(estado.garantiaWei).to.equal('0');
    expect(estado.limites).to.deep.equal({ temperaturaMaxima: 4, acidezMinima: 14, acidezMaxima: 18 });
    expect(estado.productores).to.have.length(3);
  });

  it('recorre depósito, lectura aprobada y retiro con eventos proyectados', async () => {
    expect((await post('/api/garantia', { eth: '2' })).status).to.equal(201);
    const r = await post('/api/lecturas', lectura());
    expect(r.status).to.equal(201);
    const cuerpo = await r.json();
    expect(cuerpo.resultado.aprobada).to.equal(true);
    expect(cuerpo.resultado.txHash).to.match(/^0x[0-9a-f]{64}$/);

    let estado = await (await fetch(base + '/api/estado')).json();
    expect(estado.garantiaWei).to.equal(ethers.parseEther('1').toString());
    expect(estado.productores[0].pendienteWei).to.equal(ethers.parseEther('1').toString());

    expect((await post('/api/retiros', { productor: 0 })).status).to.equal(201);
    estado = await (await fetch(base + '/api/estado')).json();
    expect(estado.productores[0].pendienteWei).to.equal('0');

    const eventos = await (await fetch(base + '/api/eventos')).json();
    expect(eventos.map(e => e.tipo)).to.deep.equal(['GarantiaDepositada', 'PagoAutorizado', 'PagoRetirado']);
  });

  it('una lectura fuera de reglas no envía transacción y explica los motivos', async () => {
    await post('/api/garantia', { eth: '2' });
    const cuerpo = await (await post('/api/lecturas', lectura({ temperatura: 9, acidez: 20 }))).json();
    expect(cuerpo.resultado.aprobada).to.equal(false);
    expect(cuerpo.resultado.txHash).to.equal(null);
    expect(cuerpo.resultado.motivos).to.have.length(2);
    const eventos = await (await fetch(base + '/api/eventos')).json();
    expect(eventos.map(e => e.tipo)).to.deep.equal(['GarantiaDepositada']);
  });

  it('rechaza una lectura repetida y una lectura alterada', async () => {
    await post('/api/garantia', { eth: '2' });
    expect((await post('/api/lecturas', lectura({ prueba: 'repetida' }))).status).to.equal(409);
    await post('/api/lecturas', lectura());
    const repetida = await (await post('/api/lecturas', lectura({ idLote: 2, prueba: 'repetida' }))).json();
    expect(repetida.rechazo.codigo).to.equal('LECTURA_REPETIDA');
    const alterada = await (await post('/api/lecturas', lectura({ idLote: 3, prueba: 'alterada' }))).json();
    expect(alterada.rechazo.codigo).to.equal('FIRMA_INVALIDA');
  });

  it('traduce los errores del contrato: lote repetido, fondos y retiro sin saldo', async () => {
    await post('/api/garantia', { eth: '1' });
    await post('/api/lecturas', lectura());
    const repetido = await post('/api/lecturas', lectura());
    expect(repetido.status).to.equal(409);
    expect((await repetido.json()).codigo).to.equal('LOTE_REPETIDO');

    const sinFondos = await post('/api/lecturas', lectura({ idLote: 2, montoEth: '5' }));
    expect(sinFondos.status).to.equal(409);
    expect((await sinFondos.json()).codigo).to.equal('FONDOS_INSUFICIENTES');

    const sinSaldo = await post('/api/retiros', { productor: 1 });
    expect(sinSaldo.status).to.equal(409);
    expect((await sinSaldo.json()).codigo).to.equal('SIN_SALDO');
  });

  it('valida las entradas', async () => {
    expect((await post('/api/garantia', { eth: '0' })).status).to.equal(400);
    expect((await post('/api/garantia', { eth: '999' })).status).to.equal(400);
    expect((await post('/api/garantia', { eth: 'abc' })).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ idLote: 1.5 }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ temperatura: '3' }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ productor: 9 }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ prueba: 'x' }))).status).to.equal(400);
    expect((await post('/api/retiros', { productor: 9 })).status).to.equal(400);
  });

  it('exige JSON y rechaza peticiones de otros sitios', async () => {
    const texto = await fetch(base + '/api/garantia', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(texto.status).to.equal(415);
    const otro = await post('/api/garantia', { eth: '1' }, { ...json, 'Sec-Fetch-Site': 'cross-site' });
    expect(otro.status).to.equal(403);
  });

  it('reconstruye la proyección y reinicia con un contrato nuevo', async () => {
    await post('/api/garantia', { eth: '2' });
    await post('/api/lecturas', lectura());
    const rec = await (await post('/api/reconstruir', {})).json();
    expect(rec).to.deep.equal({ leidos: 2, nuevos: 2 });
    const antes = (await (await fetch(base + '/api/estado')).json()).contrato;
    expect((await post('/api/reiniciar', {})).status).to.equal(201);
    const despues = await (await fetch(base + '/api/estado')).json();
    expect(despues.contrato).to.not.equal(antes);
    expect(despues.garantiaWei).to.equal('0');
    expect(await (await fetch(base + '/api/eventos')).json()).to.deep.equal([]);
  });

  it('operaciones simultáneas no se pisan', async () => {
    await post('/api/garantia', { eth: '10' });
    const respuestas = await Promise.all(
      Array.from({ length: 8 }, (_, i) => post('/api/lecturas', lectura({ idLote: 100 + i, productor: i % 3 }))),
    );
    expect(respuestas.map(r => r.status)).to.deep.equal(Array(8).fill(201));
    const estado = await (await fetch(base + '/api/estado')).json();
    expect(estado.garantiaWei).to.equal(ethers.parseEther('2').toString());
  });

  it('los errores internos no filtran detalles', async () => {
    const roto = { leerEstado: async () => { throw new Error('conexión interna 10.0.0.5 caída'); } };
    const s = crearApp(roto).listen(0);
    const r = await fetch(`http://127.0.0.1:${s.address().port}/health`);
    const texto = await r.text();
    s.close();
    expect(r.status).to.equal(500);
    expect(texto).to.not.match(/10\.0\.0\.5|conexión/);
  });
});
