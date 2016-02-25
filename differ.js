"use strict";
/*jslint browser: true*/
/*global Tangram, gui */

// initialize variables
var map, views, queue, nextView,
    newImg, newCanvas, newCtx, newData,
    oldImg, oldCanvas, oldCtx, oldData,
    diffImg, diffCanvas, diffCtx, diff,
    images = {};
var testsFile = "";
var imgDir = "images/";
var imgType = ".png";
var size = 250; // physical pixels
var lsize = 250 * window.devicePixelRatio; // logical pixels
var scores = [], totalScore = 0;
var useragent = document.getElementById("useragent");
var tests = document.getElementById("tests");
var alertDiv = document.getElementById("alert");
var statusDiv = document.getElementById("status");
var totalScoreDiv = document.getElementById("totalScore");
var data;
var loadTime = Date();
var write = false; // write new map images to disk

useragent.innerHTML = "useragent: "+navigator.userAgent+"<br>Device pixel ratio: "+window.devicePixelRatio;

// parse URL to check for test json passed in the query
// eg: http://localhost:8080/?test.json
function parseQuery() {
    var url_query = window.location.search.slice(1, window.location.search.length);
    if (url_query != "") return url_query;
    else return testsFile;
}

testsFile = parseQuery();
var parseURL = document.createElement('a');
var testsDir = testsFile.substring(0, testsFile.lastIndexOf('/')) + "/";
var testsFilename = testsFile.substring(testsFile.lastIndexOf('/')+1, testsFile.length);
imgDir = testsDir+imgDir;

// handle enter key in filename input
document.getElementById("loadtext").onkeypress = function(e){
    if (!e) e = window.event;
    var keyCode = e.keyCode || e.which;
    if (keyCode == '13') { // Enter pressed
        loadButton();
        return false;
    }
}

// load file
function readTextFile(file, callback) {
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
            alertDiv.innerHTML = "404 - can't load file:<br><a href='"+testsFile+"'>"+testsFilename+"</a>";
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
    if (Object.prototype.toString.call(view["location"]) === '[object Array]') {
        return view; // no parsing needed
    } else if (typeof(view["location"]) === "string") { 
        // parse string location as array of floats
        var location = view["location"].split(/[ ,]+/);
        location = location.map(parseFloat);
        // add location as property of view
        view["location"] = location;
        // return updated view object
        return view;
    } else {
        console.log("Can't parse location:", view);
    }
}

// setup output divs and canvases
var prep = new Promise( function (resolve, reject) {
    // load and parse test json
    readTextFile(testsFile, function(text){
        if (testsFile == "") return false;
        try {
            data = JSON.parse(text);
        } catch(e) {
            console.log('Error parsing json:', e);
            // set page title
            alertDiv.innerHTML += "Can't parse JSON:<br><a href='"+testsFile+"'>"+testsFilename+"</a><br>"+e+"<br>";
            return false;
        }

        // extract test origin metadata
        try {
            metadata = data.origin;
        } catch (e) {
            alertDiv.innerHTML += "Can't parse JSON metadata: <a href='"+testsFile+"'>"+testsFilename+"</a><br>";
        }

        // convert tests to an array for easier traversal
        views = Object.keys(data.tests).map(function (key) {
            // add test's name as a property of the test
            data.tests[key].name = key;
            return data.tests[key];
        });

        // clone views array
        queue = views.slice(0);
        nextView = parseView(queue.shift()); // pop first and parse location

        // then initialize Tangram with the first view
        map = (function () {
            var map_start_location = nextView.location;

            /*** Map ***/

            var map = L.map('map', {
                keyboardZoomOffset : .05,
                zoomControl: false,
                attributionControl : false
            });

            var layer = Tangram.leafletLayer({
                scene: nextView.url,
                // highDensityDisplay: false
            });

            window.layer = layer;
            var scene = layer.scene;
            window.scene = scene;

            // setView expects format ([lat, long], zoom)
            map.setView(map_start_location.slice(0, 3), map_start_location[2]);

            layer.addTo(map);
            
            return map;

        }());

        // subscribe to Tangram's published view_complete event to
        // load the next scene when the current scene is done drawing
        scene.subscribe({
            view_complete: function () {
                // console.log('nextView:', nextView);
                if (nextView) {
                    // when prep is done, screenshot is made, and oldImg is loaded...
                    Promise.all([prep,screenshot(write),loadOld(imgDir+nextView.name+imgType)]).then(function() {
                        // perform the diff
                        doDiff(nextView);
                        // move along
                        if (queue.length > 0) {
                            nextView = parseView(queue.shift()); // pop first and parse location
                            loadView(nextView);
                        } else return;
                    });
                } else {
                    console.log('view_complete, no nextView');
                    return viewComplete();
                }
            }
        });

        // set page title
        alertDiv.innerHTML += "Now diffing: <a href='"+testsFile+"'>"+testsFilename+"</a><br>";

    });

    // set sizes
    document.getElementById("map").style.height = size+"px";
    document.getElementById("map").style.width = size+"px";

    // set up canvases

    // make canvas for the old image
    oldCanvas = document.createElement('canvas');
    oldCanvas.height = lsize;
    oldCanvas.width = lsize;
    oldCtx = oldCanvas.getContext('2d');

    // make a canvas for the newly-drawn map image
    newCanvas = document.createElement('canvas');
    newCanvas.height = lsize;
    newCanvas.width = lsize;
    newCtx = newCanvas.getContext('2d');

    // make a canvas for the diff
    diffCanvas = document.createElement('canvas');
    diffCanvas.height = lsize;
    diffCanvas.width = lsize;
    diffCtx = diffCanvas.getContext('2d');
    diff = diffCtx.createImageData(lsize, lsize);

    resolve();
});

