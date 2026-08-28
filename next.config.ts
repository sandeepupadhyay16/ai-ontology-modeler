import type { NextConfig } from "next";
import http from 'http';
import { setGlobalDispatcher, Agent } from 'undici';

// Override global Node.js HTTP server request and headers timeouts (default is 5 mins) to 15 mins
if (http.Server && http.Server.prototype) {
  http.Server.prototype.headersTimeout = 900000;
  http.Server.prototype.requestTimeout = 900000;
  http.Server.prototype.keepAliveTimeout = 900000;
}

// Override global Node.js client-side fetch timeouts (default is 5 mins) to 15 mins
setGlobalDispatcher(new Agent({
  headersTimeout: 900000,
  bodyTimeout: 900000,
  connectTimeout: 900000
}));

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'ontm.sandeepupadhyay.dev',
    '*.sandeepupadhyay.dev',
    'sandeepupadhyay.dev',
    'localhost:3014',
    '127.0.0.1:3014',
    '192.168.1.141:3014'
  ],
};

export default nextConfig;
