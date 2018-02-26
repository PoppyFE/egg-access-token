/**
 * Created by alex on 2017/9/16.
 */

'use strict';

const ms = require('ms');

class AccessData {

 constructor(ctx, props) {
   this._ctx = ctx;

   for (const k in obj) {
     this[k] = obj[k];
   }
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
    this._requireSave = true;
  }
}

const __ACCESS_DATA__ = Symbol('__ACCESS_DATA__');

module.exports = {

  * isClientMacChanged(accessData) {
    const { logger, redis, request, app } = this;

    //当前请求clientMac
    const clientMac = request.ips.join('|');//crypto.createHash('md5').update().digest('hex');
    if (clientMac !== accessData.clientMac) {
      logger.info(`请求的 accessToken 的 clientMac 发生变化 之前 ${accessData.clientMac} 现在 ${clientMac}`);
      return false;
    }

    return true;
  },

  * createAccessData(props) {
    return new AccessData(this, props);
  },

  * activeAccessData(accessToken, maxAge) {
    const { redis } = this;

    if (!accessToken) return;

    if (maxAge !== undefined) {
      maxAge = ms(this.app.config.accessTokenMaxAge);
    }

    yield redis.expire(accessToken, maxAge);
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

    if (!accessToken) return [];

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