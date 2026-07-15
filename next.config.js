const path = require('path')

module.exports = {
  allowedDevOrigins: ['104.248.185.105'],
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 100,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
  },
  turbopack: {
    root: path.join(__dirname),
  },
}
