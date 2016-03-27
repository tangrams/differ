"use strict";
/*jslint browser: true*/
/*global Tangram, gui */




//
// initialize variables
//

var map, slots = {}, queue, nextView,
    canvas1, ctx1, canvas2, ctx2,
    img1 = new Image(), img1Canvas, img1Ctx, img1Data,
    img2 = new Image(), img2Canvas, img2Ctx, img2Data,
    diffImg = new Image(), diffCanvas, diffCtx, diff,
    images = {};
var testsFile = "";
var queryFile = "";
var imgType = ".png";
var size = 250; // physical pixels
var lsize = size * window.devicePixelRatio; // logical pixels
var scores = [], totalScore = 0;
var useragent = document.getElementById("useragent");
var tests = document.getElementById("tests");
var alertDiv = document.getElementById("alert");
var statusDiv = document.getElementById("status");
var totalScoreDiv = document.getElementById("totalScore");
var data, metadata;
var loadTime = Date();
var write = false; // write new map images to disk






//
// helper functions
//

// useragent.innerHTML = "useragent: "+navigator.userAgent+"<br>Device pixel ratio: "+window.devicePixelRatio;

// parse URL to check for test json passed in the query
// eg: http://localhost:8080/?test.json
// function parseQuery() {
//     var url = window.location.search.slice(1, window.location.search.length);
//     if (url != "") {
//         return convertGithub(url);
//     }
//     else return testsFile;
// }

// add text to the output div
function diffSay(txt) {
    alertDiv.innerHTML += txt;
}

// convert github links to raw github files
function convertGithub(url) {
    var a = document.createElement('a');
    a.href = url;
    queryFile = url;
    if (a.hostname == "github.com") {
        a.hostname = "raw.githubusercontent.com";
        a.pathname = a.pathname.replace("/blob", "");
    }
    return a.href;
}

// testsFile = parseQuery();

// handle enter key in filename input
function catchEnter(e){
    if (!e) e = window.event;
    var keyCode = e.keyCode || e.which;
    if (keyCode == '13') { // Enter pressed
        loadFile(e.target.id);
        return false;
    }
}

// split a URL string into directory and file names
function splitURL(url) {
    var dir = url.substring(0, url.lastIndexOf('/')) + "/";
    var file = url.substring(url.lastIndexOf('/')+1, url.length);
    return {"dir" : dir, "file": file};
}

// load a file from a URL
function readTextFile(file, callback) {
    var filename = splitURL(file).file;
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    try {
        rawFile.open("GET", file, true);
    } catch (e) {
        console.error("Error opening file:", e);
    }
    rawFile.onreadystatechange = function() {
        // readyState 4 = done
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            callback(rawFile.responseText);
        }
        else if (rawFile.readyState === 4 && rawFile.status == "404") {
            console.error("404 – can't load file", file);
            alertDiv.innerHTML = "404 - can't load file <a href='"+file+"'>"+filename+"</a>";
        } else if (rawFile.readyState === 4) {
            alertDiv.innerHTML += "Had trouble loading that file.<br>";
            if (parseURL.host == "github.com") {
                alertDiv.innerHTML += "I notice you're trying to load a file from github, make sure you're using the \"raw\" file!<br>"
            }
        }

    }
    rawFile.send(null);
}

// get link for blob
function linkFromBlob(blob) {
    var urlCreator = window.URL || window.webkitURL;
    return urlCreator.createObjectURL( blob );
}



//
// prep scene
//

map = prepMap();

function prepMap() {
    // initialize Tangram
    map = (function () {
        /*** Map ***/

        var map = L.map('map', {
            keyboardZoomOffset : .05,
            zoomControl: false,
            attributionControl : false
        });

        var layer = Tangram.leafletLayer({
            scene: null,
            // highDensityDisplay: false
        });

        window.layer = layer;
        var scene = layer.scene;
        window.scene = scene;

        // setView expects format ([lat, long], zoom)
        // map.setView(map_start_location.slice(0, 3), map_start_location[2]);

        layer.addTo(map);

        return map;

    }());
    return map;
}

