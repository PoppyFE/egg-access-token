/**
 * Created by alex on 2017/9/16.
 */

'use strict';

const crypto = require('crypto');
const uuid = require('uuid');
const ms = require('ms');

class AccessData {

  constructor(ctx, props) {
    this._ctx = ctx;

    for (const k in props) {
      this[k] = props[k];
    }

    if (!this.id) {
      throw new Error('AccessData id is empty!');
    }

    if (!this.maxAge) {
      throw new Error('AccessData maxAge is empty!');
    }

    if (!this.clientMac) {
      this.clientMac = getClientMac(ctx);
    }

    if (!this.random) {
      this.random = uuid();
    }

    if (!this.ip) {
      this.ip = ctx.ip;
    }

    const timeStamp = new Date().getTime();

    if (!this.createAt) {
      this.createAt = timeStamp;
    }

    if (!this.updateAt) {
      this.updateAt = timeStamp;
    }

    if (!props.hasOwnProperty('isDead')) {
      this.isDead = false;
    }

    // this.message = undefined;

    if (!this.accessToken) {
      const hashContent = {
        id: this.id,
        clientMac: this.clientMac,
        random: this.random,
        createAt: this.createAt,
      };

      this.accessToken = 'acst:' + this.id + ':' +crypto.createHash('md5').update(JSON.stringify(hashContent)).digest('hex');
    }
  }

  toJSON() {
    const obj = {};
    Object.keys(this).forEach(key => {
      if (typeof key !== 'string') return;
      if (key[0] === '_') return;
      if (this[key] === undefined) return;

      obj[key] = this[key];
    });

    return obj;
  }

  get length() {
    return Object.keys(this.toJSON()).length;
  }

  isClientMacChanged() {
    const { logger } = this._ctx;
    const envClientMac = getClientMac(this._ctx);
    if (envClientMac !== this.clientMac) {
      return true;
    }

    return false;
  }

  flush() {
    this.updateAt = new Date().getTime();
    this._dataDirty = true;
  }

  async save(force) {
    if (!force && !this._dataDirty) {
      return;
    }

    const { logger } = this._ctx;
    const { redis } = this._ctx.app;


    await redis.set(this.accessToken, JSON.stringify(this.toJSON()), 'PX', this.maxAge);
    logger.info(`redis 创建 accessData ( ${this.id} )数据 accessToken: ${this.accessToken} 有效期 ${this.maxAge}`);
    this._dataDirty = false;
  }

  async active() {
    const { redis } = this._ctx.app;
    await redis.expire(this.accessToken, this.maxAge * 0.001);
  }
}

function getClientMac(ctx) {
  const request = ctx.request;

  const deviceUUID = request.headers['device-uuid'] || '';

  let ipAddress = '';
  if (!deviceUUID && ctx.app.config.limitRequest.ipEnable) {
    ipAddress = (ctx.ips && ctx.ips.length ? ctx.ips.join('-') : undefined) || ctx.ip || '';
  }

  const userAgent = ctx.get('user-agent') || '';

  const clientMacContent = `${ipAddress}:${userAgent}:${deviceUUID}`;
  return crypto.createHash('md5').update(clientMacContent).digest('hex');
}

module.exports = {

  async createAccessData(props, maxAge) {
    const { logger, app } = this;
    const { redis } = app;

    props.maxAge = props.maxAge || maxAge || this.app.config.accessToken.maxAge;
    props.maxAge = typeof props.maxAge === 'string' ? ms(props.maxAge) : (parseInt(props.maxAge) || 0);

    const accessData = new AccessData(this, props);
    await accessData.save(true);
    return accessData;
  },

  async findAccessData(accessToken) {
    const { logger, app } = this;
    const { redis } = app;

    if (!accessToken || !accessToken.startsWith('acst:')) return;

    const accessDataStr = await redis.get(accessToken);
    if (!accessDataStr) {
      logger.info(`redis 获取 accessData 数据 accessToken: ${accessToken} 失败 不存在!`);
      return;
    }

    let accessData = null;
    try {
      accessData = JSON.parse(accessDataStr);
    } catch (err) {
      logger.info(`accessData 数据 解析错误: ${err.message} ${accessDataStr}`);
      return;
    }

    if (!accessData) {
      logger.info(`redis 获取 accessData 数据 accessToken: ${accessToken} 为空！`);
      return;
    }

    return new AccessData(this, accessData);
  },

  async findAccessDatasByUserId(id) {
    const { app } = this;
    const { redis } = app;

    const results = [];

    if (!id) return results;

    // https://github.com/luin/ioredis/issues/254
    const prefix = this.app.config.redis.client.keyPrefix;
    const prefixLen = prefix.length;
    let keys = await redis.keys(`${prefix}acst:${id}:*`);
    if (!keys || keys.length === 0) return results;

    keys = keys.map(key => {
      return key.substring(prefixLen);
    });

    for(let i = 0 ; i < keys.length; i++) {
      const accessData = await this.findAccessData(keys[i]);
      if (accessData) {
        results.push(accessData)
      }
    }

    return results;
  },

  async accessTokensByUserId(id) {
    const { app } = this;
    const { redis } = app;

    if (!id) return [];

    const prefix = this.app.config.redis.client.keyPrefix;
    const prefixLen = prefix.length;
    let keys = await redis.keys(`${prefix}acst:${id}:*`);
    if (!keys || keys.length === 0) return [];

    keys = keys.map(key => {
      return key.substring(prefixLen);
    });

    return keys;
  },

  async destroyAccessData(accessToken) {
    const { logger, app } = this;
    const { redis } = app;

    if (!accessToken) return;

    const accessData = this.accessData || this.request.accessData;
    if (accessData && accessData.accessToken === accessToken) {
      this.accessData = this.request.accessData = null;
    }

    await redis.del(accessToken);

    logger.info(`删除 accessToken: ${accessToken} !`);
  },

  async destroyAccessDatasByUserId(id) {
    const { logger, app } = this;
    const { redis } = app;

    if (!id) return;

    const prefix = this.app.config.redis.client.keyPrefix;
    const prefixLen = prefix.length;
    let keys = await redis.keys(`${prefix}acst:${id}:*`);
    if (!keys || keys.length === 0) return;

    keys = keys.map(key => {
      return key.substring(prefixLen);
    });

    for(let i = 0 ; i < keys.length; i++) {
      await redis.del([keys[i]]);
    }

    logger.info(`删除 accessTokens: ${keys.join(',')} !`);
  }
};
