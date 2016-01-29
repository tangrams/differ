"use strict";
/*jslint browser: true*/
/*global Tangram, gui */

// initialize variables
var map, views, queue, nextView,
    newImg, newCanvas, newCtx, newData,
    oldImg, oldCanvas, oldCtx, oldData,
    diffCanvas, diffCtx, diff;
var testsFile = "./views.json";
var imgDir = "images/";
var imgType = ".png";
var size = 250; // pixels
var scores = [], totalScore = 0;
var tests = document.getElementById("tests");
var statusDiv = document.getElementById("status");
var totalScoreDiv = document.getElementById("totalScore");

// load file
function readTextFile(file, callback) {
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    rawFile.open("GET", file, true);
    rawFile.onreadystatechange = function() {
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            callback(rawFile.responseText);
        }
    }
    rawFile.send(null);
}

// setup divs and canvases
var prep = new Promise( function (resolve, reject) {

    // load and parse test json
    readTextFile(testsFile, function(text){
        var data = JSON.parse(text);
        // convert tests to an array for easier traversal
        views = Object.keys(data.tests).map(function (key) {
            // add test's name as a property of the test
            data.tests[key].name = key;
            return data.tests[key];
        });

        // clone views array
        queue = views.slice(0);
        nextView = queue.shift(); // pop first
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
                            nextView = queue.shift(); // pop first
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
        document.getElementById('title').innerHTML = testsFile;

    });

    // set sizes
    document.getElementById("map").style.height = size+"px";
    document.getElementById("map").style.width = size+"px";

    // set up canvases

    // make canvas for the old image
    oldCanvas = document.createElement('canvas');
    oldCanvas.height = size;
    oldCanvas.width = size;
    oldCtx = oldCanvas.getContext('2d');

    // make a canvas for the newly-drawn map image
    newCanvas = document.createElement('canvas');
    newCanvas.height = size;
    newCanvas.width = size;
    newCtx = newCanvas.getContext('2d');

    // make a canvas for the diff
    diffCanvas = document.createElement('canvas');
    diffCanvas.height = size;
    diffCanvas.width = size;
    diffCtx = diffCanvas.getContext('2d');
    diff = diffCtx.createImageData(size, size);

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
        if (url.slice(-4) == ".png") url += "?" + new Date().getTime();
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
        }
        // make the data available to pixelmatch
        oldData = oldCtx.getImageData(0, 0, size, size);
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
    // save the new image to the new canvas, stretching it to fit (in case it's retina)
    newCtx.drawImage(newImg, 0, 0, newImg.width, newImg.height, 0, 0, newCanvas.width, newCanvas.height);
    // make the data available
    var newData = newCtx.getImageData(0, 0, size, size);

    // run the diff
    var difference = pixelmatch(newData.data, oldData.data, diff.data, size, size, {threshold: 0.1});

    // UPDATE READOUTS
    var count = views.length-queue.length;
    statusDiv.innerHTML = count + " of " + views.length;

    // calculate match percentage
    var match = 100-(difference/(size*size)*100*100)/100;
    var matchScore = Math.floor(match);

    // update master percentage
    scores[test.name] = match;
    var totalSum = 0;
    for (var v in scores) {
        totalSum += scores[v];
    }
    totalScore = Math.floor(totalSum/(100*count)*100);
    var threatLevel = totalScore > 99 ? "green" : totalScore > 98 ? "orange" : "red";
    totalScoreDiv.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</div><br>";

    // put the diff in its canvas
    diffCtx.putImageData(diff, 0, 0);

    // make an output row
    makeRow(test, matchScore);
};

function loadView (view) {
    // load and draw scene
    scene.load(view.url).then(function() {
        // if (view) console
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

    if (testdiv === null) {
        // generate test output row
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

    // per-test controls
    var controls = document.createElement('div');
    testdiv.appendChild(controls);

    controls.className = 'controls';
    var threatLevel = matchScore > 99 ? "green" : matchScore > 98 ? "orange" : "red";
    controls.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+matchScore+"% match</div><br>";

        var refreshButton =  document.createElement('button');
        refreshButton.innerHTML = "refresh " + test.name;
        controls.appendChild(refreshButton);
        refreshButton.onclick = function() {refresh(test);}

        var exportButton =  document.createElement('button');
        exportButton.innerHTML = "export " + test.name;
        // controls.appendChild(exportButton);

        var exportStripButton =  document.createElement('button');
        exportStripButton.innerHTML = "export strip";
        exportStripButton.onclick = "export strip";
        // controls.appendChild(exportStripButton);

        var exportGifButton =  document.createElement('button');
        exportGifButton.innerHTML = "export gif";
        // controls.appendChild(exportGifButton);

    // make imgs for new, old, and diff and attach them to the document
    newImg.width = size;
    newImg.height = size;
    newcolumn.appendChild( newImg );
    
    oldImg.width = size;
    oldImg.height = size;
    oldcolumn.appendChild( oldImg );

    var diffimg = document.createElement('img');
    diffimg.src = diffCanvas.toDataURL("image/png");
    diffcolumn.appendChild( diffimg );

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
    // console.log('refreshing:', test);
    // var testdiv = document.getElementById(test.name);
    // testdiv.innerHTML = "";
    queue = [test];
    startRender();
}

function startRender() {
    // if map is rendering, wait for it to finish, then start over
    Promise.all([viewComplete]).then(function() {
        // console.log('viewComplete received');
        // move along
        nextView = queue.shift()
        loadView(nextView);
    });
}