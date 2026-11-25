// Servicio de la web: une los componentes del taller (contrato, oráculo, reglas, indexador)
// sobre una red local de Hardhat que vive en memoria. Los fondos no tienen valor monetario.
const crypto = require('node:crypto');
const { LIMITES } = require('../src/reglas');
const { firmarLectura, crearVerificador, procesarLectura } = require('../src/oraculo');
const { sincronizar, reconstruir } = require('../src/indexador');
const { RepositorioMemoria } = require('../src/repositorio-memoria');

const NOMBRES_PRODUCTORES = ['Productor 1', 'Productor 2', 'Productor 3'];
const MAX_ETH = 50;

class ErrorServicio extends Error {
  constructor(estado, mensaje, codigo) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

/** Convierte un monto decimal escrito por la persona en wei, o falla con un mensaje claro. */
function leerEth(ethers, valor, nombre) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,6})?$/.test(texto)) {
    throw new ErrorServicio(400, `${nombre} debe ser un número positivo con hasta 6 decimales.`);
  }
  const wei = ethers.parseEther(texto);
  if (wei === 0n || wei > ethers.parseEther(String(MAX_ETH))) {
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
  const firmantes = await ethers.getSigners();
  const [depositante, oraculo] = firmantes;
  const productores = firmantes.slice(2, 2 + NOMBRES_PRODUCTORES.length);

  let contrato;
  let verificador;
  let repositorio;
  let ultimoPaquete;

  // Una sola operación a la vez: así los nonces de las cuentas nunca se cruzan
  let cola = Promise.resolve();
  const enCola = tarea => {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => {});
    return resultado;
  };

  async function desplegar() {
    const fabrica = await ethers.getContractFactory('GarantiaAgroPay');
    contrato = await fabrica.deploy(oraculo.address);
    await contrato.waitForDeployment();
    verificador = crearVerificador(oraculo.address);
    repositorio = new RepositorioMemoria();
    ultimoPaquete = null;
  }
  await desplegar();

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
    const fmt = wei => `${ethers.formatEther(wei)} ETH`;
    const a = revertido?.args ?? [];
    switch (revertido?.name) {
      case 'LoteYaAutorizado':
        return new ErrorServicio(409, `El lote ${a[0]} ya tiene un pago autorizado. Usa otro número de lote.`, 'LOTE_REPETIDO');
      case 'FondosInsuficientes':
        return new ErrorServicio(409, `La garantía disponible (${fmt(a[0])}) no alcanza para pagar ${fmt(a[1])}. Deposita más garantía.`, 'FONDOS_INSUFICIENTES');
      case 'SinSaldoPendiente':
        return new ErrorServicio(409, 'Esta cuenta no tiene saldo pendiente de retiro.', 'SIN_SALDO');
      case 'MontoInvalido':
        return new ErrorServicio(400, 'El monto debe ser mayor que cero.', 'MONTO_INVALIDO');
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

  async function estado() {
    const [garantia, bloque, red] = await Promise.all([
      contrato.garantiaDisponible(),
      ethers.provider.getBlockNumber(),
      ethers.provider.getNetwork(),
    ]);
    const cuentas = await Promise.all(
      productores.map(async (p, indice) => ({
        indice,
        nombre: NOMBRES_PRODUCTORES[indice],
        direccion: p.address,
        pendienteWei: (await contrato.saldoPendiente(p.address)).toString(),
        balanceWei: (await ethers.provider.getBalance(p.address)).toString(),
      })),
    );
    return {
      contrato: await contrato.getAddress(),
      oraculo: oraculo.address,
      depositante: depositante.address,
      chainId: Number(red.chainId),
      bloque,
      garantiaWei: garantia.toString(),
      limites: LIMITES,
      maxEth: MAX_ETH,
      productores: cuentas,
    };
  }

  const leerEstado = () => enCola(estado);
  const eventos = () => enCola(() => repositorio.listarEventos());

  const depositar = ({ eth }) => protegido(async () => {
    const monto = leerEth(ethers, eth, 'El monto de la garantía');
    const recibo = await (await contrato.connect(depositante).depositarGarantia({ value: monto })).wait();
    await sincronizar({ contrato, repositorio });
    return { txHash: recibo.hash };
  });

  const enviarLectura = body => protegido(async () => {
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
      paquete = await firmarLectura(oraculo, { idLote, temperatura, acidez, nonce: crypto.randomUUID() });
      if (prueba === 'alterada') {
        // La firma cubre la lectura original; cambiar un dato después la invalida
        paquete = { ...paquete, lectura: { ...paquete.lectura, temperatura: temperatura - 5 } };
      } else {
        ultimoPaquete = paquete;
      }
    }

    try {
      const resultado = await procesarLectura({
        contrato: contrato.connect(oraculo),
        verificador,
        paquete,
        productor: productor.address,
        monto,
      });
      await sincronizar({ contrato, repositorio });
      return { paquete, resultado, rechazo: null };
    } catch (error) {
      if (error?.codigo === 'FIRMA_INVALIDA' || error?.codigo === 'LECTURA_REPETIDA') {
        return { paquete, resultado: null, rechazo: { codigo: error.codigo, mensaje: error.message } };
      }
      throw error;
    }
  });

  const retirar = ({ productor }) => protegido(async () => {
    const cuenta = productores[productor];
    if (!cuenta) throw new ErrorServicio(400, 'Elige un productor de la lista.');
    const pendiente = await contrato.saldoPendiente(cuenta.address);
    const recibo = await (await contrato.connect(cuenta).retirar()).wait();
    await sincronizar({ contrato, repositorio });
    return { txHash: recibo.hash, montoWei: pendiente.toString() };
  });

  const reconstruirProyeccion = () => protegido(async () => reconstruir({ contrato, repositorio }));

  const reiniciar = () => protegido(async () => {
    await desplegar();
    return { contrato: await contrato.getAddress() };
  });

  return { leerEstado, eventos, depositar, enviarLectura, retirar, reconstruirProyeccion, reiniciar, ErrorServicio };
}

module.exports = { crearServicio, ErrorServicio, MAX_ETH };
