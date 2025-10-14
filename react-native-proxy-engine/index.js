// index.js

import { NativeModules, Platform } from 'react-native';

const { ReactNativeProxyEngine } = NativeModules;

// Mock implementation for when native module is not available
const MockProxyEngine = {
  startProxy: (config) => {
    console.warn('🎭 Mock Proxy Engine: startProxy called (native module not available)');
    return Promise.resolve({
      success: false,
      message: 'Native Proxy Engine not available. Build with EAS to activate.',
      data: null
    });
  },

  stopProxy: () => {
    console.warn('🎭 Mock Proxy Engine: stopProxy called');
    return Promise.resolve({
      success: false,
      message: 'Native Proxy Engine not available'
    });
  },

  getProxyStatus: () => {
    console.warn('🎭 Mock Proxy Engine: getProxyStatus called');
    return Promise.resolve({
      success: true,
      data: {
        isRunning: false,
        isAvailable: false,
        message: 'Native Proxy Engine not available. Build with EAS to activate.'
      }
    });
  },

  setProxyConfig: (config) => {
    console.warn('🎭 Mock Proxy Engine: setProxyConfig called');
    return Promise.resolve({
      success: false,
      message: 'Native Proxy Engine not available'
    });
  },

  makeProxyRequest: (url, options) => {
    console.warn('🎭 Mock Proxy Engine: makeProxyRequest called');
    return Promise.reject(new Error('Native Proxy Engine not available'));
  },

  getProxyStats: () => {
    console.warn('🎭 Mock Proxy Engine: getProxyStats called');
    return Promise.resolve({
      success: true,
      data: {
        threatsBlocked: 0,
        requestsProcessed: 0,
        isAvailable: false
      }
    });
  }
};

// Use native module if available, otherwise use mock
let ProxyEngine;

if (Platform.OS === 'web') {
  console.log('🌐 Using Mock Proxy Engine for web platform');
  ProxyEngine = MockProxyEngine;
} else if (ReactNativeProxyEngine) {
  console.log('✅ Native Proxy Engine module loaded');
  ProxyEngine = ReactNativeProxyEngine;
} else {
  console.warn('⚠️ Native Proxy Engine module not available, using mock implementation');
  console.log('📝 To activate: Build the app with EAS Build');
  ProxyEngine = MockProxyEngine;
}

export default {
  /**
   * Start the proxy server with the given configuration
   * @param {Object} config - Proxy configuration
   * @param {string} config.host - Proxy host (default: '127.0.0.1')
   * @param {number} config.port - Proxy port (default: 8080)
   * @param {string} [config.username] - Username for authentication
   * @param {string} [config.password] - Password for authentication
   * @param {string} [config.type] - Proxy type: 'HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5' (default: 'HTTP')
   * @returns {Promise<Object>} Response object with success status and data
   */
  startProxy: (config) => ProxyEngine.startProxy(config),

  /**
   * Stop the proxy server
   * @returns {Promise<Object>} Response object with success status
   */
  stopProxy: () => ProxyEngine.stopProxy(),

  /**
   * Get the current proxy status
   * @returns {Promise<Object>} Response object with proxy status data
   */
  getProxyStatus: () => ProxyEngine.getProxyStatus(),

  /**
   * Set proxy configuration
   * @param {Object} config - Proxy configuration
   * @returns {Promise<Object>} Response object with success status
   */
  setProxyConfig: (config) => ProxyEngine.setProxyConfig(config),

  /**
   * Make a request through the proxy
   * @param {string} url - Request URL
   * @param {Object} [options] - Request options
   * @param {string} [options.method] - HTTP method (default: 'GET')
   * @param {Object} [options.headers] - Request headers
   * @param {string} [options.body] - Request body
   * @returns {Promise<Object>} Response object with request result
   */
  makeProxyRequest: (url, options) => ProxyEngine.makeProxyRequest(url, options),

  /**
   * Get proxy statistics
   * @returns {Promise<Object>} Response object with proxy statistics
   */
  getProxyStats: () => ProxyEngine.getProxyStats(),

  /**
   * Check if native engine is available
   * @returns {boolean}
   */
  isNativeAvailable: () => !!ReactNativeProxyEngine,
};
