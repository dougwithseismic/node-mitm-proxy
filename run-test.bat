@echo off
REM Run test client through the MITM proxy
set HTTP_PROXY=http://127.0.0.1:8888
set HTTPS_PROXY=http://127.0.0.1:8888
set NODE_EXTRA_CA_CERTS=%~dp0.certs\ca.crt
node %~dp0test-client.js