// parse url and load the appropriate file
function loadFile(slotID) {
    // console.log('loading', slotID);
    var slot = document.getElementById(slotID);
    var url = slot.value;
    // console.log(slotID, 'url:', url);
    url = convertGithub(url);
    var urlname = splitURL(url).file;
    // if (slotID = "slot1")
    // load and parse test json
    readTextFile(url, function(text){
        if (url == "") return false;
        try {
            data = JSON.parse(text);
        } catch(e) {
            console.log('Error parsing json:', e);
            // set page title
            alertDiv.innerHTML += "Can't parse JSON: <a href='"+url+"'>"+urlname+"</a><br>"+e+"<br>";
            return false;
        }

        // extract test origin metadata
        try {
            metadata = data.origin;
        } catch (e) {
            alertDiv.innerHTML += "Can't parse JSON metadata: <a href='"+url+"'>"+urlname+"</a><br>";
            console.log('metadata problem, continuing', e);
        }

        // populate slots array
        slots[slotID] = {};
        slots[slotID].url = url;
        slots[slotID].file = urlname;
        // convert tests to an array for easier traversal
        slots[slotID].tests = Object.keys(data.tests).map(function (key) {
            // add test's name as a property of the test
            data.tests[key].name = key;
            // add name of pre-rendered image to look for
            data.tests[key].imageURL = splitURL(slots[slotID].url).dir + data.tests[key].name + imgType;


            return data.tests[key];
        });

        // console.log(slotID, "loaded!");
        var button;
        if (slotID == "slot1") button = document.getElementById('loadButton1');
        else button = document.getElementById('loadButton2');
        button.innerHTML = "Loaded!";

        if (Object.keys(slots).length == 2) {
            // console.log('Two views loaded, proceeding');
            proceed();
        }

    });
}

// setup output divs and canvases
function prepPage() {

    // clone views array
    // console.log('slots:')
    var tests1 = slots.slot1.tests.slice(0);
    var tests2 = slots.slot2.tests.slice(0);

    // console.log('test1:', tests1);
    // console.log('test2:', tests2);
    // subscribe to Tangram's published view_complete event
    scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                viewCompleteResolve();
            }
    });

    // set page title
    var msg = "Now diffing: <a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. " 
    + slots.slot2.url == "local" ? "local build" : "<a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a>";
    diffSay(msg);


    // set sizes
    document.getElementById("map").style.height = size+"px";
    document.getElementById("map").style.width = size+"px";

    // set up canvases

    // make canvas for slot1
    canvas1 = document.createElement('canvas');
    canvas1.height = lsize;
    canvas1.width = lsize;
    ctx1 = canvas1.getContext('2d');

    // make a canvas for slot2
    canvas2 = document.createElement('canvas');
    canvas2.height = lsize;
    canvas2.width = lsize;
    ctx2 = canvas2.getContext('2d');

    // make a canvas for the diff
    diffCanvas = document.createElement('canvas');
    diffCanvas.height = lsize;
    diffCanvas.width = lsize;
    diffCtx = diffCanvas.getContext('2d');
    diff = diffCtx.createImageData(lsize, lsize);

}





//
// test functions
//


// parse view object and adjust map
function parseLocation(loc) {
    // console.log('loc:', loc);
    if (Object.prototype.toString.call(loc) === '[object Array]') {
        return loc; // no parsing needed
    } else if (typeof(loc) === "string") {
        // parse string location as array of floats
        // console.log('loc:', loc);
        if (loc.indexOf(',') > 0 ) { // comma-delimited
            var location = loc.split(/[ ,]+/);
        } else if (loc.indexOf('/') > 0 ) { // slash-delimited
            location = loc.split(/[\/]+/);
            location = [location[1], location[2], location[0]]; // re-order
        }
        location = location.map(parseFloat);
        // return updated location
        return location;
    } else {
        console.log("Can't parse location:", loc);
    }
}

// load an image from a file
function loadImage (url) {
    // console.log('loadImage:', typeof url, url);
    return new Promise(function(resolve, reject) {
        var image = new Image();
        // set up events
        image.onload = function() {
            resolve(image);
        };
        image.onerror = function() {
            reject();
        };
        image.crossOrigin = 'anonymous';
        // force-refresh any local images with a cache-buster
        // console.log('url?', url);
        if (url.slice(-4) == imgType) url += "?" + new Date().getTime();
        // try to load the image
        image.src = url;
    });
}

