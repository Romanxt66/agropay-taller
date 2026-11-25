// Servicio de la web: une los componentes del taller (contrato, oráculo, reglas, indexador)
// sobre una red local de Hardhat que vive en memoria. Los fondos no tienen valor monetario.
// Expone TODAS las funciones de GarantiaAgroPay y los contratos de práctica.
const crypto = require('node:crypto');
const { LIMITES } = require('../src/reglas');
const { firmarLectura, crearVerificador, procesarLectura } = require('../src/oraculo');
const { sincronizar, reconstruir } = require('../src/indexador');
const { RepositorioMemoria } = require('../src/repositorio-memoria');

const NUM_CUENTAS = 10;
const BASE_CUENTAS = ['Depositante', 'Cuenta 2', 'Productor 1', 'Productor 2', 'Productor 3', 'Cuenta 6', 'Cuenta 7', 'Cuenta 8', 'Cuenta 9', 'Cuenta 10'];
const INDICES_ORACULO = [1, 5, 6, 7, 8, 9];
const MAX_ETH = 50;
const MAX_PRACTICAS = 5;
const LOTE_PRACTICA_BASE = 3_000_000_000n;

class ErrorServicio extends Error {
  constructor(estado, mensaje, codigo, revert) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.revert = revert;
  }
}

/** Convierte un monto decimal escrito por la persona en wei, o falla con un mensaje claro. */
function leerEth(ethers, valor, nombre, { permitirCero = false } = {}) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,6})?$/.test(texto)) {
    throw new ErrorServicio(400, `${nombre} debe ser un número positivo con hasta 6 decimales.`);
  }
  const wei = ethers.parseEther(texto);
  if ((wei === 0n && !permitirCero) || wei > ethers.parseEther(String(MAX_ETH))) {
    throw new ErrorServicio(400, `${nombre} debe estar entre 0,000001 y ${MAX_ETH} ETH.`);
  }
  return wei;
}

function numeroEnRango(valor, nombre, min, max) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new ErrorServicio(400, `${nombre} debe ser un número entre ${min} y ${max}.`);
  }
  return valor;
}

