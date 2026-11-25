# AgroPay: taller de dinero programable

Taller con un contrato de garantía (`GarantiaAgroPay`), un oráculo que firma lecturas, un indexador de eventos y
una proyección en tres capas. Esta versión añade una **web** para recorrer el flujo completo.

## La web

- **Resumen:** garantía disponible, saldos pendientes de los productores, depósito de garantía y retiros.
- **Lectura de lote:** el oráculo firma una lectura de temperatura y acidez, el servicio verifica firma y
  nonce, evalúa las reglas y, solo si cumple, autoriza el pago en el contrato. Incluye dos pruebas de
  seguridad: repetir una lectura y alterar un dato después de firmar.
- **Funciones del contrato:** `depositarGarantia`, `autorizarPago`, `retirar` y las consultas `oraculo`,
  `garantiaDisponible`, `saldoPendiente` y `loteAutorizado`, llamadas desde cualquiera de las 10 cuentas.
  Cuando el contrato revierte se muestra el error exacto de Solidity (`SoloOraculo`, `MontoInvalido`,
  `DireccionInvalida`, `LoteYaAutorizado`, `FondosInsuficientes`, `SinSaldoPendiente`, `FalloTransferencia`).
- **Laboratorio:** los contratos de `contracts/practica` en vivo (receptor que rechaza y ataque de
  reentrada) y el constructor con otra cuenta como oráculo o con la dirección cero.
- **Registro:** eventos del contrato proyectados en una tabla que se puede reconstruir desde la cadena.

La red es una red local de Hardhat que vive dentro del servidor: **los fondos no tienen valor monetario** y
todo se reinicia cuando el servidor arranca. Las cuentas de práctica son las que genera Hardhat por defecto
(sus claves son públicas), por eso nunca deben usarse en una red real.

## Cómo se arranca

```bash
npm install
npm run web:compilar   # compila el frontend en web/dist
npm run web            # http://localhost:8080
```

Para desarrollar el frontend con recarga: `npm run web` en una terminal y `cd web && npm run dev` en otra.

## Pruebas

```bash
npm test          # todas las etapas del taller, incluida la etapa 7 (API de la web)
npm run etapa:7   # solo la API de la web
```

## Variables de entorno

| Nombre | Para qué |
|---|---|
| `PORT` | Puerto del servidor (por defecto 8080) |
| `WEB_DIR` | Carpeta del frontend compilado (opcional) |

## Notas

- `hardhat.config.js` configura dos compiladores: 0.8.34 (contratos principales) y 0.8.24 (`contracts/practica`).
- El diseño sigue el estilo BUStra (neobrutalismo cálido): tokens en `web/src/estilos/tokens.css`, fuentes Unbounded y Manrope (OFL) servidas desde el mismo sitio.