// draw an image object to a canvas
function drawImageToCanvas (img, canvas) {
    // console.log('drawImageToCanvas?', img, canvas);
    return new Promise(function(resolve, reject) {
        // draw image to the canvas
        var context = canvas.getContext("2d");
        context.drawImage(img,
                          0, 0, img.width, img.height,
                          0, 0, canvas.width, canvas.height);
        // make the data available to pixelmatch
        var data = context.getImageData(0, 0, lsize, lsize);
        console.log('data:', data);
        resolve(data);
    }, function(err) {
        console.log('drawImageToCanvas err:', err);
        data = null;
        reject(data);
    });
};

// capture the current tangram map
function screenshot (save) { // image() object, boolean
    return scene.screenshot().then(function(data) {
        // save it to a file
        if (save) saveImage(data.blob, nextView.name);

        var img = new Image();
        return loadImage(linkFromBlob( data.blob ), img);
    });
};

// use Tangram's view_complete event to resolve a promise
var viewCompleteResolve, viewCompleteReject;
var viewComplete;
function resetViewComplete() {
    viewComplete = new Promise(function(resolve, reject){
        viewCompleteResolve = function(){
            resolve();
        };
        viewCompleteReject = function(){
            reject();
        };
    });
}
resetViewComplete();

function loadView (view, location) {
    // console.log('loadView:', view.name, "at", location);
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // load and draw scene
        var url = convertGithub(view.url);
        scene.load(url).then(function() {
            scene.animated = false;
            map.setView([location[0], location[1]], location[2]);
            // scene.requestRedraw(); // necessary?
            // Promise.all([drawMap(),viewComplete]).then(function(result){
            viewComplete.then(function(result){
                resetViewComplete();
                resolve('loadview resolved result');
            }).catch(function(err) {
                reject(err);
            });
        });
    });
}





//
// perform the test
//

function proceed() {
    prepPage();
    prepBothImages();
}

function prepImage(test) {
    return loadImage(convertGithub(test.imageURL)).then(function(result){
        test.img = result;
        return drawImageToCanvas(result, canvas1).then(function(result){
            console.log('prepImage found a file:', result);
            return test.data = result.data;
        });
    }).catch(function(err) {
        console.log('prepImage didn\'t find a file:', err);
        // no image? load the view and make a new image
        var loc = parseLocation(test.location);
        return loadView(test, loc).then(function(result){
            // console.log('loadview result:', result);
            // grab screenshot and put it in slot1
            return screenshot(false).then(function(result){
                // console.log('screenshot result:', result);
                test.img = result;
                console.log('test.img:', test.img);
                // console.log('drawimagetocanvas:', result);
                return drawImageToCanvas(result, canvas1).then(function(result){
                    return test.data = result.data;
                });
            });
        });
    });
}
// load or create the test images
function prepBothImages() {
    // load next test in the lists
    var test1 = slots.slot1.tests.shift();
    console.log('test1:', test1);
    var test2 = slots.slot2.tests.shift();
    console.log('test2:', test2);

    // if there's an image for slot1, load it
    // var img1URL = splitURL(slots.slot1.url).dir + test1.name + imgType;
    // var img2URL = splitURL(slots.slot2.url).dir + test2.name + imgType;
    // console.log('img1url:', img1URL);
    Promise.all([prepImage(test1), prepImage(test2)]).then(function(result){
        console.log('done loading both images');
        doDiff(test1, test2);
    });
}

