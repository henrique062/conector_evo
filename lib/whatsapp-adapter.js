/**
 * WhatsApp API Adapter
 * Suporta Evolution API e Uazapi com interface unificada
 */

class WhatsAppAdapter {
  constructor(provider, config) {
    this.provider = provider; // 'evolution' ou 'uazapi'
    this.config = config;

    if (!['evolution', 'uazapi'].includes(provider)) {
      throw new Error(`Provider inválido: ${provider}. Use 'evolution' ou 'uazapi'.`);
    }
  }

  /**
   * Helper para fazer requisições HTTP
   */
  async fetch(method, endpoint, body = null) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = this._getHeaders();

    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { status: response.status, data };
  }

  /**
   * Retorna headers específicos de cada provider
   */
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.provider === 'evolution') {
      headers['apikey'] = this.config.apiKey;
    } else if (this.provider === 'uazapi') {
      // Para operações admin, usa admintoken
      if (this.config.adminToken) {
        headers['admintoken'] = this.config.adminToken;
      }
      // Para operações de instância, usa token
      if (this.config.token) {
        headers['token'] = this.config.token;
      }
    }

    return headers;
  }

  /**
   * Listar todas as instâncias
   */
  async listInstances() {
    if (this.provider === 'evolution') {
      return await this.fetch('GET', '/instance/fetchInstances');
    } else {
      // Uazapi - requer admintoken
      return await this.fetch('GET', '/instance/all');
    }
  }

  /**
   * Criar nova instância
   */
  async createInstance(instanceName, options = {}) {
    if (this.provider === 'evolution') {
      const payload = {
        instanceName,
        integration: options.integration || 'WHATSAPP-BAILEYS',
        qrcode: options.qrcode !== undefined ? options.qrcode : true,
      };

      if (options.number) payload.number = options.number;
      if (options.settings) payload.settings = options.settings;

      return await this.fetch('POST', '/instance/create', payload);
    } else {
      // Uazapi - requer admintoken
      const payload = {
        name: instanceName,
      };

      if (options.systemName) payload.systemName = options.systemName;
      if (options.adminField01) payload.adminField01 = options.adminField01;
      if (options.adminField02) payload.adminField02 = options.adminField02;

      return await this.fetch('POST', '/instance/init', payload);
    }
  }

  /**
   * Conectar instância / Gerar QR Code
   */
  async connectInstance(instanceName, phone = null) {
    if (this.provider === 'evolution') {
      return await this.fetch('GET', `/instance/connect/${instanceName}`);
    } else {
      // Uazapi - usa token da instância
      const payload = phone ? { phone } : {};
      return await this.fetch('POST', '/instance/connect', payload);
    }
  }

  /**
   * Verificar status da instância
   */
  async getInstanceStatus(instanceName) {
    if (this.provider === 'evolution') {
      return await this.fetch('GET', `/instance/connectionState/${instanceName}`);
    } else {
      // Uazapi - usa token da instância
      return await this.fetch('GET', '/instance/status');
    }
  }

  /**
   * Reiniciar instância
   */
  async restartInstance(instanceName) {
    if (this.provider === 'evolution') {
      return await this.fetch('PUT', `/instance/restart/${instanceName}`);
    } else {
      // Uazapi não tem restart direto, fazemos disconnect + connect
      const disconnect = await this.disconnectInstance(instanceName);
      if (disconnect.status === 200) {
        return await this.connectInstance(instanceName);
      }
      return disconnect;
    }
  }

  /**
   * Desconectar instância (logout)
   */
  async disconnectInstance(instanceName) {
    if (this.provider === 'evolution') {
      return await this.fetch('DELETE', `/instance/logout/${instanceName}`);
    } else {
      // Uazapi - usa token da instância
      return await this.fetch('POST', '/instance/disconnect');
    }
  }

  /**
   * Deletar instância
   */
  async deleteInstance(instanceName) {
    if (this.provider === 'evolution') {
      return await this.fetch('DELETE', `/instance/delete/${instanceName}`);
    } else {
      // Uazapi - usar endpoint DELETE /instance (requer implementação se existir)
      // Por enquanto, apenas desconecta
      return await this.disconnectInstance(instanceName);
    }
  }

  /**
   * Normalizar resposta para formato padrão
   */
  normalizeInstanceData(data) {
    if (this.provider === 'evolution') {
      return {
        name: data.instance?.instanceName || data.instanceName,
        status: data.connectionStatus?.state || data.state || 'disconnected',
        number: data.instance?.number,
        profileName: data.instance?.profileName,
        profilePictureUrl: data.instance?.profilePicUrl,
        qrcode: data.qrcode,
        connected: data.connectionStatus?.state === 'open',
      };
    } else {
      // Uazapi
      return {
        name: data.name || data.instance?.name,
        status: data.status || data.instance?.status || 'disconnected',
        number: data.instance?.owner,
        profileName: data.profileName || data.instance?.profileName,
        profilePictureUrl: data.profilePicUrl || data.instance?.profilePicUrl,
        qrcode: data.qrcode || data.instance?.qrcode,
        paircode: data.paircode || data.instance?.paircode,
        connected: data.connected || data.status?.connected || false,
        token: data.token, // Uazapi retorna token da instância
      };
    }
  }
}

module.exports = WhatsAppAdapter;
