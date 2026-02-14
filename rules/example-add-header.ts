import type { TransformModule, ProxyRequest } from '../src/transforms/types.js';

const transform: TransformModule = {
  onRequest(req: ProxyRequest) {
    return {
      ...req,
      headers: {
        ...req.headers,
        'x-mitm-proxy': 'intercepted',
        'x-timestamp': new Date().toISOString(),
      },
    };
  },
};

export default transform;
