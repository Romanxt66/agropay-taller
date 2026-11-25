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
  const lectura = (extra = {}) => ({ idLote: 1, temperatura: 3, acidez: 16, productor: 2, montoEth: '1', ...extra });

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

    expect((await post('/api/retiros', { productor: 2 })).status).to.equal(201);
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

    const sinSaldo = await post('/api/retiros', { productor: 3 });
    expect(sinSaldo.status).to.equal(409);
    expect((await sinSaldo.json()).codigo).to.equal('SIN_SALDO');
  });

  it('valida las entradas', async () => {
    expect((await post('/api/garantia', { eth: '999' })).status).to.equal(400);
    expect((await post('/api/garantia', { eth: 'abc' })).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ idLote: 1.5 }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ temperatura: '3' }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ productor: 99 }))).status).to.equal(400);
    expect((await post('/api/lecturas', lectura({ prueba: 'x' }))).status).to.equal(400);
    expect((await post('/api/retiros', { productor: 99 })).status).to.equal(400);
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
      Array.from({ length: 8 }, (_, i) => post('/api/lecturas', lectura({ idLote: 100 + i, productor: 2 + (i % 3) }))),
    );
    expect(respuestas.map(r => r.status)).to.deep.equal(Array(8).fill(201));
    const estado = await (await fetch(base + '/api/estado')).json();
    expect(estado.garantiaWei).to.equal(ethers.parseEther('2').toString());
  });

  describe('selección de cuenta (el índice que informa /api/estado es el que se envía)', () => {
    it('una lectura paga a la cuenta elegida, para cada productor de la lista', async () => {
      await post('/api/garantia', { eth: '10' });
      const { productores } = await (await fetch(base + '/api/estado')).json();
      for (const [i, p] of productores.entries()) {
        const r = await post('/api/lecturas', lectura({ idLote: 20 + i, productor: p.indice, montoEth: String(i + 1) }));
        expect(r.status, `lectura para ${p.nombre}`).to.equal(201);
      }
      const estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.productores.map(p => p.pendienteWei)).to.deep.equal(
        [1, 2, 3].map(n => ethers.parseEther(String(n)).toString()),
      );
      // Ninguna otra cuenta recibió nada
      const otras = estado.cuentas.filter(c => ![2, 3, 4].includes(c.indice));
      expect(otras.every(c => c.pendienteWei === '0')).to.equal(true);
    });

    it('el retiro usa la misma numeración, por /retiros y por /contrato/retiro', async () => {
      await post('/api/garantia', { eth: '10' });
      await post('/api/lecturas', lectura({ idLote: 1, productor: 3 }));
      await post('/api/lecturas', lectura({ idLote: 2, productor: 4 }));
      expect((await post('/api/retiros', { productor: 3 })).status).to.equal(201);
      expect((await post('/api/contrato/retiro', { cuenta: 4 })).status).to.equal(201);
      const estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.cuentas.slice(2, 5).map(c => c.pendienteWei)).to.deep.equal(['0', '0', '0']);
    });

    it('una lectura puede pagar a cualquiera de las 10 cuentas y rechaza las que no existen', async () => {
      await post('/api/garantia', { eth: '5' });
      expect((await post('/api/lecturas', lectura({ idLote: 7, productor: 8 }))).status).to.equal(201);
      const estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.cuentas[8].pendienteWei).to.equal(ethers.parseEther('1').toString());
      expect((await post('/api/lecturas', lectura({ idLote: 8, productor: 10 }))).status).to.equal(400);
      expect((await post('/api/lecturas', lectura({ idLote: 8, productor: -1 }))).status).to.equal(400);
    });
  });

  describe('todas las funciones del contrato', () => {
    const cero = '0x0000000000000000000000000000000000000000';
    const json2 = async r => ({ estado: r.status, ...(await r.json()) });

    it('depositar desde cualquier cuenta y con monto cero muestra MontoInvalido', async () => {
      expect((await post('/api/contrato/deposito', { eth: '1', cuenta: 5 })).status).to.equal(201);
      const cuerpo = await json2(await post('/api/contrato/deposito', { eth: '0', cuenta: 0 }));
      expect(cuerpo).to.include({ estado: 409, codigo: 'MONTO_INVALIDO', revert: 'MontoInvalido' });
      const eventos = await (await fetch(base + '/api/eventos')).json();
      expect(eventos).to.have.length(1);
    });

    it('autorizarPago directo: solo el oráculo, y valida dirección, monto, lote y fondos', async () => {
      await post('/api/contrato/deposito', { eth: '2', cuenta: 0 });
      const intento = (extra = {}) =>
        post('/api/contrato/autorizar', { cuenta: 1, idLote: 5, destino: { cuenta: 2 }, montoEth: '1', ...extra }).then(json2);
      expect(await intento({ cuenta: 3 })).to.include({ estado: 409, codigo: 'SOLO_ORACULO' });
      expect(await intento({ destino: { direccion: cero } })).to.include({ codigo: 'DIRECCION_INVALIDA' });
      expect(await intento({ montoEth: '0' })).to.include({ codigo: 'MONTO_INVALIDO' });
      expect(await intento({ montoEth: '9' })).to.include({ codigo: 'FONDOS_INSUFICIENTES' });
      expect((await intento()).estado).to.equal(201);
      expect(await intento()).to.include({ codigo: 'LOTE_REPETIDO' });
      expect((await post('/api/contrato/autorizar', { cuenta: 1, idLote: 6, destino: { direccion: 'hola' }, montoEth: '1' })).status).to.equal(400);
    });

    it('retirar desde cualquier cuenta y consultar las cuatro vistas', async () => {
      await post('/api/contrato/deposito', { eth: '2', cuenta: 0 });
      await post('/api/contrato/autorizar', { cuenta: 1, idLote: 8, destino: { cuenta: 7 }, montoEth: '1' });
      const estado = await (await fetch(base + '/api/estado')).json();
      const cuenta7 = estado.cuentas[7];
      const consulta = await (await fetch(`${base}/api/consulta?saldo=${cuenta7.direccion}&lote=8`)).json();
      expect(consulta.oraculo).to.equal(estado.oraculo);
      expect(consulta.garantiaWei).to.equal(ethers.parseEther('1').toString());
      expect(consulta.saldoDe.pendienteWei).to.equal(ethers.parseEther('1').toString());
      expect(consulta.lote.autorizado).to.equal(true);
      expect((await (await fetch(`${base}/api/consulta?lote=9`)).json()).lote.autorizado).to.equal(false);
      expect((await fetch(`${base}/api/consulta?saldo=xyz`)).status).to.equal(400);

      expect((await post('/api/contrato/retiro', { cuenta: 7 })).status).to.equal(201);
      expect((await json2(await post('/api/contrato/retiro', { cuenta: 7 })))).to.include({ codigo: 'SIN_SALDO' });
      expect((await post('/api/contrato/retiro', { cuenta: 99 })).status).to.equal(400);
    });

    it('el receptor que rechaza provoca FalloTransferencia y conserva el saldo', async () => {
      await post('/api/contrato/deposito', { eth: '2', cuenta: 0 });
      const r = await (await post('/api/practica/receptor', { montoEth: '1' })).json();
      expect(r.intento).to.include({ exito: false, codigo: 'FALLO_TRANSFERENCIA' });
      expect(r.pendienteWei).to.equal(ethers.parseEther('1').toString());
      const estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.practicas).to.have.length(1);
      expect(estado.practicas[0].pendienteWei).to.equal(ethers.parseEther('1').toString());
    });

    it('el atacante de reentrada cobra una sola vez', async () => {
      await post('/api/contrato/deposito', { eth: '3', cuenta: 0 });
      const r = await (await post('/api/practica/atacante', { montoEth: '1' })).json();
      expect(r).to.include({ intentosReentrada: 1, reentradaExitosa: false, pendienteWei: '0' });
      expect(r.recibidoWei).to.equal(ethers.parseEther('1').toString());
    });

    it('limita los contratos de práctica y los borra al reiniciar', async () => {
      await post('/api/contrato/deposito', { eth: '10', cuenta: 0 });
      for (let i = 0; i < 5; i += 1) expect((await post('/api/practica/atacante', { montoEth: '1' })).status).to.equal(201);
      expect((await post('/api/practica/atacante', { montoEth: '1' })).status).to.equal(409);
      await post('/api/reiniciar', {});
      expect((await (await fetch(base + '/api/estado')).json()).practicas).to.have.length(0);
    });

    it('reiniciar con otra cuenta como oráculo y con la dirección cero', async () => {
      expect((await post('/api/reiniciar', { oraculo: 5 })).status).to.equal(201);
      let estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.oraculoIndice).to.equal(5);
      expect(estado.cuentas[5].nombre).to.equal('Oráculo');
      await post('/api/garantia', { eth: '2' });
      const lecturaOk = await (await post('/api/lecturas', lectura())).json();
      expect(lecturaOk.resultado.aprobada).to.equal(true);

      const antes = estado.contrato;
      expect(await json2(await post('/api/reiniciar', { oraculo: 'cero' }))).to.include({ estado: 409, codigo: 'DIRECCION_INVALIDA' });
      estado = await (await fetch(base + '/api/estado')).json();
      expect(estado.contrato).to.equal(antes);
      expect((await post('/api/reiniciar', { oraculo: 3 })).status).to.equal(400);
    });
  });

  it('reiniciar las cuentas devuelve a las 10 su saldo inicial y deja un contrato nuevo', async () => {
    await post('/api/garantia', { eth: '10' });
    await post('/api/lecturas', lectura({ productor: 3 }));
    await post('/api/contrato/retiro', { cuenta: 3 });
    await post('/api/practica/atacante', { montoEth: '1' });
    const antes = await (await fetch(base + '/api/estado')).json();
    expect(antes.cuentas.some(c => c.balanceWei !== ethers.parseEther('10000').toString())).to.equal(true);

    expect((await post('/api/reiniciar-cuentas', {})).status).to.equal(201);
    const despues = await (await fetch(base + '/api/estado')).json();
    expect(despues.contrato).to.not.equal(antes.contrato);
    expect(despues.garantiaWei).to.equal('0');
    expect(despues.oraculoIndice).to.equal(1);
    expect(despues.practicas).to.have.length(0);
    expect(despues.cuentas).to.have.length(10);
    for (const c of despues.cuentas) {
      expect(c.balanceWei, `saldo de ${c.nombre}`).to.equal(ethers.parseEther('10000').toString());
      expect(c.pendienteWei).to.equal('0');
    }
    expect(await (await fetch(base + '/api/eventos')).json()).to.deep.equal([]);
    // Todo sigue funcionando después del reinicio
    expect((await post('/api/garantia', { eth: '1' })).status).to.equal(201);
    expect((await post('/api/lecturas', lectura({ idLote: 1 }))).status).to.equal(201);
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
