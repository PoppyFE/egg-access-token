'use strict';

const mock = require('egg-mock');

describe('test/access-token.test.js', () => {
  let app;
  before(() => {
    app = mock.app({
      baseDir: 'apps/access-token-test',
    });
    return app.ready();
  });

  after(() => app.close());
  afterEach(mock.restore);

  it('should GET /', () => {
    return app.httpRequest()
      .get('/')
      .expect('hi, accessToken')
      .expect(200);
  });
});
