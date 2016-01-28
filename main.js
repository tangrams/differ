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

var tests = document.getElementById("tests");

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

        // then initialize Tangram with the first view
        map = (function () {
            // console.log('views:', views);
            var firstview = queue[0];
            // console.log('firstview', firstview.location);
            var map_start_location = firstview.location;

            /*** Map ***/

            var map = L.map('map', {
                keyboardZoomOffset : .05,
                zoomControl: false,
                attributionControl : false
            });

            var layer = Tangram.leafletLayer({
                scene: firstview.url,
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
                if (v < views.length) {
                    // when prep is done, screenshot is made, and oldImg is loaded...
                    Promise.all([prep,screenshot(),loadOld(imgDir+views[v].name+imgType)]).then(function() {
                        // perform the diff
                        doDiff(views[v]);
                        // move along
                        nextView();
                    });
                }
            }
        });

        // set page title
        document.getElementById('title').innerHTML = testsFile;

    });

    // set sizes
    document.getElementById("map").style.height = size+"px";
    document.getElementById("map").style.width = size+"px";

    // document.getElementById("new").style.width = size+"px";
    // document.getElementById("old").style.width = size+"px";
    // document.getElementById("diff").style.width = size+"px";

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
        image.src = url;
    });
}


// load the old image
var oldImg = new Image();
function loadOld (img) {
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
        if (save) saveAs(data.blob, views[v].name);

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
    var diffValue = Math.round(difference/(size*size)*100*100)/100;
    // put the diff in its canvas
    diffCtx.putImageData(diff, 0, 0);

    var testdiv = document.createElement('div');
    testdiv.className = 'test';

    var title = document.createElement('div');
    title.className = 'header';
    title.innerHTML = test.name;

    testdiv.appendChild(title);

    var columns = document.createElement('div');
    columns.className = 'columns';

        var oldcolumn = document.createElement('div');
        oldcolumn.className = 'column';
        oldcolumn.innerHTML = "old";
        columns.appendChild(oldcolumn);

        var newcolumn = document.createElement('div');
        newcolumn.className = 'column';
        newcolumn.innerHTML = "new";
        columns.appendChild(newcolumn);

        var diffcolumn = document.createElement('div');
        diffcolumn.className = 'column';
        diffcolumn.innerHTML = "diff";
        columns.appendChild(diffcolumn);

        var controls = document.createElement('div');
        controls.className = 'controls';
        var diffPercent = 100 - Math.ceil(diffValue);
        var threatLevel = diffPercent > 99 ? "green" : diffPercent > 98 ? "orange" : "red";
        controls.innerHTML = "controls<br><div style='font-size: 48pt;color:"+threatLevel+"'>"+diffPercent+"% match</div><br>";

            var refreshButton =  document.createElement('button');
            refreshButton.innerHTML = "refresh " + test.name;
            controls.appendChild(refreshButton);

            var exportButton =  document.createElement('button');
            exportButton.innerHTML = "export " + test.name;
            controls.appendChild(exportButton);

            var exportAllButton =  document.createElement('button');
            exportAllButton.innerHTML = "export all";
            controls.appendChild(exportAllButton);

        columns.appendChild(controls);

    testdiv.appendChild(columns);

    testdiv.id = test.name;
    tests.insertBefore(testdiv, tests.firstChild);

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

    
};

// setup view counter
var v = 0;

function nextView () {
    v++;
    if (v < views.length) {
        var view = views[v];
        // load and draw scene
        scene.load(view.url).then(function() {
            scene.animated = false;
            map.setView([view.location[0], view.location[1]], view.location[2]);
            scene.requestRedraw();
        });
    }
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
    v = views.length;
}

function refreshAll() {
    console.log('refresh all button');
    v = -1;
    tests.innerHTML = "";
    setTimeout(function() {nextView()}, 500);
}