// Arranque de la web. Se ejecuta con: npm run web
// La red local de Hardhat vive dentro de este proceso y se reinicia con él.
const path = require('node:path');
const hre = require('hardhat');
const { crearServicio } = require('./servicio');
const { crearApp } = require('./app');

async function main() {
  const servicio = await crearServicio({ ethers: hre.ethers });
  const carpetaWeb = process.env.WEB_DIR ?? path.resolve(__dirname, '..', 'web', 'dist');
  const puerto = Number(process.env.PORT ?? 8080);
  crearApp(servicio, { carpetaWeb }).listen(puerto, () => console.log(`AgroPay escuchando en el puerto ${puerto}`));
}

main().catch(error => {
  console.error('No se pudo iniciar AgroPay:', error.message);
  process.exit(1);
});
