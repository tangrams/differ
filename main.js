/*jslint browser: true*/
/*global Tangram, gui */

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
        postUpdate: postUpdate,
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
    
    window.queue_screenshot = false;

    // Post-render hook
    function postUpdate () {
        // Screenshot needs to happen in the requestAnimationFrame callback, or the frame buffer might already be cleared
        if (queue_screenshot == true) {
            queue_screenshot = false;
            screenshot();
        }
    }

    return map;

}());

// var img1Ctx, img1;
var buf, mapImageURL, newimg;

// Take a screenshot and save file
function screenshot() {
    // Adapted from: https://gist.github.com/unconed/4370822
    mapImageURL = scene.canvas.toDataURL('image/png');
    newimg = document.createElement('img');
    newimg.src = mapImageURL;

    var image = mapImageURL.slice(22); // slice strips host/mimetype/etc.

    var data = atob(image); // convert base64 to binary without UTF-8 mangling
    buf = new Uint8Array(data.length);
    for (var i = 0; i < data.length; ++i) {
        buf[i] = data.charCodeAt(i);
    }
    var blob = new Blob([buf], { type: 'image/png' });
    saveAs(blob, 'tangram-' + (+new Date()) + '.png'); // uses FileSaver.js: https://github.com/eligrey/FileSaver.js/
}

setTimeout(function() {
    queue_screenshot = true;
    scene.requestRedraw();
}, 1500);

setTimeout(function() {

    // var oldimg = document.getElementById('myimg');
    var oldimg = document.createElement('img');
    oldimg.src = 'tangram-1452283152715.png';
    var oldcanvas = document.createElement('canvas');
    oldcanvas.height = 500;
    oldcanvas.width = 500;
    var oldCtx = oldcanvas.getContext('2d');
    oldCtx.drawImage(oldimg, 0, 0, oldimg.width, oldimg.height, 0, 0, oldcanvas.width, oldcanvas.height);
    // oldCtx.drawImage(oldimg, 0, 0, oldimg.width, oldimg.height, 0, 0, oldcanvas);
    // oldCtx.drawImage(oldimg, 0, 0);
    var oldData = oldCtx.getImageData(0, 0, 500, 500);

    var newcanvas = document.createElement('canvas');
    newcanvas.height = 500;
    newcanvas.width = 500;
    var newCtx = newcanvas.getContext('2d');
    newCtx.drawImage(newimg, 0, 0, newimg.width, newimg.height, 0, 0, newcanvas.width, newcanvas.height);
    // newCtx.drawImage(newimg, 0, 0);
    var newData = newCtx.getImageData(0, 0, 500, 500);

    var diffcanvas = document.createElement('canvas');
    diffcanvas.height = 500;
    diffcanvas.width = 500;
    var diffCtx = diffcanvas.getContext('2d');
    var diff = diffCtx.createImageData(500, 500);

    pixelmatch(newData.data, oldData.data, diff.data, 500, 500, {threshold: 0.1});

    diffCtx.putImageData(diff, 0, 0);
    document.getElementById("diff").appendChild(diffcanvas);
    
}, 2000);