// load an image asynchronously with a Promise
function loadImage (url, target) {
    return new Promise(function(resolve, reject) {
        var image = target || new Image();
        image.onload = function() {
            resolve({ url: url, image: image });
        };
        image.onerror = function(error) {
            resolve({ error: error });
        };
        image.crossOrigin = 'anonymous';
        // force-refresh any local images with a cache-buster
        if (url.slice(-4) == imgType) url += "?" + new Date().getTime();
        image.src = url;
    });
}

// load the old image
function loadOld (img) {
    oldImg = new Image();
    return loadImage(img).then(function(result){
        if (result.url) {
            // set the old image to be drawn to the canvas once the image loads
            oldImg = result.image;
            oldCtx.drawImage(oldImg, 0, 0, oldImg.width, oldImg.height, 0, 0, oldCanvas.width, oldCanvas.height);
            // make the data available to pixelmatch
            oldData = oldCtx.getImageData(0, 0, lsize, lsize);
        } else {
            oldImg.style.display = "none";
            oldData = null;
        }
        return result;
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
    images[test.name].diffImg = diffImg;
    images[test.name].strip = makeStrip([oldImg, newImg, diffImg], lsize);
};

function loadView (view) {
    // load and draw scene
    scene.load(view.url).then(function() {
        if (!view) return;
        scene.animated = false;
        map.setView([view.location[0], view.location[1]], view.location[2]);
        scene.requestRedraw();
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
        // window.location.href = ".#"+this.responseText;
    };
    xhr.send(data);
}

function stop() {
    console.log('stop button');
    nextView = false;
    queue = false;
}

// convert event to promise
function viewComplete () {
    console.log('viewComplete');
    return new Promise(function(resolve, reject) {
        console.log('viewComplete sent');
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
    testdiv.style.minHeight = size+"px";

    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test"
    var testlink = "http://tangrams.github.io/tangram-frame/?url="+test.url+"#"+test.location[2]+"/"+test.location[0]+"/"+test.location[1]
    title.innerHTML = "<a target='_blank' href='"+testlink+"'>"+test.name+"</a>";
    testdiv.appendChild(title);

    var oldcolumn = document.createElement('span');
    oldcolumn.className = 'column';
    oldcolumn.id = "old";
    oldcolumn.innerHTML = "old";
    testdiv.appendChild(oldcolumn);

    var newcolumn = document.createElement('span');
    newcolumn.className = 'column';
    newcolumn.id = "new";
    newcolumn.innerHTML = "new";
    testdiv.appendChild(newcolumn);

    var diffcolumn = document.createElement('span');
    diffcolumn.className = 'column';
    diffcolumn.id = "diff";
    diffcolumn.innerHTML = "diff";
    testdiv.appendChild(diffcolumn);

    // insert old and new images
    newImg.width = size;
    newImg.height = size;
    newcolumn.appendChild( newImg );
    
    oldImg.width = size;
    oldImg.height = size;
    oldcolumn.appendChild( oldImg );

    // CONTROLS //

    var controls = document.createElement('div');
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
        makeGif([images[test.name].oldImg, images[test.name].newImg]);
    };
    controls.appendChild(exportGifButton);


}

function makeStrip(images, size) {
    var c = document.createElement('canvas');
    c.width = size*images.length;
    c.height = size;
    var ctx=c.getContext("2d");
    for (var x = 0; x < images.length; x++) {
        ctx.drawImage(images[x], size * x, 0, size, size);
    }
    return c.toDataURL("image/png");
}

function makeGif(images) {
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
        window.open(URL.createObjectURL(blob));
    });

    gif.render();
}

function popup(img, width, height) {
    var data = '<img width='+width+' height='+height+' src="' + img + '"/>';
    var myWindow = window.open("data:text/html," + encodeURIComponent(data));
}

function makeContactSheet() {
    var c = document.createElement('canvas');
    c.width = lsize*3;
    c.height = lsize*views.length;
    var ctx=c.getContext("2d");

    // assemble strips
    var i = 0;
    var l = Object.keys(images).length;
    var loaded = 0;
    for (var x in images) {
        console.log(i, x, '>');
        var img = new Image();
        img.i = i;
        img.id = x;
        img.onload = function() {
            console.log(this.i, this.id, 'loaded');
            // ctx.drawImage(this, 0, lsize * i, lsize * 3, lsize);
            // ctx.drawImage(this, 0, lsize * this.i);
            ctx.drawImage(this, 0, lsize * this.i);
            // if that's the last image, write the whole thing out
            console.log(this.i, l);
            if (loaded == l - 1) {
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

function rerunAll() {
    console.log('refresh all button');
    tests.innerHTML = "";
    totalScoreDiv.innerHTML = "";
    nextView = false;
    totalSum = 0;
    totalScore = 0;
    queue = views.slice(0);
    startRender();
}

function refresh(test) {
    queue.push(test);
    startRender();
}

function startRender() {
    // if map is rendering, wait for it to finish, then start over
    Promise.all([viewComplete]).then(function() {
        // move along
        nextView = queue.shift()
        loadView(nextView);
    });
}

