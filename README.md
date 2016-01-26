# render-tests
Toward a render-testing framework

### requirements

- node

### to compare local images to reference maps

- start a local web server, either with python:
  - `python -m simpleHTTPServer`
- or node:
  - `npm install http-server -g`
  - `http-server`
- visit [http://localhost:8080](http://localhost:8080)

### to generate new reference maps

- `npm install formidable`
- `node server.js`
- visit [http://localhost:8080](http://localhost:8080)
- commit and push the images back to this repo
