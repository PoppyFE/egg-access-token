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
     throw new Error('AuthData id is empty!');
   }

   this.clientMac = getClientMac(ctx);
   this.random = uuid();
   const timeStamp = new Date().getTime();

   this.createAt = timeStamp;
   this.updateAt = timeStamp;

   const hashContent = {
     id: this.id,
     clientMac: this.clientMac,
     random: this.random,
     createAt: this.createAt,
   };

   this.accessToken = crypto.createHash('md5').update(JSON.stringify(hashContent)).digest('hex');
 }

 toJSON() {
   const obj = {};
   Object.keys(this).forEach(key => {
     if (typeof key !== 'string') return;
     if (key[0] === '_') return;

     obj[key] = this[key];
   });

   return obj;
 }

  get length() {
    return Object.keys(this.toJSON()).length;
  }

  get requireSave() {
   return !!this._requireSave;
  }

  save() {
    this.updateAt = new Date().getTime();
    this._requireSave = true;
  }
}

function getClientMac(ctx) {
  const request = ctx.request;

  const clientMacContent = request.ips.join('|') + ':' + ctx.get('user-agent');
  const clientMac = crypto.createHash('md5').update(clientMacContent).digest('hex');
  return clientMac;
}

module.exports = {

  * isClientMacChanged(accessData) {
    const { logger } = this;

    //当前请求clientMac
    const clientMac = getClientMac(this);
    if (clientMac !== accessData.clientMac) {
      logger.info(`请求的 accessToken 的 clientMac 发生变化 之前 ${accessData.clientMac} 现在 ${clientMac}`);
      return false;
    }

    return true;
  },

  * createAccessData(props, maxAge) {
    const { logger, redis } = this;

    if (maxAge !== undefined) {
      maxAge = ms(this.app.config.accessToken.maxAge);
    }

    const accessData = new AccessData(this, props);

    yield redis.set(accessData.accessToken, accessData.toJSON(), 'EX', maxAge * 0.001);

    logger.info(`redis 创建 accessData ( ${accessData.id} )数据 accessToken: ${accessData.accessToken}`);

    return accessData;
  },

  * saveAccessData(accessData) {
    accessData = accessData || this.accessData;

    if (accessData && accessData.requireSave) {
      yield redis.set(accessToken, accessData.toJSON());
    }
  },

  * activeAccessData(accessToken, maxAge) {
    const { redis } = this;

    if (!accessToken) return;

    if (maxAge !== undefined) {
      maxAge = ms(this.app.config.accessToken.maxAge);
    }

    yield redis.expire(accessToken, maxAge * 0.001);
  },

  * findAccessData(accessToken) {
    const { logger, redis } = this;

    if (!accessToken) return;

    const accessDataStr = yield redis.get(accessToken);
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

  * findAccessDatasByUserId(id) {
    const { redis } = this;

    const results = [];

    if (!id) return results;

    const keys = yield redis.keys(id + ':ses:*');
    if (!keys || keys.length === 0) return results;

    for(let i = 0 ; i < keys.length; i++) {
      const accessData = yield* this.findAccessData(keys[i]);
      if (accessData) {
        results.push(accessData)
      }
    }

    return results;
  },

  * accessTokensByUserId(id) {
    const { redis } = this;

    if (!id) return [];

    const keys = yield redis.keys(id + ':ses:*');
    return keys || [];
  },

  * destroyAccessData(accessToken) {
    const { logger, redis } = this;

    if (!accessToken) return;

    yield redis.del(accessToken);

    logger.info(`删除 accessToken: ${accessToken} !`);
  },

  * destroyAccessDatasByUserId(id) {
    const { logger, redis } = this;

    if (!id) return;

    const keys = yield redis.keys(id + ':ses:*');
    if (!keys || keys.length === 0) return;

    for(let i = 0 ; i < keys.length; i++) {
      yield redis.del([keys[i]]);
    }

    logger.info(`删除 accessTokens: ${keys.join(',')} !`);
  }
};