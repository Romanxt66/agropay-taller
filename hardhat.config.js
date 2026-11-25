require('@nomicfoundation/hardhat-toolbox');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// Usa el compilador solc 0.8.24 instalado con npm: compila sin descargar nada.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion !== '0.8.24') return runSuper();
  return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: '0.8.24', longVersion: require('solc').version() };
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Los contratos principales fijan =0.8.34 y los de practica/ fijan =0.8.24
  solidity: { compilers: [{ version: '0.8.34' }, { version: '0.8.24' }] },
  networks: {
    hardhat: { chainId: 31337 },
  },
  mocha: { timeout: 60000 },
};