// perform the image comparison and update the html
function doDiff( test1, test2 ) {
    // UPDATE READOUTS
    // var count = views.length-queue.length;
    // statusDiv.innerHTML = count + " of " + views.length;

    // save the new image to the new canvas, stretching it to fit (in case it's retina)
    // make the data available
    // console.log('img1Data:', img1Data);
    if (test1.data && test2.data) {
        // run the diff
        // var difference = pixelmatch(img1Data, img2Data, diff.data, lsize, lsize, {threshold: 0.1});
        var difference = pixelmatch(test1.data, test2.data, diff.data, size, size, {threshold: 0.1});
        // calculate match percentage
        var match = 100-(difference/(lsize*lsize)*100*100)/100;
        var matchScore = Math.floor(match);
        // put the diff in its canvas
        diffCtx.putImageData(diff, 0, 0);
    } else {
        // generating new image
        match = 100;
        matchScore = "";
    }

    // update master percentage
    scores[test1.name] = match;
    var totalSum = 0;
    for (var v in scores) {
        totalSum += scores[v];
    }
    // totalScore = Math.floor(totalSum/(100*count)*100);
    // var threatLevel = totalScore > 99 ? "green" : totalScore > 98 ? "orange" : "red";
    // totalScoreDiv.innerHTML = "<span class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</span>";

    // make an output row
    makeRow(test1, test2, matchScore);

    images[test1.name] = {};
    images[test1.name].img1 = test1.img;
    images[test1.name].img2 = test2.img;

    // var url = c.toDataURL('image/png');
    // console.log('diffImg:', diffImg);
    // console.log('diffImg.src:', diffImg.src);
    var data = atob(diffImg.src.slice(22));
    // console.log('data:', data);
    var buffer = new Uint8Array(data.length);
    for (var j = 0; j < data.length; ++j) {
        buffer[j] = data.charCodeAt(j);
    }
    var blob = new Blob([buffer], { type: 'image/png' });
    var diff2 = new Image();
    diff2.onload = function() {
        images[test1.name].diffImg = diff2;
        images[test1.name].strip = makeStrip([test1.img, test2.img, diff2], lsize);
    }
    diff2.src = linkFromBlob( blob );

};

function stop() {
    nextView = false;
    queue = false;
}

function drawMap() {
    console.log('drawMap');
    return new Promise(function(resolve, reject) {
        scene.requestRedraw();
        console.log('drawMap resolve');
        resolve();
    });
}

function makeRow(test1, test2, matchScore) {
    // check to see if div already exists (if re-running a test);
    var testdiv = document.getElementById(test1.name);

    // if a row for this test doesn't already exist:
    if (testdiv === null) {
        // generate one
        var testdiv = document.createElement('div');
        testdiv.className = 'test';
        testdiv.id = test1.name;
        tests.insertBefore(testdiv, tests.firstChild);
    } else {
        // clear it out
        testdiv.innerHTML = "";
    }

    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test"
    var testlink = "http://tangrams.github.io/tangram-frame/?url="+test1.url+"#"+test1.location[2]+"/"+test1.location[0]+"/"+test1.location[1];
    title.innerHTML = "<a target='_blank' href='"+convertGithub(testlink)+"'>"+test1.name+"</a>";

    title.innerHTML += " <a target='_blank' href='"+test1.url+"'>"+splitURL(test1.url).file+"</a>";
    testdiv.appendChild(title);

    var column1 = document.createElement('span');
    column1.className = 'column';
    column1.id = "column1";
    column1.innerHTML = "1<br>";
    testdiv.appendChild(column1);

    var column2 = document.createElement('span');
    column2.className = 'column';
    column2.id = "column2";
    column2.innerHTML = "2<br>";
    testdiv.appendChild(column2);

    var diffcolumn = document.createElement('span');
    diffcolumn.className = 'column';
    diffcolumn.id = "diff";
    diffcolumn.innerHTML = "diff<br>";
    testdiv.appendChild(diffcolumn);

    // insert old and new images
    img1.width = size;
    img1.height = size;
    column1.appendChild( test1.img );
    
    img2.width = size;
    img2.height = size;
    column2.appendChild( test2.img );

    // CONTROLS //

    var controls = document.createElement('span');
    controls.className = 'controls';
    testdiv.appendChild(controls);

    var threatLevel = matchScore > 99 ? "green" : matchScore > 95 ? "orange" : "red";

    if (matchScore != "") {
        matchScore += "% match";
        diffImg = document.createElement('img');
        diffImg.src = diffCanvas.toDataURL("image/png");
        diffImg.width = size;
        diffImg.height = size;
        diffcolumn.appendChild( diffImg );
    }

    controls.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+matchScore+"</div><br>";

    var refreshButton =  document.createElement('button');
    refreshButton.innerHTML = "refresh " + test1.name;
    controls.appendChild(refreshButton);
    refreshButton.onclick = function() {refresh(test1);}

    var exportButton =  document.createElement('button');
    exportButton.innerHTML = "make PNG";
    // store current value of these global variables
    exportButton.onclick = function() {
        popup(images[test1.name].strip, size * 3, size);
    };
    controls.appendChild(exportButton);

    var exportGifButton =  document.createElement('button');
    exportGifButton.innerHTML = "make GIF";
    exportGifButton.onclick = function() {
        makeGif([images[test1.name].img1, images[test1.name].img2], test1.name);
    };
    controls.appendChild(exportGifButton);
}






