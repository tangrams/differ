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
        postUpdate: postUpdate
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
var buf;
// Take a screenshot and save file
function screenshot() {
    // Adapted from: https://gist.github.com/unconed/4370822
    var image = scene.canvas.toDataURL('image/png').slice(22); // slice strips host/mimetype/etc.

    // img1Ctx = scene.canvas.getContext("2d");
    // console.log('img1Ctx:', img1Ctx);
    // img1 = img1Ctx.getImageData(0, 0, 250, 250);


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
}, 1000);

setTimeout(function() {

    var newcanvas = document.createElement('canvas');
    var img2Ctx = newcanvas.getContext('2d');
    var img = document.getElementById('myimg');
    img2Ctx.drawImage(img, 0, 0 );
    var img2 = img2Ctx.getImageData(0, 0, img.width, img.height);

    var diffcanvas = document.createElement('canvas');
    var diffCtx = diffcanvas.getContext('2d');


    // var img1 = img1Ctx.getImageData(0, 0, 250, 250),
    //     img2 = img2Ctx.getImageData(0, 0, 250, 250),
    var diff = diffCtx.createImageData(250, 250);

    pixelmatch(buf, img2.data, diff.data, 250, 250, {threshold: 0.1});

    diffCtx.putImageData(diff, 0, 0);
    document.getElementById("diff").appendChild(diffcanvas);
}, 2000);

