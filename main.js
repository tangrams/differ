/*jslint browser: true*/
/*global Tangram, gui */


// initialize variables
var newimg, oldData, size = 500;

// set sizes
document.getElementById("map").style.height = size+"px";
document.getElementById("map").style.width = size+"px";

document.getElementById("old").style.height = size+"px";
document.getElementById("old").style.width = size+"px";

document.getElementsByClassName("container")[0].style.height = size+"px";
document.getElementsByClassName("container")[0].style.width = size+"px";


map = (function () {
    'use strict';

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

    var map = L.map('map',
        {keyboardZoomOffset : .05,
         zoomControl: false,
         attributionControl : false}
    );

    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        // highDensityDisplay: false
    });

    window.layer = layer;
    var scene = layer.scene;
    window.scene = scene;

    // setView expects format ([lat, long], zoom)
    map.setView(map_start_location.slice(0, 3), map_start_location[2]);

    var hash = new L.Hash(map);


    /***** Render loop *****/

    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {
        });
        layer.addTo(map);
    });
    
    return map;

}());

// draw old image
var oldimg = new Image();
// make a canvas for the old image once the image loads
var oldcanvas = document.createElement('canvas');
oldcanvas.height = size;
oldcanvas.width = size;
var oldCtx = oldcanvas.getContext('2d');

// set the old image to be drawn to the canvas once the image loads
oldimg.addEventListener('load', function () {
    oldCtx.drawImage(oldimg, 0, 0, oldimg.width, oldimg.height, 0, 0, oldcanvas.width, oldcanvas.height);
    // document.getElementById("old").appendChild(oldcanvas);
    // make the data available to pixelmatch
    oldData = oldCtx.getImageData(0, 0, size, size);
});
// load the image
oldimg.src = 'tangram-1452283152715.png';

// make a canvas for the newly-drawn map image
var newcanvas = document.createElement('canvas');
newcanvas.height = size;
newcanvas.width = size;
var newCtx = newcanvas.getContext('2d');

// make a canvas for the diff
var diffcanvas = document.createElement('canvas');
diffcanvas.height = size;
diffcanvas.width = size;
var diffCtx = diffcanvas.getContext('2d');
var diff = diffCtx.createImageData(size, size);



// Take a screenshot and save file
function screenshot() {
    return scene.screenshot().then(function(screenshot) {
        saveAs(screenshot.blob, 'tangram-' + (+new Date()) + '.png');

        var urlCreator = window.URL || window.webkitURL;
        newimg = document.createElement('img');
        newimg.src = urlCreator.createObjectURL( screenshot.blob );
    });
}

// give the scene time to draw, then queue a screenshot
setTimeout(function() {
    screenshot();
}, 1500);

// and perform the image comparison
setTimeout(function() {

    // draw map image so it fits the new canvas size (in case it's retina)
    newCtx.drawImage(newimg, 0, 0, newimg.width, newimg.height, 0, 0, newcanvas.width, newcanvas.height);
    // make the data available
    var newData = newCtx.getImageData(0, 0, size, size);

    // run the diff
    pixelmatch(newData.data, oldData.data, diff.data, size, size, {threshold: 0.3});

    // put the diff in its canvas
    diffCtx.putImageData(diff, 0, 0);

    // make imgs for new, old, and diff and attach them to the document
    oldimg.width = size;
    oldimg.height = size;
    document.getElementById("old").insertBefore( oldimg, document.getElementById("old").firstChild );


    diffimg = document.createElement('img');
    diffimg.src = diffcanvas.toDataURL("image/png");
    document.getElementById("diff").insertBefore( diffimg, document.getElementById("diff").firstChild );
    
}, 2000);