async function crearServicio({ ethers }) {
  const firmantes = (await ethers.getSigners()).slice(0, NUM_CUENTAS);
  const productores = firmantes.slice(2, 5);

  let oraculoIndice = 1;
  let contrato;
  let verificador;
  let repositorio;
  let ultimoPaquete;
  let practicas = [];
  let contadorPractica = 0;
  const oraculo = () => firmantes[oraculoIndice];

  // Una sola operación a la vez: así los nonces de las cuentas nunca se cruzan
  let cola = Promise.resolve();
  const enCola = tarea => {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => {});
    return resultado;
  };

  const etiquetaCuenta = i => (i === oraculoIndice ? 'Oráculo' : BASE_CUENTAS[i]);

  async function desplegar(indiceOraculo) {
    const direccion = indiceOraculo === null ? ethers.ZeroAddress : firmantes[indiceOraculo].address;
    const fabrica = await ethers.getContractFactory('GarantiaAgroPay');
    const nuevo = await fabrica.deploy(direccion);
    await nuevo.waitForDeployment();
    contrato = nuevo;
    oraculoIndice = indiceOraculo;
    verificador = crearVerificador(direccion);
    repositorio = new RepositorioMemoria();
    ultimoPaquete = null;
    practicas = [];
  }
  await desplegar(1);

  const cuentaDe = indice => {
    if (!Number.isInteger(indice) || indice < 0 || indice >= NUM_CUENTAS) {
      throw new ErrorServicio(400, 'Elige una cuenta de la lista.');
    }
    return firmantes[indice];
  };

  const leerDestino = destino => {
    if (Number.isInteger(destino?.cuenta)) return cuentaDe(destino.cuenta).address;
    if (typeof destino?.direccion === 'string' && ethers.isAddress(destino.direccion)) return ethers.getAddress(destino.direccion.toLowerCase());
    throw new ErrorServicio(400, 'Elige una cuenta o escribe una dirección válida que empiece con 0x.');
  };

  /** Traduce un fallo de la cadena a un mensaje en español, sin detalles internos. */
  function traducirFallo(error) {
    if (error instanceof ErrorServicio) return error;
    const datos = error?.data ?? error?.info?.error?.data;
    let revertido = error?.revert ?? null;
    if (!revertido && typeof datos === 'string') {
      try {
        revertido = contrato.interface.parseError(datos);
      } catch {
        revertido = null;
      }
    }
    const fmt = wei => `${ethers.formatEther(wei).replace(/\.0$/, '').replace('.', ',')} ETH`;
    const a = revertido?.args ?? [];
    const nombre = revertido?.name;
    switch (nombre) {
      case 'LoteYaAutorizado':
        return new ErrorServicio(409, `El lote ${a[0]} ya tiene un pago autorizado. Usa otro número de lote.`, 'LOTE_REPETIDO', nombre);
      case 'FondosInsuficientes':
        return new ErrorServicio(409, `La garantía disponible (${fmt(a[0])}) no alcanza para pagar ${fmt(a[1])}. Deposita más garantía.`, 'FONDOS_INSUFICIENTES', nombre);
      case 'SinSaldoPendiente':
        return new ErrorServicio(409, 'Esta cuenta no tiene saldo pendiente de retiro.', 'SIN_SALDO', nombre);
      case 'MontoInvalido':
        return new ErrorServicio(409, 'El monto debe ser mayor que cero.', 'MONTO_INVALIDO', nombre);
      case 'DireccionInvalida':
        return new ErrorServicio(409, 'La dirección no puede ser la dirección cero.', 'DIRECCION_INVALIDA', nombre);
      case 'SoloOraculo':
        return new ErrorServicio(409, `Solo el oráculo puede autorizar pagos. La cuenta que llamó (${a[0]}) no lo es.`, 'SOLO_ORACULO', nombre);
      case 'FalloTransferencia':
        return new ErrorServicio(409, 'El destinatario rechazó el pago. El saldo sigue pendiente y no se pierde.', 'FALLO_TRANSFERENCIA', nombre);
      default:
        console.error('Fallo inesperado en la cadena:', error);
        return new ErrorServicio(500, 'No pudimos completar la operación en la red local.', 'CADENA');
    }
  }

  const protegido = tarea => enCola(async () => {
    try {
      return await tarea();
    } catch (error) {
      throw traducirFallo(error);
    }
  });

  const sync = () => sincronizar({ contrato, repositorio });

  async function estado() {
    const [garantia, bloque, red] = await Promise.all([
      contrato.garantiaDisponible(),
      ethers.provider.getBlockNumber(),
      ethers.provider.getNetwork(),
    ]);
    const cuentas = await Promise.all(
      firmantes.map(async (f, indice) => ({
        indice,
        nombre: etiquetaCuenta(indice),
        direccion: f.address,
        esOraculo: indice === oraculoIndice,
        pendienteWei: (await contrato.saldoPendiente(f.address)).toString(),
        balanceWei: (await ethers.provider.getBalance(f.address)).toString(),
      })),
    );
    const contratosPractica = await Promise.all(
      practicas.map(async p => ({
        tipo: p.tipo,
        nombre: p.nombre,
        direccion: p.direccion,
        pendienteWei: (await contrato.saldoPendiente(p.direccion)).toString(),
        balanceWei: (await ethers.provider.getBalance(p.direccion)).toString(),
      })),
    );
    return {
      contrato: await contrato.getAddress(),
      oraculo: oraculoIndice === null ? ethers.ZeroAddress : firmantes[oraculoIndice].address,
      oraculoIndice,
      depositante: firmantes[0].address,
      chainId: Number(red.chainId),
      bloque,
      garantiaWei: garantia.toString(),
      limites: LIMITES,
      maxEth: MAX_ETH,
      productores: cuentas.slice(2, 5),
      cuentas,
      practicas: contratosPractica,
      indicesOraculo: INDICES_ORACULO,
    };
  }

  const leerEstado = () => enCola(estado);
  const eventos = () => enCola(() => repositorio.listarEventos());

  /** Las cuatro consultas de solo lectura del contrato. */
  const consultar = ({ saldo, lote } = {}) => enCola(async () => {
    const respuesta = {
      oraculo: await contrato.oraculo(),
      garantiaWei: (await contrato.garantiaDisponible()).toString(),
    };
    if (saldo !== undefined) {
      if (!ethers.isAddress(saldo)) throw new ErrorServicio(400, 'La dirección para consultar el saldo no es válida.');
      respuesta.saldoDe = { direccion: saldo, pendienteWei: (await contrato.saldoPendiente(saldo)).toString() };
    }
    if (lote !== undefined) {
      if (!/^\d{1,10}$/.test(String(lote))) throw new ErrorServicio(400, 'El número de lote debe ser un entero positivo.');
      respuesta.lote = { idLote: String(lote), autorizado: await contrato.loteAutorizado(BigInt(lote)) };
    }
    return respuesta;
  });

  // ---- depositarGarantia ----
  const depositar = ({ eth, cuenta = 0 }) => protegido(async () => {
    const monto = leerEth(ethers, eth, 'El monto de la garantía', { permitirCero: true });
    const quien = cuentaDe(cuenta);
    const recibo = await (await contrato.connect(quien).depositarGarantia({ value: monto })).wait();
    await sync();
    return { txHash: recibo.hash, desde: quien.address };
  });

  // ---- autorizarPago (llamada directa, sin pasar por una lectura) ----
  const autorizarDirecto = ({ cuenta = oraculoIndice, idLote, destino, montoEth }) => protegido(async () => {
    const quien = cuentaDe(cuenta);
    if (!Number.isInteger(idLote) || idLote < 0 || idLote > 1_000_000_000) {
      throw new ErrorServicio(400, 'El número de lote debe ser un entero entre 0 y 1.000.000.000.');
    }
    const productor = leerDestino(destino);
    const monto = leerEth(ethers, montoEth, 'El monto del pago', { permitirCero: true });
    const recibo = await (await contrato.connect(quien).autorizarPago(idLote, productor, monto)).wait();
    await sync();
    return { txHash: recibo.hash, desde: quien.address };
  });

  // ---- retirar ----
  const retirar = body => protegido(async () => {
    const quien = Number.isInteger(body?.cuenta) ? cuentaDe(body.cuenta) : productores[body?.productor];
    if (!quien) throw new ErrorServicio(400, 'Elige una cuenta de la lista.');
    const pendiente = await contrato.saldoPendiente(quien.address);
    const recibo = await (await contrato.connect(quien).retirar()).wait();
    await sync();
    return { txHash: recibo.hash, montoWei: pendiente.toString(), desde: quien.address };
  });

  // ---- Lectura firmada por el oráculo ----
  const enviarLectura = body => protegido(async () => {
    if (oraculoIndice === null) throw new ErrorServicio(409, 'La red no tiene un oráculo válido. Reiníciala con una cuenta de oráculo.');
    const idLote = body?.idLote;
    if (!Number.isInteger(idLote) || idLote < 1 || idLote > 1_000_000_000) {
      throw new ErrorServicio(400, 'El número de lote debe ser un entero entre 1 y 1.000.000.000.');
    }
    const temperatura = numeroEnRango(body.temperatura, 'La temperatura', -50, 100);
    const acidez = numeroEnRango(body.acidez, 'La acidez', 0, 100);
    const productor = productores[body.productor];
    if (!productor) throw new ErrorServicio(400, 'Elige un productor de la lista.');
    const monto = leerEth(ethers, body.montoEth, 'El monto del pago');
    const prueba = body.prueba ?? 'normal';
    if (!['normal', 'repetida', 'alterada'].includes(prueba)) {
      throw new ErrorServicio(400, 'La prueba solicitada no existe.');
    }

    let paquete;
    if (prueba === 'repetida') {
      if (!ultimoPaquete) throw new ErrorServicio(409, 'Todavía no hay una lectura anterior que repetir. Envía primero una normal.');
      paquete = ultimoPaquete;
    } else {
      paquete = await firmarLectura(oraculo(), { idLote, temperatura, acidez, nonce: crypto.randomUUID() });
      if (prueba === 'alterada') {
        // La firma cubre la lectura original; cambiar un dato después la invalida
        paquete = { ...paquete, lectura: { ...paquete.lectura, temperatura: temperatura - 5 } };
      } else {
        ultimoPaquete = paquete;
      }
    }

    try {
      const resultado = await procesarLectura({
        contrato: contrato.connect(oraculo()),
        verificador,
        paquete,
        productor: productor.address,
        monto,
      });
      await sync();
      return { paquete, resultado, rechazo: null };
    } catch (error) {
      if (error?.codigo === 'FIRMA_INVALIDA' || error?.codigo === 'LECTURA_REPETIDA') {
        return { paquete, resultado: null, rechazo: { codigo: error.codigo, mensaje: error.message } };
      }
      throw error;
    }
  });

  const reconstruirProyeccion = () => protegido(async () => reconstruir({ contrato, repositorio }));

  /** Redespliega el contrato. `oraculo` es el índice de una cuenta o 'cero' para ver el error del constructor. */
  const reiniciar = ({ oraculo: eleccion = 1 } = {}) => protegido(async () => {
    if (eleccion === 'cero') {
      await desplegar(null).catch(error => {
        throw error;
      });
      return { contrato: await contrato.getAddress() };
    }
    if (!INDICES_ORACULO.includes(eleccion)) throw new ErrorServicio(400, 'Elige una cuenta válida para el oráculo.');
    await desplegar(eleccion);
    return { contrato: await contrato.getAddress(), oraculoIndice };
  });

  // ---- Contratos de práctica ----
  function loteDePractica() {
    contadorPractica += 1;
    return LOTE_PRACTICA_BASE + BigInt(contadorPractica);
  }

  async function prepararPractica(tipo, nombre, montoEth, crear) {
    if (oraculoIndice === null) throw new ErrorServicio(409, 'La red no tiene un oráculo válido. Reiníciala con una cuenta de oráculo.');
    if (practicas.length >= MAX_PRACTICAS) throw new ErrorServicio(409, `Ya hay ${MAX_PRACTICAS} contratos de práctica. Reinicia la red para empezar de nuevo.`);
    const monto = leerEth(ethers, montoEth, 'El monto del pago');
    const instancia = await crear();
    await instancia.waitForDeployment();
    const direccion = await instancia.getAddress();
    await (await contrato.connect(oraculo()).autorizarPago(loteDePractica(), direccion, monto)).wait();
    practicas.push({ tipo, nombre, direccion });
    return { instancia, direccion, monto };
  }

  /** Un destinatario que rechaza pagos: retirar() revierte con FalloTransferencia y el saldo se conserva. */
  const practicaReceptor = ({ montoEth }) => protegido(async () => {
    const { instancia, direccion, monto } = await prepararPractica('receptor', 'Receptor que rechaza', montoEth, async () =>
      (await ethers.getContractFactory('ReceptorQueRechaza')).deploy());
    let intento;
    try {
      await (await instancia.retirarDe(await contrato.getAddress())).wait();
      intento = { exito: true };
    } catch (error) {
      const t = traducirFallo(error);
      intento = { exito: false, codigo: t.codigo, revert: t.revert, mensaje: t.message };
    }
    await sync();
    return {
      direccion,
      montoWei: monto.toString(),
      intento,
      pendienteWei: (await contrato.saldoPendiente(direccion)).toString(),
    };
  });

  /** Un atacante que vuelve a llamar a retirar() mientras recibe el pago: el patrón CEI lo frena. */
  const practicaAtacante = ({ montoEth }) => protegido(async () => {
    const { instancia, direccion, monto } = await prepararPractica('atacante', 'Atacante de reentrada', montoEth, async () =>
      (await ethers.getContractFactory('AtacanteRetiro')).deploy(await contrato.getAddress()));
    await (await instancia.atacar()).wait();
    await sync();
    return {
      direccion,
      montoWei: monto.toString(),
      intentosReentrada: Number(await instancia.intentosReentrada()),
      reentradaExitosa: await instancia.reentradaExitosa(),
      recibidoWei: (await ethers.provider.getBalance(direccion)).toString(),
      pendienteWei: (await contrato.saldoPendiente(direccion)).toString(),
    };
  });

  return {
    leerEstado, eventos, consultar, depositar, autorizarDirecto, enviarLectura, retirar,
    reconstruirProyeccion, reiniciar, practicaReceptor, practicaAtacante, ErrorServicio,
  };
}

module.exports = { crearServicio, ErrorServicio, MAX_ETH };
