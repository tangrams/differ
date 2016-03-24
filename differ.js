"use strict";
/*jslint browser: true*/
/*global Tangram, gui */

// initialize variables
var map, slots = {}, queue, nextView,
    canvas1, ctx1, canvas2, ctx2,
    newImg, newCanvas, newCtx, newData,
    oldImg, oldCanvas, oldCtx, oldData,
    diffImg, diffCanvas, diffCtx, diff,
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

map = prepMap();

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

function splitURL(url) {
    var dir = url.substring(0, url.lastIndexOf('/')) + "/";
    var file = url.substring(url.lastIndexOf('/')+1, url.length);
    return {"dir" : dir, "file": file};
}

// parse url and load the appropriate file
function loadFile(slotID) {
    // console.log('loading', slotID);
    var slot = document.getElementById(slotID);
    var url = slot.value;
    // console.log('url:', url);
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

function proceed() {
    prepAll();
    doTest();
}

function doTest() {
    // load next test in the lists
    var test1 = slots.slot1.tests.shift();
    // console.log('test1:', test1);
    var test2 = slots.slot2.tests.shift();
    // console.log('test2:', test2);

    // if there's an image for slot1, load it
    var img1URL = splitURL(test1.url).dir + test1.name + imgType;
    // console.log('img1url:', img1URL);
    console.log('starting test1');
    drawImageToCanvas(img1URL, canvas1).then(function(result){
        console.log('test1 drawimage success:', result);
    }, function(err) {
        // failed
        console.log('test1 drawimage failed:', err);
        // no image? no worries
        // load the view and make a new image
        var loc = parseView(test1.location); // parse location
        // console.log('loc:', loc);
        loadView(test1, loc).then(function(result){
            console.log('loadView 1 result:', result);
            console.log('starting test2');
            // if there's an image for slot2, load it
            var img2URL = splitURL(test2.url).dir + test2.name + imgType;
            console.log('img2url:', img2URL);
            drawImageToCanvas(img2URL, canvas2).then(function(result){
                console.log('test2 drawimage success:', result);
            }, function(err) {
                // failed
                console.log('test2 drawimage failed:', err);
                // no image? no worries
                // load the view and make a new image
                var loc = parseView(test2.location); // parse location
                // console.log('loc:', loc);
                loadView(test2, loc).then(function(result){
                    console.log('loadView 2 result:', result)
                });
            });
        });
    // debugger;

    // Promise.all([prepAll,screenshot(write),loadOld(nextView.name+imgType)]).then(function() {
    });
}

// load file
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

// parse view object and adjust map
function parseView(view) {
    // console.log('parseview:', view);
    if (Object.prototype.toString.call(view) === '[object Array]') {
        return view; // no parsing needed
    } else if (typeof(view) === "string") { 
        // parse string location as array of floats
        // console.log('loc:', view);
        if (view.indexOf(',') > 0 ) { // comma-delimited
            var location = view.split(/[ ,]+/);
        } else if (view.indexOf('/') > 0 ) { // slash-delimited
            location = view.split(/[\/]+/);
            location = [location[1], location[2], location[0]]; // re-order
        }
        // console.log('location:', location);
        location = location.map(parseFloat);
        // console.log('location:', location);
        // add location as property of view
        view = location;
        // return updated view object
        return view;
    } else {
        console.log("Can't parse location:", view);
    }
}

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

function diffSay(txt) {
    alertDiv.innerHTML += txt;
}

// setup output divs and canvases
function prepAll() {

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

    // make canvas for the old image
    canvas1 = document.createElement('canvas');
    canvas1.height = lsize;
    canvas1.width = lsize;
    ctx1 = canvas1.getContext('2d');

    // make a canvas for the newly-drawn map image
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

// load an image asynchronously with a Promise
function loadImage (url, target) {
    return new Promise(function(resolve, reject) {
        var image = target || new Image();
        image.onload = function() {
            resolve({ url: url, image: image });
        };
        image.onerror = function(error) {
            reject({ error: error });
        };
        image.crossOrigin = 'anonymous';
        // force-refresh any local images with a cache-buster
        if (url.slice(-4) == imgType) url += "?" + new Date().getTime();
        image.src = url;
    });
}

// draw an image file to a canvas
function drawImageToCanvas (img, canvas) {
    return new Promise(function(resolve, reject) {
        var context = canvas.getContext("2d");
        var imgObj = new Image();
        return loadImage(img).then(function(result){
            if (result.url) {
                // set the old image to be drawn to the canvas once the image loads
                imgObj = result.image;
                context.drawImage(imgObj,
                                  0, 0, imgObj.width, imgObj.height,
                                  0, 0, canvas.width, canvas.height);
                // make the data available to pixelmatch
                oldData = context.getImageData(0, 0, lsize, lsize);
            } else {
                imgObj.style.display = "none";
                oldData = null;
            }
            resolve(result);
        }, function(err) {
            // console.log('loadimage err:', err);
            reject(err);
        });
    });
};

// capture the current tangram map
function screenshot (save) {
    return scene.screenshot().then(function(data) {
        // save it to a file
        if (save) saveImage(data.blob, nextView.name);

        var urlCreator = window.URL || window.webkitURL;
        newImg = new Image();
        return loadImage(urlCreator.createObjectURL( data.blob ), newImg);
    });
};

// perform the image comparison and update the html
function doDiff( test ) {
    // UPDATE READOUTS
    var count = views.length-queue.length;
    statusDiv.innerHTML = count + " of " + views.length;

    // save the new image to the new canvas, stretching it to fit (in case it's retina)
    newCtx.drawImage(newImg, 0, 0, newImg.width, newImg.height, 0, 0, newCanvas.width, newCanvas.height);
    // make the data available
    var newData = newCtx.getImageData(0, 0, lsize, lsize);
    if (oldData) {
        // run the diff
        var difference = pixelmatch(newData.data, oldData.data, diff.data, lsize, lsize, {threshold: 0.1});
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
    scores[test.name] = match;
    var totalSum = 0;
    for (var v in scores) {
        totalSum += scores[v];
    }
    totalScore = Math.floor(totalSum/(100*count)*100);
    var threatLevel = totalScore > 99 ? "green" : totalScore > 98 ? "orange" : "red";
    totalScoreDiv.innerHTML = "<span class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</span>";

    // make an output row
    makeRow(test, matchScore);

    images[test.name] = {};
    images[test.name].oldImg = oldImg;
    images[test.name].newImg = newImg;

    // var url = c.toDataURL('image/png');
    var data = atob(diffImg.src.slice(22));
    var buffer = new Uint8Array(data.length);
    for (var j = 0; j < data.length; ++j) {
        buffer[j] = data.charCodeAt(j);
    }
    var blob = new Blob([buffer], { type: 'image/png' });
    var urlCreator = window.URL || window.webkitURL;
    var diffblob = urlCreator.createObjectURL( blob );
    var diff2 = new Image();
    diff2.onload = function() {
        images[test.name].diffImg = diff2;
        images[test.name].strip = makeStrip([oldImg, newImg, diff2], lsize);
    }
    diff2.src = diffblob;

};

// convert Tangram's view_complete event to resolve a promise
var viewCompleteResolve, viewCompleteReject;
var viewComplete = new Promise(function(resolve, reject){
    viewCompleteResolve = function(){console.log('viewCompleteResolve');resolve();};
    viewCompleteReject = function(){console.log('viewCompleteReject');reject();};
});

function loadView (view, location) {
    console.log('loadView:', view.name, "at", location);
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // load and draw scene
        var url = convertGithub(view.url);
        scene.load(url).then(function() {
            scene.animated = false;
            map.setView(location);
            // Promise.all([drawMap(),viewComplete]).then(function(result){
            Promise.all([viewComplete]).then(function(result){
                resolve('loadview resolved result');
            }).catch(function(err) {
                reject(err);
            });
        });
    });
}

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

function makeRow(test, matchScore) {
    // check to see if div already exists (if re-running a test);
    var testdiv = document.getElementById(test.name);

    // if a row for this test doesn't already exist:
    if (testdiv === null) {
        // generate one
        var testdiv = document.createElement('div');
        testdiv.className = 'test';
        testdiv.id = test.name;
        tests.insertBefore(testdiv, tests.firstChild);
    } else {
        // clear it out
        testdiv.innerHTML = "";
    }

    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test"
    var testlink = "http://tangrams.github.io/tangram-frame/?url="+test.url+"#"+test.location[2]+"/"+test.location[0]+"/"+test.location[1];
    title.innerHTML = "<a target='_blank' href='"+convertGithub(testlink)+"'>"+test.name+"</a>";

    title.innerHTML += " <a target='_blank' href='"+test.url+"'>"+splitURL(test.url).file+"</a>";
    testdiv.appendChild(title);

    var oldcolumn = document.createElement('span');
    oldcolumn.className = 'column';
    oldcolumn.id = "old";
    oldcolumn.innerHTML = "old<br>";
    testdiv.appendChild(oldcolumn);

    var newcolumn = document.createElement('span');
    newcolumn.className = 'column';
    newcolumn.id = "new";
    newcolumn.innerHTML = "new<br>";
    testdiv.appendChild(newcolumn);

    var diffcolumn = document.createElement('span');
    diffcolumn.className = 'column';
    diffcolumn.id = "diff";
    diffcolumn.innerHTML = "diff<br>";
    testdiv.appendChild(diffcolumn);

    // insert old and new images
    newImg.width = size;
    newImg.height = size;
    newcolumn.appendChild( newImg );
    
    oldImg.width = size;
    oldImg.height = size;
    oldcolumn.appendChild( oldImg );

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
    refreshButton.innerHTML = "refresh " + test.name;
    controls.appendChild(refreshButton);
    refreshButton.onclick = function() {refresh(test);}

    var exportButton =  document.createElement('button');
    exportButton.innerHTML = "make PNG";
    // store current value of these global variables
    exportButton.onclick = function() {
        popup(images[test.name].strip, size * 3, size);
    };
    controls.appendChild(exportButton);

    var exportGifButton =  document.createElement('button');
    exportGifButton.innerHTML = "make GIF";
    exportGifButton.onclick = function() {
        makeGif([images[test.name].oldImg, images[test.name].newImg], test.name);
    };
    controls.appendChild(exportGifButton);


}

function makeStrip(images, size) {
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