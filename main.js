"use strict";
/*jslint browser: true*/
/*global Tangram, gui */

// initialize variables
var views, map,
    newimg, newcanvas, newCtx, newData,
    oldimg, oldcanvas, oldCtx, oldData,
    diffcanvas, diffCtx, diff;
var testFile = "views.json";
var size = 250;

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

// load and parse test json
readTextFile(testFile, function(text){
    var data = JSON.parse(text);
    // convert tests to an array for easier traversal
    views = Object.keys(data.tests).map(function (key) {
        // add test's name as a property of the test
        data.tests[key].name = key;
        return data.tests[key];
    });
});

// setup divs and canvases
var prep = new Promise( function (resolve, reject) {
    // set sizes
    document.getElementById("map").style.height = size+"px";
    document.getElementById("map").style.width = size+"px";

    document.getElementById("old").style.height = size+"px";
    document.getElementById("old").style.width = size+"px";

    document.getElementsByClassName("container")[0].style.height = size+"px";
    document.getElementsByClassName("container")[0].style.width = size+"px";

    // set up canvases

    // make canvas for the old image
    oldcanvas = document.createElement('canvas');
    oldcanvas.height = size;
    oldcanvas.width = size;
    oldCtx = oldcanvas.getContext('2d');

    // make a canvas for the newly-drawn map image
    newcanvas = document.createElement('canvas');
    newcanvas.height = size;
    newcanvas.width = size;
    newCtx = newcanvas.getContext('2d');

    // make a canvas for the diff
    diffcanvas = document.createElement('canvas');
    diffcanvas.height = size;
    diffcanvas.width = size;
    diffCtx = diffcanvas.getContext('2d');
    diff = diffCtx.createImageData(size, size);

    map = (function () {
        var map_start_location = [40.70531887544228, -74.00976419448853, 15]; // NYC

        /*** URL parsing ***/

        // leaflet-style URL hash pattern:
        // #[zoom],[lat],[lng]
        var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

        if (url_hash.length == 3) {
            map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
            // convert from strings
            map_start_location = map_start_location.map(Number);
        }

        /*** Map ***/

        var map = L.map('map', {
            keyboardZoomOffset : .05,
            zoomControl: false,
            attributionControl : false
        });

        var layer = Tangram.leafletLayer({
            scene: 'scene.yaml',
            // highDensityDisplay: false
        });

        window.layer = layer;
        var scene = layer.scene;
        window.scene = scene;

        // setView expects format ([lat, long], zoom)
        map.setView(map_start_location.slice(0, 3), map_start_location[2]);

        // var hash = new L.Hash(map);

        layer.addTo(map);
        
        return map;

    }());

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
var oldimg = new Image();
function loadOld (img) {
    return loadImage(img).then(function(result){
        if (result.url) {
            // set the old image to be drawn to the canvas once the image loads
            oldimg = result.image;
            oldCtx.drawImage(oldimg, 0, 0, oldimg.width, oldimg.height, 0, 0, oldcanvas.width, oldcanvas.height);
        }
        // make the data available to pixelmatch
        oldData = oldCtx.getImageData(0, 0, size, size);
        return result;
    });
};

// take a screenshot
function screenshot () {
    return scene.screenshot().then(function(data) {
        // save it to a file
        // saveAs(data.blob, views[v].name+'.png');

        // testing
        // saveAs(data.blob, 'tangram-' + (+new Date()) + '.png');

        var urlCreator = window.URL || window.webkitURL;
        newimg = new Image();
        return loadImage(urlCreator.createObjectURL( data.blob ), newimg);
    });
};

// perform the image comparison
function doDiff() {
    // save the new image to the new canvas, stretching it to fit (in case it's retina)
    newCtx.drawImage(newimg, 0, 0, newimg.width, newimg.height, 0, 0, newcanvas.width, newcanvas.height);
    // make the data available
    var newData = newCtx.getImageData(0, 0, size, size);

    // run the diff
    pixelmatch(newData.data, oldData.data, diff.data, size, size, {threshold: 0.1});

    // put the diff in its canvas
    diffCtx.putImageData(diff, 0, 0);

    // make imgs for new, old, and diff and attach them to the document
    newimg.width = size;
    newimg.height = size;
    document.getElementById("new").insertBefore( newimg, document.getElementById("new").firstChild );

    oldimg.width = size;
    oldimg.height = size;
    document.getElementById("old").insertBefore( oldimg, document.getElementById("old").firstChild );

    var diffimg = document.createElement('img');
    diffimg.src = diffcanvas.toDataURL("image/png");
    document.getElementById("diff").insertBefore( diffimg, document.getElementById("diff").firstChild );
    
};

var v = -1;

function nextView () {
    v++;
    if (v < views.length) {
        var view = views[v];
        scene.load(view.url).then(function() {
            scene.animated = false;
            map.setView([view.location[0], view.location[1]], view.location[2]);
            scene.requestRedraw();
        });
    }
}

scene.subscribe({
    view_complete: function () {
        // if the default scene rendered, move to the next one
        if (v < 0) { return nextView();}
        if (v < views.length) {
            // when prep is done, screenshot is made, and oldimg is loaded...
            Promise.all([prep,screenshot(),loadOld(views[v].name+'.png')]).then(function() {
                // perform the diff
                doDiff();
                nextView();
            });
        }
    }
});

