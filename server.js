//  Modules
//
var http = require("http");   // http server
var fs = require('fs');       // filesystem.
var url = require('url');     // utility for URLs
var formidable = require('formidable');  // uploading files;

// Settings
//
var WWW_ROOT = "./";
var HTTP_PORT = 8080;

// WEB SERVER
//
var server = http.createServer( function( req , res ) {
    var parsedReq = url.parse(req.url);

    // handle POST request
    if(parsedReq.pathname == "/save" && req.method.toLowerCase() == 'post') {
        var form = new formidable.IncomingForm();

        form.uploadDir = WWW_ROOT;
        form.keepExtensions = true;

        form.on('fileBegin', function(name, file) {
            file.path = form.uploadDir + file.name + '.png';
        });

        form.parse(req);

        res.end();

    } else {
        //  REGULAR WEB SERVER
        //
        var mimeTypes = {
            "html":  "text/html",
            "jpeg":  "image/jpeg",
            "jpg":   "image/jpeg",
            "png":   "image/png",
            "js":    "text/javascript",
            "css":   "text/css"
        };

        var fileToLoad;

        if(req.url == "/") {
          fileToLoad = "index.html";
      } else {
          fileToLoad = url.parse(req.url).pathname.substr(1);
      }

      console.log("[HTTP] :: Loading :: " + WWW_ROOT + fileToLoad);

      var fileBytes;
      var httpStatusCode = 200;

    // check to make sure a file exists...
    fs.exists(WWW_ROOT + fileToLoad,function(doesItExist) {

        // if it doesn't exist lets make sure we load error404.html
        if(!doesItExist) {
            console.log("[HTTP] :: Error loading :: " + WWW_ROOT + fileToLoad);
            // return a 404
            res.writeHead(404);
            res.end(0);
            return;
        }

        console.log("fileToLoad:", fileToLoad);
        if (fileToLoad == "") {
            var fileBytes = fs.readFileSync(WWW_ROOT + "index.html" + fileToLoad);
        } else {
            var fileBytes = fs.readFileSync(WWW_ROOT + fileToLoad);
        }
        var mimeType = mimeTypes[fileToLoad.split(".")[1]]; // complicated, eh?

        res.writeHead(httpStatusCode,{'Content-type':mimeType});
        res.end(fileBytes);
    });
    }
}).listen(HTTP_PORT);

console.log("Server started at http://localhost:" + HTTP_PORT);