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

  return async function (ctx, next) {
    const { logger, request, query } = ctx;
    // access-token 优先headers 然后query
    const accessToken = request.headers['access-token'] || query['access-token'];

    if (force && !accessToken) {
      logger.info('access-token 未设置！');
      ctx.formatFailResp({errCode: 'F401'});
      return;
    }

    // 没有accessToken
    if (!accessToken)  {
      await next();
      return;
    }

    // 有access-token
    let accessData = await ctx.findAccessData(accessToken);
    if (!accessData) {
      if (force) {
        logger.info(`access-token: ${accessToken} 已经失效！`);
        ctx.formatFailResp({errCode: 'F401'});
        return;
      }

      logger.info(`若 access-token: 无效 忽律 继续`);
      await next();
      return;
    }

    if (accessData.isDead) { // 这里是个即将删除的token
      logger.info(`access-token: ${accessToken} 即将失效！${accessData.message}`);
      ctx.formatFailResp({errCode: 'F401', msg: accessData.message});
      await ctx.destroyAccessData(accessData.accessToken);
      return;
    }

    if (accessData.isClientMacChanged()) { // 这里可能是盗用 token
      logger.info(`access-token: ${accessToken} 对应的环境发生变化！`);
      ctx.formatFailResp({errCode: 'F403'});
      return;
    }

    ctx.accessData = request.accessData = accessData;

    await next();

    accessData = ctx.accessData || request.accessData;

    if (!accessData) {
      return;
    }

    await accessData.save();

    // key alive.
    if (keepActive) {
      accessData.active();
    }
  };
};
