# render-tests
Toward a render-testing framework

### requirements

- node

### to compare local images to reference maps

- start a local web server, either with node:
  - `npm install http-server -g`
  - `http-server`
- or python:
  - python -m simpleHTTPServer
- visit http://localhost:8080

### to generate new local images

- `npm install formidable`
- `node server.js`
- visit http://localhost:8080
