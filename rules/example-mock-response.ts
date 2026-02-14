import type { TransformModule, ProxyResponse, ProxyRequest } from '../src/transforms/types.js';

const transform: TransformModule = {
  onResponse(_res: ProxyResponse, _req: ProxyRequest) {
    return {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-mocked': 'true',
      },
      body: JSON.stringify({
        mocked: true,
        message: 'This response was replaced by a MITM proxy rule',
        timestamp: new Date().toISOString(),
      }),
    };
  },
};

export default transform;
