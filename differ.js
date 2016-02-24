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
var tests = document.getElementById("tests");
var alertDiv = document.getElementById("alert");
var statusDiv = document.getElementById("status");
var totalScoreDiv = document.getElementById("totalScore");

// parse URL to check for test json passed in the query
// eg: http://localhost:8080/?test.json
function getValuesFromUrl() {
    var url_query = window.location.search.slice(1, window.location.search.length);
    if (url_query != "") return url_query;
    else return testsFile;
}

testsFile = getValuesFromUrl();
var testsDir = "";
console.log('testsFile', testsFile);
var parseURL = document.createElement('a');
parseURL.href = testsFile;
console.log('testsDir', parseURL.host, parseURL.pathname);


document.getElementById("loadtext").onkeypress = function(e){
    if (!e) e = window.event;
    var keyCode = e.keyCode || e.which;
    if (keyCode == '13'){
        // Enter pressed
        loadButton();
        return false;
    }
}

// load file
function readTextFile(file, callback) {
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    rawFile.open("GET", file, true);
    rawFile.onreadystatechange = function() {
        // console.log('readyState:', rawFile.readyState);
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            // console.log('rawFile.responseText:', rawFile.responseText);
            callback(rawFile.responseText);
        }
        else if (rawFile.readyState === 4 && rawFile.status == "404") {
            console.error("404 – can't load file", file);
            // set page title
            alertDiv.innerHTML = "404 - can't load file:<br><a href='"+testsFile+"'>"+testsFile+"</a>";
        }

    }
    rawFile.send(null);
}

function parseView(view) {
    // console.log('view:', view);
    if (Object.prototype.toString.call(view["location"]) === '[object Array]') {
        return view; // no parsing needed
    } else if (typeof(view["location"]) === "string") { 
        // parse string location as array of floats
        var location = view["location"].split(/[ ,]+/);
        location = location.map(parseFloat);
        view["location"] = location;
        return view;
    } else {
        console.log("Can't parse location:", view);
    }
}

// setup divs and canvases
var prep = new Promise( function (resolve, reject) {
    // load and parse test json
    readTextFile(testsFile, function(text){
        if (testsFile == "") return false;
        try {
            var data = JSON.parse(text);
        } catch(e) {
            console.log('e:', e);
            // set page title
            alertDiv.innerHTML = "Can't parse JSON:<br><a href='"+testsFile+"'>"+testsFile+"</a>";
            return false;
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
            // console.log('views:', views);
            // console.log('nextView', nextView.location);
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
                    Promise.all([prep,screenshot(true),loadOld(imgDir+nextView.name+imgType)]).then(function() {
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
        alertDiv.innerHTML = "Now diffing:<br><a href='"+testsFile+"'>"+testsFile+"</a>";

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
            oldData = null;
        }
        return result;
    });
};

// take a screenshot
function screenshot (save) {
    return scene.screenshot().then(function(data) {
        // save it to a file
        if (save) saveAs(data.blob, nextView.name);

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
    totalScoreDiv.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</div><br>";

    // make an output row
    makeRow(test, matchScore);

    images[test.name] = {};
    images[test.name].oldImg = oldImg;
    images[test.name].newImg = newImg;
    images[test.name].diffImg = diffImg;
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

// save a file with a POST request to the server
function saveAs( file, filename ) {
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
    title.innerHTML = test.name;
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
        var img = makeStrip([images[test.name].oldImg, images[test.name].newImg, images[test.name].diffImg], lsize);
        popup(img, size * 3, size);
    };
    controls.appendChild(exportButton);

    var exportGifButton =  document.createElement('button');
    exportGifButton.innerHTML = "make GIF";
    exportGifButton.onclick = function() {
        var img = makeGif([images[test.name].oldImg, images[test.name].newImg]);
    };
    controls.appendChild(exportGifButton);


}

function makeStrip(images, size) {
    var c = document.createElement('canvas');
    c.width = size*images.length;
    c.height = size;
    var ctx=c.getContext("2d");
    for (var x in images) {
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

    for (var y in images) {
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
    var i = 0;
    for (var x in images) {
        var img = new Image();
        if (!images.hasOwnProperty(x)) continue; // sigh
        var strip = makeStrip([images[x].oldImg, images[x].newImg, images[x].diffImg], lsize);
        img.src = strip;
        ctx.drawImage(img, 0, lsize * i, lsize * 3, lsize);
        i++;
    }
    var sheet = c.toDataURL("image/png");
    popup(sheet, size * 3, size * images.length);
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

