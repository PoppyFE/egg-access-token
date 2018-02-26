'use strict';

module.exports = opts => {

  // force default is force.
  let force = true;
  if (opts && opts.force !== undefined) {
    force = !!opts.force;
  }

  // keepActive default is true
  let keepActive = true;
  if (opts && opts.keepActive !== undefined) {
    keepActive = !!opts.keepActive;
  }

  return function* (next) {
    const { logger, redis, request, query } = this;
    // access-token 优先headers 然后query
    const accessToken = request.headers['access-token'] || query['access-token'];

    if (force && !accessToken) {
      logger.info('access-token 未设置！');
      this.formatFailResp({errCode: 'F401'});
      return;
    }

    // 没有accessToken
    if (!accessToken)  {
      yield next;
      return;
    }

    // 有access-token
    const accessData = yield* this.findAccessData(accessToken);
    if (!accessData) {
      this.formatFailResp({errCode: 'F401'});
      return;
    }

    if (this.isClientMacChanged()) {
      this.formatFailResp({errCode: 'F401'});
      return;
    }

    this.accessData = accessData;

    yield next;

    yield this.saveAccessData(this.accessData);

    // key alive.
    if (keepActive) {
      yield this.activeAccessData(this.accessData);
    }
  };
};