//
// output
//

// save an image with a POST request to the server
function saveImage( file, filename ) {
    var url = '/save';
    var data = new FormData();

    data.append("image", file, filename);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.onload = function () {
        // console.log('response:', this.responseText);
    };
    xhr.send(data);
}

// save all new images
function write() {
    for (var img in images) {
        img = images[x];
        images[test.name].newImg = newImg;
        saveImage(test.image, test.name);
    }
}

function makeStrip(images, size) {
    // console.log('makeStrip');
    var c = document.createElement('canvas');
    c.width = size*images.length;
    c.height = size;
    var ctx=c.getContext("2d");
    for (var x = 0; x < images.length; x++) {
        ctx.drawImage(images[x], size * x, 0);
    }
    return c.toDataURL("image/png");
}

function makeGif(images, name) {
    var gif = new GIF({
      workers: 1,
      quality: 10,
      width: lsize,
      height: lsize,
    });

    for (var y = 0; y < images.length; y++) {
        gif.addFrame(images[y]);
    }

    gif.on('finished', function(blob) {
        saveAs(blob, name+".gif");
    });

    gif.render();
}

function popup(img, width, height) {
    var data = '<img width='+width+' height='+height+' src="' + img + '"/>';
    var myWindow = window.open("data:text/html," + encodeURIComponent(data));
}

function makeContactSheet() {

    // count available strips
    var len = Object.keys(images).length;

    var c = document.createElement('canvas');
    c.width = lsize*3;
    c.height = lsize*len;
    var ctx=c.getContext("2d");

    // assemble strips
    var i = 0;
    var loaded = 0;
    for (var x in images) {
        var img = new Image();
        img.i = i;
        img.id = x;
        img.onload = function() {
            ctx.drawImage(this, 0, lsize * this.i);
            // if that's the last image, write the whole thing out
            if (loaded == len - 1) {
                // Get data URL, convert to blob
                // Strip host/mimetype/etc., convert base64 to binary without UTF-8 mangling
                // Adapted from: https://gist.github.com/unconed/4370822
                var url = c.toDataURL('image/png');
                var data = atob(url.slice(22));
                var buffer = new Uint8Array(data.length);
                for (var j = 0; j < data.length; ++j) {
                    buffer[j] = data.charCodeAt(j);
                }
                var blob = new Blob([buffer], { type: 'image/png' });
                // use FileSaver.js
                saveAs(blob, 'differ-' + (+new Date()) + '.png');
            }
            loaded++;
        }
        img.src = images[x].strip;
        i++;
    }
}

function makeInfoJSON() {
    var j = {};
    j.origin = {
        "useragent": navigator.userAgent,
        "devicePixelRatio": window.devicePixelRatio,
        "time": loadTime,
        "testFile": testsFile
    };
    j.tests = data.tests;
    var newJSON = JSON.stringify(j, null, 2);
    var url = 'data:text/json;charset=utf8,' + encodeURIComponent(newJSON);
    download(url, "json");
}

function download(url, type) {
    // var w = window.open(url, '_blank');
    var a = document.createElement('a');
    a.href = url;
    a.download = "differ-"+new Date().getTime()+"."+type;
    document.body.appendChild(a); // necessary for Firefox
    a.click();
    document.body.removeChild(a);
}


document.getElementById("loadButton1").click();
document.getElementById("loadButton2").click();