//  Modules
//
var http = require("http");   // http server
var fs = require('fs');       // filesystem.
var path = require('path');   // used for traversing your OS.
var url = require('url');     // utility for URLs
var spawn = require('child_process').spawn; // running cmd
var formidable = require('formidable');  // uploading files;

// Settings
//
var WWW_ROOT = "./";
var LOG_PATH = "";
var HTTP_PORT = 8080;

var status = {'printing' : false,
'queue': [],
};

function saveFile( filename, content ){
    fs.writeFile(filename, content, function(err) {
        if(err) {
            return console.log(err);
        }
    });
}


// WEB SERVER
//
var server = http.createServer( function( req , res ) {
    var parsedReq = url.parse(req.url);

    if(parsedReq.pathname == "/save" && req.method.toLowerCase() == 'post') {
        var form = new formidable.IncomingForm();
        var files = [];
        var fields = [];
        console.log('form:', form);

        form.uploadDir = WWW_ROOT + LOG_PATH;
        form.keepExtensions = true;

        var filename = (new Date().getTime());

        // form.on('fileBegin', function(name, file) {
        //     file.path = form.uploadDir + filename + '.png';
        // })

        form.on('fileBegin', function(name, file) {

            // fs.writeFile("./test", "Hey there!", function(err) {
            //     if(err) {
            //         return console.log(err);
            //     }

            //     console.log("The file was saved!");
            // }); 

            file.path = form.uploadDir + filename + '.png';
        });

        form.parse(req, function(err, fields, files) {
            return true;
                    // fs.writeFile(WWW_ROOT+LOG_PATH+filename+".frag", fields['code'], function(err) {
                    //     if(err) {
                    //         return console.log(err);
                    //     }
                    //     // res.write(LOG_PATH+filename+".frag");
                    //     res.end();
                    // });
        });

    } else {
        //  REGULAR WEB SERVER
        //
        var mimeTypes = {
            "html":  "text/html",
            "jpeg":  "image/jpeg",
            "jpg":   "image/jpeg",
            "png":   "image/png",
            "svg":   "image/svg+xml",
            "svgz":  "image/svg+xml",
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
            return false;

            httpStatusCode = 404;
            fileToLoad = "404.html";
        }

        var fileBytes = fs.readFileSync(WWW_ROOT + fileToLoad);
        var mimeType = mimeTypes[path.extname(fileToLoad).split(".")[1]]; // complicated, eh?

        res.writeHead(httpStatusCode,{'Content-type':mimeType});
        res.end(fileBytes);
    });

    }

}).listen(HTTP_PORT);
console.log("Server started at http://localhost:" + HTTP_PORT);